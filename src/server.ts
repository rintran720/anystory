import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import { exists } from "./utils.js";
import { generateStory } from "./pipeline.js";
import { runTTS } from "./tts/index.js";
import { config } from "./config.js";
import type { ProgressEvent, TtsProgressEvent } from "./types.js";
import type { Config } from "./types.js";

const app = express();
app.use(express.json());
app.use(express.static(path.resolve("public")));
app.use("/output", express.static(path.resolve("output")));

function resolveUnder(root: string, name: string): string | null {
  const p = path.resolve(root, name);
  return p === root || p.startsWith(root + path.sep) ? p : null;
}

interface GenerateJob {
  name: string;
  status: "running" | "done" | "error" | "stopped";
  events: ProgressEvent[];
  abortRequested: boolean;
  error?: string;
}
let generateJob: GenerateJob | null = null;
const progressEmitter = new EventEmitter();

interface TTSJob {
  name: string;
  status: "running" | "done" | "error";
  events: TtsProgressEvent[];
  error?: string;
}
let ttsJob: TTSJob | null = null;
const ttsEmitter = new EventEmitter();

// --- routes ---

async function findIdeaFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findIdeaFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".txt")) {
      results.push(path.relative("stories", full).split(path.sep).join("/"));
    }
  }
  return results;
}

