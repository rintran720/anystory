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
  return (await exists(file)) ? JSON.parse(await fs.readFile(file, "utf8")) : null;
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
  const dir = path.resolve("output", req.params.name);
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

  const outDir = path.resolve("output", name.trim());
  const bibleExists = await exists(path.join(outDir, "story_bible.json"));

  let ideaText = "";
  if (idea && String(idea).trim()) {
    ideaText = String(idea).trim();
  } else if (ideaFile) {
    const storiesRoot = path.resolve("stories");
    const ideaPath = path.resolve(storiesRoot, String(ideaFile));
    if (ideaPath !== storiesRoot && !ideaPath.startsWith(storiesRoot + path.sep)) {
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
    progressEmitter.emit("generate", e);
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

  if (!generateJob || generateJob.name !== name) {
    res.write(`data: ${JSON.stringify({ type: "idle" })}\n\n`);
    return res.end();
  }

  for (const e of generateJob.events) {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  }

  const onEvent = (e: ProgressEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  progressEmitter.on("generate", onEvent);
  req.on("close", () => progressEmitter.off("generate", onEvent));
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Story Generator UI: http://localhost:${PORT}`);
});
