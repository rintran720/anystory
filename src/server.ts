import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import { exists } from "./utils.js";
import { generateStory } from "./pipeline.js";
import { runTTS } from "./tts/index.js";
import { config, loadSettingsOverrides } from "./config.js";
import type { ProgressEvent, TtsProgressEvent, RunUntil, JobStatus, JobSummary } from "./types.js";
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
  status: JobStatus;
  events: ProgressEvent[];
  abortRequested: boolean;
  error?: string;
  start: () => Promise<void>;
}

// Nhiều truyện chạy song song: mỗi truyện là một job độc lập (ghi vào output/<name>/
// riêng), lên lịch FIFO với trần maxParallelStories. Mỗi job chỉ gọi LLM tuần tự nên
// số request LLM đồng thời đúng bằng số job đang chạy.
const generateJobs = new Map<string, GenerateJob>();
const jobQueue: string[] = [];
const progressEmitter = new EventEmitter();
const jobsEmitter = new EventEmitter();
progressEmitter.setMaxListeners(0);
jobsEmitter.setMaxListeners(0);
let maxParallelStories = config.maxParallelStories;

function pushEvent(job: GenerateJob, event: ProgressEvent) {
  job.events.push(event);
  progressEmitter.emit("generate", { jobName: job.name, event });
}

function runningCount(): number {
  let n = 0;
  for (const job of generateJobs.values()) if (job.status === "running") n++;
  return n;
}

function jobSummaries(): JobSummary[] {
  return [...generateJobs.values()].map(job => ({
    name: job.name,
    status: job.status,
    position: job.status === "queued" ? jobQueue.indexOf(job.name) + 1 : 0,
    error: job.error
  }));
}

function emitJobs() {
  jobsEmitter.emit("jobs", jobSummaries());
}

function pump() {
  while (jobQueue.length > 0 && runningCount() < maxParallelStories) {
    const name = jobQueue.shift()!;
    const job = generateJobs.get(name);
    if (!job || job.status !== "queued") continue;
    job.status = "running";
    pushEvent(job, { type: "started" });
    job.start().finally(() => {
      emitJobs();
      pump();
    });
  }
  emitJobs();
}

function stopJob(job: GenerateJob): boolean {
  if (job.status === "queued") {
    const i = jobQueue.indexOf(job.name);
    if (i >= 0) jobQueue.splice(i, 1);
    job.status = "stopped";
    pushEvent(job, { type: "stopped" });
    return true;
  }
  if (job.status === "running") {
    job.abortRequested = true;
    return true;
  }
  return false;
}

interface TTSJob {
  name: string;
  status: "running" | "done" | "error";
  events: TtsProgressEvent[];
  error?: string;
}
let ttsJob: TTSJob | null = null;
const ttsEmitter = new EventEmitter();

