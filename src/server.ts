import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import { exists } from "./utils.js";
import { generateStory } from "./pipeline.js";
import { runTTS } from "./tts/index.js";
import type { ProgressEvent, TtsProgressEvent } from "./types.js";

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

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Story Generator UI: http://localhost:${PORT}`);
});
