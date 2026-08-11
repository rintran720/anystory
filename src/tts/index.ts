import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "../config.js";
import { cleanGeneratedStory } from "../utils.js";

const story = path.resolve(process.argv[2] ?? "");
if (!story) throw Error("Usage: npm run tts -- .\\output\\idea");

const pythonCommand = config.tts.pythonCommand;
const voice = config.tts.voice;

// Voice cloning sample.
// Default: <project-root>/voices/minhthu.mp3
const refAudio = path.resolve(
  process.env.TTS_REF_AUDIO ?? "voices/minhthu.mp3"
);

// Optional transcript of the reference audio.
// Recommended for better voice cloning quality.
const refText = process.env.TTS_REF_TEXT ?? "";

const ttsDir = path.join(story, "tts");
const manifest = path.join(ttsDir, "manifest.json");

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

async function createManifest() {
  await fs.mkdir(ttsDir, { recursive: true });

  const finalStory = path.join(story, "final_story.txt");
  let source = "";

  if (await exists(finalStory)) {
    source = await fs.readFile(finalStory, "utf8");
  } else {
    const files = (await fs.readdir(story))
      .filter(x => /^chapter-\d+\.txt$/i.test(x))
      .sort(
        (a, b) =>
          Number(a.match(/\d+/)?.[0] ?? 0) -
          Number(b.match(/\d+/)?.[0] ?? 0)
      );

    if (!files.length) {
      throw Error(
        `No final_story.txt or chapter-*.txt found in ${story}`
      );
    }

    source = (
      await Promise.all(
        files.map(f => fs.readFile(path.join(story, f), "utf8"))
      )
    ).join("\n\n");
  }

  const cleaned = cleanText(source);
  if (!cleaned) throw Error("Story is empty after cleaning.");

  const segments = splitText(cleaned).map((text, i) => ({
    id: i + 1,
    text,
    output: path.join(
      "audio",
      `${String(i + 1).padStart(4, "0")}.wav`
    )
  }));

  await fs.writeFile(
    manifest,
    JSON.stringify(
      {
        version: 2,
        engine: "VieNeu-TTS",
        mode: "voice-cloning",
        voice,
        refAudio,
        refText,
        segmentCount: segments.length,
        segments
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Created manifest: ${manifest}`);
  console.log(`Voice sample: ${refAudio}`);
  console.log(`Prepared ${segments.length} segments.`);
}

async function runWorker() {
  const worker = path.resolve("src/tts/worker.py");

  if (!(await exists(worker))) {
    throw Error(`Worker not found: ${worker}`);
  }

  if (!(await exists(refAudio))) {
    throw Error(
      `Voice sample not found: ${refAudio}\n` +
      `Put your sample at voices/minhthu.mp3 or set TTS_REF_AUDIO.`
    );
  }

  await new Promise<void>((resolve, reject) => {
    const args = [
      worker,
      "--manifest", manifest,
      "--voice", voice,
      "--ref-audio", refAudio
    ];

    if (refText.trim()) {
      args.push("--ref-text", refText);
    }

    const p = spawn(pythonCommand, args, {
      stdio: "inherit"
    });

    p.on("error", reject);
    p.on("exit", code =>
      code === 0
        ? resolve()
        : reject(Error(`TTS worker exited with code ${code}`))
    );
  });
}

await createManifest();
await runWorker();

console.log(`TTS completed: ${ttsDir}`);
