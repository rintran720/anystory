import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { cleanGeneratedStory } from "../utils.js";
import type { TtsProgressEvent } from "../types.js";

async function exists(file: string) {
  try { await fs.access(file); return true; } catch { return false; }
}

function cleanText(text: string) {
  // Reuses the story pipeline's cleanup (bullets/blockquote stripped first) then
  // strips remaining single-star/underscore italics — must run after, since running
  // italics first can greedily swallow text between an unrelated bullet "*" and a
  // later stray "*".
  return cleanGeneratedStory(text.replace(/\r/g, ""))
    .replace(/(?<!\w)\*(.*?)\*(?!\w)/gs, "$1")
    .replace(/(?<!\w)_(.*?)_(?!\w)/gs, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitText(text: string, maxChars = 450) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const result: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      result.push(paragraph);
      continue;
    }

    const sentences =
      paragraph.match(/[^.!?…]+[.!?…]+(?:["”»']+)?|[^.!?…]+$/g) ??
      [paragraph];

    let current = "";

    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;

      if (current && current.length + 1 + s.length > maxChars) {
        result.push(current);
        current = s;
      } else {
        current += (current ? " " : "") + s;
      }
    }

    if (current) result.push(current);
  }

  return result;
}

interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  data: Buffer;
}

function parseWav(buf: Buffer, filePath: string): WavInfo {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw Error(`Not a valid WAV file: ${filePath}`);
  }

  let offset = 12;
  let fmt: { channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let data: Buffer | null = null;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      fmt = {
        channels: buf.readUInt16LE(chunkStart + 2),
        sampleRate: buf.readUInt32LE(chunkStart + 4),
        bitsPerSample: buf.readUInt16LE(chunkStart + 14)
      };
    } else if (chunkId === "data") {
      data = buf.subarray(chunkStart, chunkStart + chunkSize);
    }

    offset = chunkStart + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (!fmt || !data) throw Error(`WAV file missing fmt/data chunk: ${filePath}`);
  return { ...fmt, data };
}

function buildWavHeader(dataLength: number, channels: number, sampleRate: number, bitsPerSample: number): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);

  return header;
}

async function concatWavFiles(audioFiles: string[], outputPath: string, silenceGapMs: number) {
  const wavs = await Promise.all(
    audioFiles.map(async f => parseWav(await fs.readFile(f), f))
  );

  const { channels, sampleRate, bitsPerSample } = wavs[0];
  const bytesPerFrame = channels * (bitsPerSample / 8);
  const silenceFrames = Math.max(0, Math.round((silenceGapMs / 1000) * sampleRate));
  const silence = Buffer.alloc(silenceFrames * bytesPerFrame); // zeroed bytes = silence

  const parts: Buffer[] = [];
  wavs.forEach((w, i) => {
    parts.push(w.data);
    if (i < wavs.length - 1 && silenceFrames > 0) parts.push(silence);
  });

  const dataBuf = Buffer.concat(parts);
  const header = buildWavHeader(dataBuf.length, channels, sampleRate, bitsPerSample);
  await fs.writeFile(outputPath, Buffer.concat([header, dataBuf]));
}

async function createManifest(storyDir: string) {
  const ttsDir = path.join(storyDir, "tts");
  const manifestPath = path.join(ttsDir, "manifest.json");
  await fs.mkdir(ttsDir, { recursive: true });

  const finalStory = path.join(storyDir, "final_story.txt");
  let source = "";

  if (await exists(finalStory)) {
    source = await fs.readFile(finalStory, "utf8");
  } else {
    const files = (await fs.readdir(storyDir))
      .filter(x => /^chapter-\d+\.txt$/i.test(x))
      .sort(
        (a, b) =>
          Number(a.match(/\d+/)?.[0] ?? 0) -
          Number(b.match(/\d+/)?.[0] ?? 0)
      );

    if (!files.length) {
      throw Error(`No final_story.txt or chapter-*.txt found in ${storyDir}`);
    }

    source = (
      await Promise.all(
        files.map(f => fs.readFile(path.join(storyDir, f), "utf8"))
      )
    ).join("\n\n");
  }

  const cleaned = cleanText(source);
  if (!cleaned) throw Error("Story is empty after cleaning.");

  const segments = splitText(cleaned).map((text, i) => ({
    id: i + 1,
    text,
    output: path.join("audio", `${String(i + 1).padStart(4, "0")}.wav`)
  }));

  return { manifestPath, ttsDir, segments };
}