async function readJSONIfExists(file: string): Promise<any> {
  if (!(await exists(file))) return null;
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

app.get("/api/ideas", async (req, res) => {
  const dir = path.resolve("stories");
  const files = (await exists(dir)) ? await findIdeaFiles(dir) : [];
  res.json({ files });
});

app.get("/api/stories", async (req, res) => {
  const root = path.resolve("output");
  if (!(await exists(root))) return res.json({ stories: [] });

  const entries = await fs.readdir(root, { withFileTypes: true });
  const stories = await Promise.all(
    entries.filter(e => e.isDirectory()).map(async e => {
      const dir = path.join(root, e.name);
      const outline = await readJSONIfExists(path.join(dir, "outline.json"));
      const totalChapters = outline?.chapters?.length ?? 0;
      const dirFiles = await fs.readdir(dir).catch(() => []);
      const completedChapters = dirFiles.filter(f => /^chapter-\d+\.txt$/.test(f)).length;
      const hasFinalStory = await exists(path.join(dir, "final_story.txt"));
      const audioDir = path.join(dir, "tts", "audio");
      const hasAudio = (await exists(audioDir)) &&
        (await fs.readdir(audioDir)).some(f => f.endsWith(".wav"));

      const job = generateJob as GenerateJob | null;
      const isRunning = job !== null && job.name === e.name && job.status === "running";
      return {
        name: e.name,
        totalChapters,
        completedChapters,
        hasFinalStory,
        hasAudio,
        isRunning
      };
    })
  );

  res.json({ stories });
});

app.get("/api/stories/:name", async (req, res) => {
  const dir = resolveUnder(path.resolve("output"), req.params.name);
  if (!dir) return res.status(400).json({ error: "invalid name" });
  if (!(await exists(dir))) return res.status(404).json({ error: "story not found" });

  const bible = await readJSONIfExists(path.join(dir, "story_bible.json"));
  const outline = await readJSONIfExists(path.join(dir, "outline.json"));
  const hasFinalStory = await exists(path.join(dir, "final_story.txt"));
  const audioDir = path.join(dir, "tts", "audio");
  const audioFiles = (await exists(audioDir))
    ? (await fs.readdir(audioDir)).filter(f => f.endsWith(".wav")).sort()
    : [];

  res.json({ name: req.params.name, bible, outline, hasFinalStory, audioFiles });
});

app.post("/api/generate", async (req, res) => {
  const { name, idea, ideaFile, chapters, scenesPerChapter, durationMinutes, model } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (generateJob && generateJob.status === "running") {
    return res.status(409).json({ error: `A generate job is already running: ${generateJob.name}` });
  }

  const job: GenerateJob = { name: name.trim(), status: "running", events: [], abortRequested: false };
  generateJob = job;

  try {
    const outDir = resolveUnder(path.resolve("output"), name.trim());
    if (!outDir) {
      generateJob = null;
      return res.status(400).json({ error: "invalid name" });
    }
    const bibleExists = await exists(path.join(outDir, "story_bible.json"));

    let ideaText = "";
    if (idea && String(idea).trim()) {
      ideaText = String(idea).trim();
    } else if (ideaFile) {
      const ideaPath = resolveUnder(path.resolve("stories"), String(ideaFile));
      if (!ideaPath) {
        generateJob = null;
        return res.status(400).json({ error: "invalid ideaFile path" });
      }
      if (!(await exists(ideaPath))) {
        generateJob = null;
        return res.status(400).json({ error: "idea file not found" });
      }
      ideaText = (await fs.readFile(ideaPath, "utf8")).trim();
    } else if (!bibleExists) {
      generateJob = null;
      return res.status(400).json({ error: "idea or ideaFile is required for a new story" });
    }

    const jobConfig: Config = {
      ...config,
      chapters: chapters ? Number(chapters) : config.chapters,
      scenesPerChapter: scenesPerChapter ? Number(scenesPerChapter) : config.scenesPerChapter,
      durationMinutes: durationMinutes ? Number(durationMinutes) : config.durationMinutes,
      model: model && String(model).trim() ? String(model).trim() : config.model
    };

    const pushEvent = (e: ProgressEvent) => {
      job.events.push(e);
      progressEmitter.emit("generate", { jobName: job.name, event: e });
    };

    (async () => {
      try {
        await generateStory(jobConfig, ideaText, outDir, pushEvent, () => job.abortRequested);
        job.status = "done";
      } catch (err: any) {
        if (err?.message === "ABORTED") {
          job.status = "stopped";
          pushEvent({ type: "stopped" });
        } else {
          job.status = "error";
          job.error = String(err?.message ?? err);
          pushEvent({ type: "error", message: job.error });
        }
      }
    })();

    res.json({ started: true, name: job.name });
  } catch (e: any) {
    generateJob = null;
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
});

app.post("/api/generate/stop", (req, res) => {
  if (!generateJob || generateJob.status !== "running") {
    return res.status(409).json({ error: "No generate job is running" });
  }
  generateJob.abortRequested = true;
  res.json({ stopping: true });
});

app.get("/api/generate/stream", (req, res) => {
  const name = String(req.query.name ?? "");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const safeWrite = (data: unknown) => {
    try {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  if (!generateJob || generateJob.name !== name) {
    safeWrite({ type: "idle" });
    return res.end();
  }

  for (const e of generateJob.events) {
    safeWrite(e);
  }

  const onEvent = ({ jobName, event }: { jobName: string; event: ProgressEvent }) => {
    if (jobName !== name) return;
    safeWrite(event);
  };
  progressEmitter.on("generate", onEvent);
  req.on("close", () => progressEmitter.off("generate", onEvent));
});

app.post("/api/tts/:name", async (req, res) => {
  const name = req.params.name;
  if (ttsJob && ttsJob.status === "running") {
    return res.status(409).json({ error: `A TTS job is already running: ${ttsJob.name}` });
  }

  const dir = resolveUnder(path.resolve("output"), name);
  if (!dir) {
    return res.status(400).json({ error: "invalid name" });
  }

  const job: TTSJob = { name, status: "running", events: [] };
  ttsJob = job;

  if (!(await exists(dir))) {
    ttsJob = null;
    return res.status(404).json({ error: "story not found" });
  }

  const refAudio = path.resolve(process.env.TTS_REF_AUDIO ?? "voices/minhthu.mp3");
  if (!(await exists(refAudio))) {
    ttsJob = null;
    return res.status(400).json({ error: `Voice sample not found: ${refAudio}` });
  }

  const pushEvent = (e: TtsProgressEvent) => {
    job.events.push(e);
    ttsEmitter.emit("tts", { jobName: job.name, event: e });
  };

  (async () => {
    try {
      await runTTS(
        dir,
        {
          pythonCommand: config.tts.pythonCommand,
          voice: config.tts.voice,
          refAudio,
          refText: process.env.TTS_REF_TEXT ?? "",
          pipeOutput: true
        },
        pushEvent
      );
      job.status = "done";
    } catch (err: any) {
      job.status = "error";
      job.error = String(err?.message ?? err);
      pushEvent({ type: "error", message: job.error });
    }
  })();

  res.json({ started: true, name });
});

app.get("/api/tts/:name/stream", (req, res) => {
  const name = req.params.name;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const safeWrite = (data: unknown) => {
    try {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  if (!ttsJob || ttsJob.name !== name) {
    safeWrite({ type: "idle" });
    return res.end();
  }

  for (const e of ttsJob.events) {
    safeWrite(e);
  }

  const onEvent = ({ jobName, event }: { jobName: string; event: TtsProgressEvent }) => {
    if (jobName !== name) return;
    safeWrite(event);
  };
  ttsEmitter.on("tts", onEvent);
  req.on("close", () => ttsEmitter.off("tts", onEvent));
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Story Generator UI: http://localhost:${PORT}`);
});