function openSSE(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  return (data: unknown) => {
    try {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };
}

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

app.get("/api/config", (req, res) => {
  res.json({
    chapters: config.chapters,
    scenesPerChapter: config.scenesPerChapter,
    durationMinutes: config.durationMinutes,
    targetWordsPerMinute: config.targetWordsPerMinute,
    silenceGapMs: config.tts.silenceGapMs
  });
});

app.get("/api/settings", async (req, res) => {
  const overrides = await loadSettingsOverrides();
  res.json({
    provider: overrides.provider ?? config.provider,
    ollamaModel: overrides.model ?? config.model,
    deepseekModel: overrides.deepseek?.model ?? config.deepseek.model,
    deepseekApiKeySet: Boolean((overrides.deepseek?.apiKey ?? config.deepseek.apiKey).trim()),
    claudeModel: overrides.claude?.model ?? config.claude.model,
    maxParallelStories: overrides.maxParallelStories ?? config.maxParallelStories,
    autoFix: overrides.autoFix ?? config.autoFix,
    editorModel: overrides.editorModel ?? config.editorModel
  });
});

app.post("/api/settings", async (req, res) => {
  const { provider, ollamaModel, deepseekModel, deepseekApiKey, claudeModel } = req.body ?? {};
  if (provider !== "ollama" && provider !== "deepseek" && provider !== "claude") {
    return res.status(400).json({ error: "provider must be 'ollama', 'deepseek', or 'claude'" });
  }

  const current = await loadSettingsOverrides();
  const parallel = Number(req.body?.maxParallelStories);
  const settings = {
    provider,
    ollamaModel: (ollamaModel && String(ollamaModel).trim()) || current.model || config.model,
    deepseekApiKey: (deepseekApiKey && String(deepseekApiKey).trim()) || current.deepseek?.apiKey || "",
    deepseekModel: (deepseekModel && String(deepseekModel).trim()) || current.deepseek?.model || config.deepseek.model,
    claudeModel: (claudeModel && String(claudeModel).trim()) || current.claude?.model || config.claude.model,
    maxParallelStories: Number.isFinite(parallel) && parallel >= 1
      ? Math.min(16, Math.floor(parallel))
      : current.maxParallelStories ?? config.maxParallelStories,
    autoFix: typeof req.body?.autoFix === "boolean"
      ? req.body.autoFix
      : current.autoFix ?? config.autoFix,
    editorModel: typeof req.body?.editorModel === "string"
      ? String(req.body.editorModel).trim()
      : current.editorModel ?? config.editorModel
  };

  await fs.writeFile("settings.json.tmp", JSON.stringify(settings, null, 2), "utf8");
  await fs.rename("settings.json.tmp", "settings.json");

  // Áp dụng trần song song ngay lập tức: nâng lên thì job đang chờ chạy luôn.
  maxParallelStories = settings.maxParallelStories;
  pump();
  res.json({ saved: true });
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

      const review = await readJSONIfExists(path.join(dir, "review-report.json"));

      const jobStatus = generateJobs.get(e.name)?.status ?? null;
      return {
        name: e.name,
        totalChapters,
        completedChapters,
        hasFinalStory,
        hasAudio,
        hasReview: Boolean(review),
        reviewScore: review?.summary?.overall ?? null,
        isRunning: jobStatus === "running",
        isQueued: jobStatus === "queued"
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
  const finalAudioPath = path.join(dir, "tts", "final_audio.wav");
  const finalAudio = (await exists(finalAudioPath)) ? "tts/final_audio.wav" : null;

  const review = await readJSONIfExists(path.join(dir, "review-report.json"));
  const fixReport = await readJSONIfExists(path.join(dir, "fix-report.json"));

  res.json({ name: req.params.name, bible, outline, hasFinalStory, audioFiles, finalAudio, review, fixReport });
});

type QueueResult =
  | { ok: true; name: string }
  | { ok: false; name: string; status: number; error: string };

async function queueGenerateJob(input: any): Promise<QueueResult> {
  const rawName = input?.name;
  if (!rawName || typeof rawName !== "string" || !rawName.trim()) {
    return { ok: false, name: String(rawName ?? ""), status: 400, error: "name is required" };
  }
  const name = rawName.trim();

  const existing = generateJobs.get(name);
  if (existing && (existing.status === "queued" || existing.status === "running")) {
    return { ok: false, name, status: 409, error: `"${name}" đang chạy hoặc đang chờ trong hàng đợi` };
  }

  const outDir = resolveUnder(path.resolve("output"), name);
  if (!outDir) return { ok: false, name, status: 400, error: "invalid name" };
  const bibleExists = await exists(path.join(outDir, "story_bible.json"));

  let ideaText = "";
  if (input.idea && String(input.idea).trim()) {
    ideaText = String(input.idea).trim();
  } else if (input.ideaFile) {
    const ideaPath = resolveUnder(path.resolve("stories"), String(input.ideaFile));
    if (!ideaPath) return { ok: false, name, status: 400, error: "invalid ideaFile path" };
    if (!(await exists(ideaPath))) return { ok: false, name, status: 400, error: `idea file not found: ${input.ideaFile}` };
    ideaText = (await fs.readFile(ideaPath, "utf8")).trim();
  } else if (!bibleExists) {
    return { ok: false, name, status: 400, error: "idea or ideaFile is required for a new story" };
  }

  const settingsOverrides = await loadSettingsOverrides();
  const baseConfig = { ...config, ...settingsOverrides };
  maxParallelStories = baseConfig.maxParallelStories;
  const jobConfig: Config = {
    ...baseConfig,
    chapters: input.chapters ? Number(input.chapters) : baseConfig.chapters,
    scenesPerChapter: input.scenesPerChapter ? Number(input.scenesPerChapter) : baseConfig.scenesPerChapter,
    durationMinutes: input.durationMinutes ? Number(input.durationMinutes) : baseConfig.durationMinutes
  };

  let runUntilArg: RunUntil | undefined;
  if (input.runUntil === "bible") runUntilArg = { stage: "bible" };
  else if (input.runUntil === "outline") runUntilArg = { stage: "outline" };
  else if (input.runUntil === "chapters") {
    runUntilArg = { stage: "chapters", chapterLimit: input.chapterLimit ? Number(input.chapterLimit) : undefined };
  }

  const job: GenerateJob = { name, status: "queued", events: [], abortRequested: false, start: async () => {} };
  job.start = async () => {
    try {
      await generateStory(jobConfig, ideaText, outDir, e => pushEvent(job, e), () => job.abortRequested, runUntilArg);
      job.status = "done";
    } catch (err: any) {
      if (err?.message === "ABORTED") {
        job.status = "stopped";
        pushEvent(job, { type: "stopped" });
      } else {
        job.status = "error";
        job.error = String(err?.message ?? err);
        pushEvent(job, { type: "error", message: job.error });
      }
    }
  };

  generateJobs.set(name, job);
  jobQueue.push(name);
  pushEvent(job, { type: "queued", position: jobQueue.length });
  return { ok: true, name };
}

// Nhận một truyện ({name, idea|ideaFile, ...}) hoặc nhiều truyện cùng lúc
// ({items: [...], ...cấu hình dùng chung}).
app.post("/api/generate", async (req, res) => {
  const body = req.body ?? {};
  const items: any[] = Array.isArray(body.items) && body.items.length > 0 ? body.items : [body];
  const shared = {
    chapters: body.chapters,
    scenesPerChapter: body.scenesPerChapter,
    durationMinutes: body.durationMinutes,
    runUntil: body.runUntil,
    chapterLimit: body.chapterLimit
  };

  const queued: string[] = [];
  const failed: { name: string; error: string; status: number }[] = [];
  for (const item of items) {
    const result = await queueGenerateJob({ ...shared, ...item });
    if (result.ok) queued.push(result.name);
    else failed.push({ name: result.name, error: result.error, status: result.status });
  }
  pump();

  if (queued.length === 0) {
    const first = failed[0];
    return res.status(first?.status ?? 400).json({ error: first?.error ?? "Không tạo được job nào", failed });
  }
  res.json({ started: true, names: queued, failed, running: runningCount(), maxParallelStories });
});

app.post("/api/generate/stop", (req, res) => {
  const { name, all } = req.body ?? {};

  if (all) {
    const stopping = [...generateJobs.values()].filter(job => stopJob(job)).map(job => job.name);
    emitJobs();
    pump();
    return res.json({ stopping });
  }

  if (!name) return res.status(400).json({ error: "name is required" });
  const job = generateJobs.get(String(name));
  if (!job || !stopJob(job)) return res.status(409).json({ error: `"${name}" không đang chạy hoặc chờ` });
  emitJobs();
  pump();
  res.json({ stopping: [job.name] });
});

app.get("/api/jobs", (req, res) => {
  res.json({ jobs: jobSummaries(), running: runningCount(), maxParallelStories });
});

app.get("/api/jobs/stream", (req, res) => {
  const safeWrite = openSSE(res);
  const send = (jobs: JobSummary[]) => safeWrite({ jobs, running: runningCount(), maxParallelStories });

  send(jobSummaries());
  jobsEmitter.on("jobs", send);
  req.on("close", () => jobsEmitter.off("jobs", send));
});

app.get("/api/generate/stream", (req, res) => {
  const name = String(req.query.name ?? "");
  const safeWrite = openSSE(res);

  const job = generateJobs.get(name);
  if (!job) {
    safeWrite({ type: "idle" });
    return res.end();
  }

  for (const e of job.events) {
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
  const silenceGapMs = req.body?.silenceGapMs != null && req.body.silenceGapMs !== ""
    ? Number(req.body.silenceGapMs)
    : config.tts.silenceGapMs;
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
          pipeOutput: true,
          silenceGapMs
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