export interface TTSOptions {
  pythonCommand: string;
  voice: string;
  refAudio: string;
  refText?: string;
  pipeOutput?: boolean;
  silenceGapMs?: number;
}

export async function runTTS(
  storyDir: string,
  opts: TTSOptions,
  onProgress?: (e: TtsProgressEvent) => void
) {
  const { manifestPath, ttsDir, segments } = await createManifest(storyDir);

  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 2,
        engine: "VieNeu-TTS",
        mode: "voice-cloning",
        voice: opts.voice,
        refAudio: opts.refAudio,
        refText: opts.refText ?? "",
        segmentCount: segments.length,
        segments
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Created manifest: ${manifestPath}`);
  console.log(`Voice sample: ${opts.refAudio}`);
  console.log(`Prepared ${segments.length} segments.`);

  const worker = path.resolve("src/tts/worker.py");
  if (!(await exists(worker))) {
    throw Error(`Worker not found: ${worker}`);
  }

  if (!(await exists(opts.refAudio))) {
    throw Error(
      `Voice sample not found: ${opts.refAudio}\n` +
      `Put your sample at voices/minhthu.mp3 or set TTS_REF_AUDIO.`
    );
  }

  await new Promise<void>((resolve, reject) => {
    const args = [
      worker,
      "--manifest", manifestPath,
      "--voice", opts.voice,
      "--ref-audio", opts.refAudio
    ];

    if (opts.refText?.trim()) {
      args.push("--ref-text", opts.refText);
    }

    const p = spawn(opts.pythonCommand, args, {
      stdio: opts.pipeOutput ? ["ignore", "pipe", "pipe"] : "inherit",
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
    });

    if (opts.pipeOutput) {
      let buffer = "";
      p.stdout!.on("data", chunk => {
        process.stdout.write(chunk);
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const match = line.match(/^\[(\d+)\/(\d+)\]\s+(SKIP|TTS)\s+(.*)$/);
          if (match && onProgress) {
            onProgress({
              type: "segment",
              index: Number(match[1]),
              total: Number(match[2]),
              text: match[4],
              skipped: match[3] === "SKIP"
            });
          }
        }
      });

      p.stderr!.on("data", chunk => process.stderr.write(chunk));
    }

    p.on("error", reject);
    p.on("exit", code =>
      code === 0
        ? resolve()
        : reject(Error(`TTS worker exited with code ${code}`))
    );
  });

  const finalAudioPath = path.join(ttsDir, "final_audio.wav");
  const audioFiles = segments.map(s => path.join(ttsDir, s.output));
  console.log(`Merging ${audioFiles.length} segments (${opts.silenceGapMs ?? 500}ms gap)...`);
  await concatWavFiles(audioFiles, finalAudioPath, opts.silenceGapMs ?? 500);
  console.log(`Merged audio: ${finalAudioPath}`);

  onProgress?.({ type: "complete" });
  console.log(`TTS completed: ${ttsDir}`);
}

async function main() {
  const story = path.resolve(process.argv[2] ?? "");
  if (!story) throw Error("Usage: npm run tts -- .\\output\\idea");

  const refAudio = path.resolve(
    process.env.TTS_REF_AUDIO ?? "voices/minhthu.mp3"
  );
  const refText = process.env.TTS_REF_TEXT ?? "";

  await runTTS(story, {
    pythonCommand: config.tts.pythonCommand,
    voice: config.tts.voice,
    refAudio,
    refText,
    silenceGapMs: config.tts.silenceGapMs
  });
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
