import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import { exists } from "./utils.js";
import { generateStory, reviewStory, fixStory, needsFix, saveHook, rewriteHook, ideaFromYoutube } from "./pipeline.js";
import { runTTS, refTextFor, isVoiceFile, VOICES_DIR, DEFAULT_REF_AUDIO } from "./tts/index.js";
import { config, loadSettingsOverrides } from "./config.js";
import { GENRES, SETTINGS_LIST, getGenre, resolveSetting } from "./prompts/index.js";
import type { ProgressEvent, TtsProgressEvent, RunUntil, JobStatus, JobSummary } from "./types.js";
import type { Config, GenreId, SettingId } from "./types.js";

const app = express();
app.use(express.json());
app.use(express.static(path.resolve("public")));
app.use("/output", express.static(path.resolve("output")));

// Một câu hỏi duy nhất, hỏi ở cả hai đầu: "truyện này đã có bible chưa?". Server khoá
// thể loại/bối cảnh khi câu trả lời là có; màn hình tạo truyện giấu hai ô chọn khi câu
// trả lời là có, và nó hỏi ĐÚNG câu này qua hasBible của /api/stories/:name chứ không
// hỏi một câu gần giống (kiểu "form có sẵn tên không"). Hai câu khác nhau là có khe:
// truyện chết ngay ở ARCH chưa kịp ghi bible sẽ bị giấu mất ô chọn thể loại trong khi
// server vẫn sẵn sàng nhận.
const hasBible = (dir: string) => exists(path.join(dir, "story_bible.json"));

function resolveUnder(root: string, name: string): string | null {
  const p = path.resolve(root, name);
  return p === root || p.startsWith(root + path.sep) ? p : null;
}

interface GenerateJob {
  name: string;
  kind: "generate" | "review" | "fix";
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
    kind: job.kind,
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

// Chương nào đã viết lại sau lần chấm điểm gần nhất áp dụng cho nó. Mốc so là
// review-report.generatedAt, trừ chương được stage FIX sửa và giữ lại - chương đó đã
// được chấm lại ngay trong stage FIX nên mốc của nó là fix-report.generatedAt.
// Biên 2000ms: output/ có thể nằm trên exFAT, nơi mtime chỉ có độ phân giải 2 giây và
// làm tròn LÊN - một chương ghi lúc 12:25:19.2 đọc ra thành 12:25:20.000, tức "mới hơn"
// chính bản báo cáo ghi ngay sau nó, nên chương cuối cùng của mọi lượt sửa đều bị gắn
// nhãn "cũ" oan và người dùng bị mời chấm điểm lại tốn tiền. Không có quy trình hợp lệ
// nào viết lại một chương trong vòng 2 giây kể từ báo cáo của chính nó: một lượt LLM
// viết lại chương mất hàng phút.
const MTIME_TOLERANCE_MS = 2000;

async function staleReviewChapters(dir: string, review: any, fixReport: any): Promise<number[]> {
  if (!review?.generatedAt) return [];
  const reviewedAt = Date.parse(review.generatedAt);
  const fixedAt = Date.parse(fixReport?.generatedAt ?? "");
  const keptFixes = new Set(
    ((fixReport?.fixes ?? []) as any[]).filter(f => f.kept).map(f => f.chapter)
  );

  const stale: number[] = [];
  for (const entry of (review.chapters ?? []) as any[]) {
    const file = path.join(dir, `chapter-${entry.chapter}.txt`);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) continue;
    const scoredAt = keptFixes.has(entry.chapter) && Number.isFinite(fixedAt)
      ? Math.max(reviewedAt, fixedAt)
      : reviewedAt;
    if (stat.mtimeMs > scoredAt + MTIME_TOLERANCE_MS) stale.push(entry.chapter);
  }
  return stale;
}

app.get("/api/ideas", async (req, res) => {
  const dir = path.resolve("stories");
  const files = (await exists(dir)) ? await findIdeaFiles(dir) : [];
  res.json({ files });
});

// Màn hình tạo truyện lấy giá trị mặc định từ đây, nên phải phủ settings.json lên
// config giống hệt đường tạo truyện - nếu không, thể loại/bối cảnh đặt trong
// settings.json sẽ không bao giờ hiện ra ở form và người dùng phải chọn lại mỗi lần.
app.get("/api/config", async (req, res) => {
  const c = { ...config, ...(await loadSettingsOverrides()) };
  res.json({
    chapters: c.chapters,
    scenesPerChapter: c.scenesPerChapter,
    durationMinutes: c.durationMinutes,
    targetWordsPerMinute: c.targetWordsPerMinute,
    silenceGapMs: c.tts.silenceGapMs,
    genre: c.genre,
    genres: GENRES,
    setting: c.setting,
    settings: SETTINGS_LIST
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
    maxRetries: overrides.maxRetries ?? config.maxRetries,
    autoFix: overrides.autoFix ?? config.autoFix,
    autoReview: overrides.autoReview ?? config.autoReview,
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
  const tries = Number(req.body?.maxRetries);
  const settings = {
    provider,
    ollamaModel: (ollamaModel && String(ollamaModel).trim()) || current.model || config.model,
    deepseekApiKey: (deepseekApiKey && String(deepseekApiKey).trim()) || current.deepseek?.apiKey || "",
    deepseekModel: (deepseekModel && String(deepseekModel).trim()) || current.deepseek?.model || config.deepseek.model,
    claudeModel: (claudeModel && String(claudeModel).trim()) || current.claude?.model || config.claude.model,
    maxParallelStories: Number.isFinite(parallel) && parallel >= 1
      ? Math.min(16, Math.floor(parallel))
      : current.maxParallelStories ?? config.maxParallelStories,
    maxRetries: Number.isFinite(tries) && tries >= 1
      ? Math.min(20, Math.floor(tries))
      : current.maxRetries ?? config.maxRetries,
    autoFix: typeof req.body?.autoFix === "boolean"
      ? req.body.autoFix
      : current.autoFix ?? config.autoFix,
    autoReview: typeof req.body?.autoReview === "boolean"
      ? req.body.autoReview
      : current.autoReview ?? config.autoReview,
    editorModel: typeof req.body?.editorModel === "string"
      ? String(req.body.editorModel).trim()
      : current.editorModel ?? config.editorModel,
    // Màn hình Cài đặt không có ô thể loại/bối cảnh, nhưng settings.json được phép
    // chứa chúng làm mặc định cho form tạo truyện. Ghi đè bằng danh sách khóa cố định
    // sẽ xóa mất chúng mỗi lần bấm Lưu, nên phải chép lại giá trị đang có.
    ...(current.genre ? { genre: current.genre } : {}),
    ...(current.setting ? { setting: current.setting } : {})
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
      const bible = await readJSONIfExists(path.join(dir, "story_bible.json"));
      const outline = await readJSONIfExists(path.join(dir, "outline.json"));
      const totalChapters = outline?.chapters?.length ?? 0;
      const dirFiles = await fs.readdir(dir).catch(() => []);
      const completedChapters = dirFiles.filter(f => /^chapter-\d+\.txt$/.test(f)).length;
      const hasFinalStory = await exists(path.join(dir, "final_story.txt"));
      const audioDir = path.join(dir, "tts", "audio");
      const hasAudio = (await exists(audioDir)) &&
        (await fs.readdir(audioDir)).some(f => f.endsWith(".wav"));

      const review = await readJSONIfExists(path.join(dir, "review-report.json"));
      const staleCount = review
        ? (await staleReviewChapters(dir, review, await readJSONIfExists(path.join(dir, "fix-report.json")))).length
        : 0;

      const jobStatus = generateJobs.get(e.name)?.status ?? null;
      return {
        name: e.name,
        totalChapters,
        completedChapters,
        hasFinalStory,
        hasAudio,
        hasReview: Boolean(review),
        reviewScore: review?.summary?.overall ?? null,
        staleChapters: staleCount,
        isRunning: jobStatus === "running",
        isQueued: jobStatus === "queued",
        genre: bible?.genreId ?? null,
        setting: bible?.settingId ?? null
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
  const hookFile = path.join(dir, "hook.txt");
  const hook = (await exists(hookFile)) ? await fs.readFile(hookFile, "utf8") : null;
  const audioDir = path.join(dir, "tts", "audio");
  const audioFiles = (await exists(audioDir))
    ? (await fs.readdir(audioDir)).filter(f => f.endsWith(".wav")).sort()
    : [];
  const finalAudioPath = path.join(dir, "tts", "final_audio.wav");
  const finalAudio = (await exists(finalAudioPath)) ? "tts/final_audio.wav" : null;

  const review = await readJSONIfExists(path.join(dir, "review-report.json"));
  const fixReport = await readJSONIfExists(path.join(dir, "fix-report.json"));

  const needsFixChapters = ((review?.chapters ?? []) as any[]).filter(needsFix).map(r => r.chapter);
  const staleChapters = await staleReviewChapters(dir, review, fixReport);
  const completedChapters = (await fs.readdir(dir).catch(() => [])).filter(f => /^chapter-\d+\.txt$/.test(f)).length;

  res.json({ name: req.params.name, bible, hasBible: await hasBible(dir), outline, hasFinalStory, hook, audioFiles, finalAudio, review, fixReport, needsFixChapters, staleChapters, completedChapters });
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
  const bibleExists = await hasBible(outDir);

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

  if (input.genre != null && input.genre !== "" && !GENRES.some(g => g.id === input.genre)) {
    return { ok: false, name, status: 400, error: `unknown genre: ${input.genre}` };
  }
  if (input.setting != null && input.setting !== "" && !SETTINGS_LIST.some(s => s.id === input.setting)) {
    return { ok: false, name, status: 400, error: `unknown setting: ${input.setting}` };
  }

  // Truyện đã có story_bible.json thì thể loại và bối cảnh là của chính nó, không phải
  // của cái form vừa mở: chạy tiếp không được đổi danh tính truyện. Bible đời cũ chưa có
  // dấu thì đọc ra đúng mặc định mà mọi chỗ khác đang đọc nó (drama + bối cảnh mặc định
  // của drama), chứ không phải mặc định toàn cục lúc này.
  const storedBible = bibleExists
    ? await readJSONIfExists(path.join(outDir, "story_bible.json"))
    : null;
  const resumedGenre = bibleExists ? getGenre(storedBible?.genreId).id : null;
  const resumedSetting = bibleExists ? resolveSetting(storedBible?.genreId, storedBible?.settingId) : null;

  const settingsOverrides = await loadSettingsOverrides();
  const baseConfig = { ...config, ...settingsOverrides };
  maxParallelStories = baseConfig.maxParallelStories;
  const jobConfig: Config = {
    ...baseConfig,
    chapters: input.chapters ? Number(input.chapters) : baseConfig.chapters,
    scenesPerChapter: input.scenesPerChapter ? Number(input.scenesPerChapter) : baseConfig.scenesPerChapter,
    durationMinutes: input.durationMinutes ? Number(input.durationMinutes) : baseConfig.durationMinutes,
    genre: (resumedGenre || input.genre || baseConfig.genre) as GenreId,
    setting: (resumedSetting || input.setting || baseConfig.setting) as SettingId | "auto"
  };

  let runUntilArg: RunUntil | undefined;
  if (input.runUntil === "bible") runUntilArg = { stage: "bible" };
  else if (input.runUntil === "outline") runUntilArg = { stage: "outline" };
  else if (input.runUntil === "chapters") {
    runUntilArg = { stage: "chapters", chapterLimit: input.chapterLimit ? Number(input.chapterLimit) : undefined };
  }

  const job: GenerateJob = { name, kind: "generate", status: "queued", events: [], abortRequested: false, start: async () => {} };
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

// Chấm điểm và sửa chương chạy như job bình thường, nên dùng lại được cả hàng đợi,
// SSE, nút Dừng và trần maxParallelStories. force=true: bấm nút là chạy lại thật,
// cache theo file chỉ còn phục vụ đường tự động cuối generateStory.
// Nguồn/model chọn ngay tại nút, dùng chung cho job xếp hàng và cho việc chạy thẳng: chỉ
// áp cho lượt này, không ghi vào settings.json. Lựa chọn tại chỗ thắng editorModel, vì
// editorModel là tên model gắn với provider đang cài đặt và sẽ vô nghĩa nếu lượt này chạy
// sang provider khác.
async function taskConfig(override: { provider?: string; model?: string }): Promise<
  { ok: true; config: Config } | { ok: false; status: number; error: string }
> {
  const c: Config = { ...config, ...(await loadSettingsOverrides()) };
  const provider = override.provider;
  if (provider) {
    if (provider !== "ollama" && provider !== "deepseek" && provider !== "claude") {
      return { ok: false, status: 400, error: `provider không hợp lệ: ${provider}` };
    }
    c.provider = provider;
  }
  if (override.provider || override.model) c.editorModel = "";
  if (override.model) {
    const model = String(override.model).trim();
    if (c.provider === "deepseek") c.deepseek = { ...c.deepseek, model };
    else if (c.provider === "claude") c.claude = { model };
    else c.model = model;
  }
  if (c.provider === "deepseek" && !c.deepseek.apiKey.trim()) {
    return { ok: false, status: 400, error: "chưa có DeepSeek API key trong Cài đặt" };
  }
  return { ok: true, config: c };
}

async function queueStoryTask(rawName: string, kind: "review" | "fix", override: { provider?: string; model?: string; selection?: Record<string, number[]>; maxRounds?: number } = {}) {
  const name = String(rawName ?? "").trim();
  if (!name) return { ok: false as const, status: 400, error: "name is required" };

  const existing = generateJobs.get(name);
  if (existing && (existing.status === "queued" || existing.status === "running")) {
    return { ok: false as const, status: 409, error: `"${name}" đang chạy hoặc đang chờ trong hàng đợi` };
  }

  const outDir = resolveUnder(path.resolve("output"), name);
  if (!outDir) return { ok: false as const, status: 400, error: "invalid name" };
  if (!(await exists(path.join(outDir, "outline.json")))) {
    return { ok: false as const, status: 400, error: "truyện chưa có outline" };
  }
  if (!(await exists(path.join(outDir, "chapter-1.txt")))) {
    return { ok: false as const, status: 400, error: "truyện chưa viết chương nào" };
  }
  if (kind === "fix" && !(await exists(path.join(outDir, "review-report.json")))) {
    return { ok: false as const, status: 400, error: "chưa có báo cáo review - chấm điểm trước đã" };
  }

  const resolved = await taskConfig(override);
  if (!resolved.ok) return { ok: false as const, status: resolved.status, error: resolved.error };
  const jobConfig = resolved.config;
  maxParallelStories = jobConfig.maxParallelStories;
  const usedModel = jobConfig.provider === "deepseek" ? jobConfig.deepseek.model
    : jobConfig.provider === "claude" ? jobConfig.claude.model
    : jobConfig.model;

  // Chọn lỗi trên màn hình báo cáo: {"<chương>": [thứ tự lỗi trong review-report]}.
  let selection: Record<string, number[]> | null = null;
  if (kind === "fix" && override.selection && Object.keys(override.selection).length) {
    selection = {};
    for (const [chapter, indexes] of Object.entries(override.selection)) {
      const picked = (Array.isArray(indexes) ? indexes : []).map(Number).filter(Number.isInteger);
      if (!Number.isInteger(Number(chapter)) || picked.length === 0) {
        return { ok: false as const, status: 400, error: `lựa chọn lỗi không hợp lệ ở chương ${chapter}` };
      }
      selection[chapter] = picked;
    }
  }

  // Sửa lặp: mỗi vòng chấm lại chương vừa sửa rồi lấy chính kết quả đó chọn chương cho
  // vòng sau. Chặn trên vì một vòng có thể tốn 3 lượt gọi cho mỗi chương còn lỗi.
  const rounds = Number(override.maxRounds ?? 1);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) {
    return { ok: false as const, status: 400, error: "số vòng sửa phải là số nguyên 1-10" };
  }

  const job: GenerateJob = { name, kind, status: "queued", events: [], abortRequested: false, start: async () => {} };
  job.start = async () => {
    try {
      console.log(`[${kind.toUpperCase()}] ${name} — provider=${jobConfig.provider} model=${jobConfig.editorModel || usedModel}`);
      await (kind === "review"
        ? reviewStory(jobConfig, outDir, e => pushEvent(job, e), () => job.abortRequested, true)
        : fixStory(jobConfig, outDir, e => pushEvent(job, e), () => job.abortRequested, true, selection, rounds));
      job.status = "done";
      pushEvent(job, { type: "complete" });
    } catch (err: any) {
      if (err?.message === "ABORTED") {
        job.status = "stopped";
        pushEvent(job, { type: "stopped" });
      } else {
        job.status = "error";
        // Bỏ tiền tố nội bộ: người dùng cần đọc được lý do, không cần mã lỗi của mình.
        job.error = String(err?.message ?? err).replace(/^HET_KHA_NANG: /, "");
        pushEvent(job, { type: "error", message: job.error });
      }
    }
  };

  generateJobs.set(name, job);
  jobQueue.push(name);
  pushEvent(job, { type: "queued", position: jobQueue.length });
  return { ok: true as const, name };
}

app.post("/api/review/:name", async (req, res) => {
  const result = await queueStoryTask(req.params.name, "review", req.body ?? {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  pump();
  res.json({ queued: result.name });
});

app.post("/api/fix/:name", async (req, res) => {
  const result = await queueStoryTask(req.params.name, "fix", req.body ?? {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  pump();
  res.json({ queued: result.name });
});

// Lời dẫn sửa được ngay tại chỗ. Lưu tay không gọi model; viết lại tốn đúng MỘT lượt gọi,
// nên nó chạy thẳng chứ không xếp hàng: hàng đợi có để ghìm những việc gọi model hàng chục
// lượt, thêm một loại job nữa cho việc chờ chưa tới một phút thì đắt hơn phần lợi.
// Cả hai đều dựng lại final_story.txt, vì đổi hook.txt mà không dựng lại thì file người
// dùng đọc và file TTS đọc vẫn là lời dẫn cũ - sửa mà như không sửa.
app.put("/api/hook/:name", async (req, res) => {
  const dir = resolveUnder(path.resolve("output"), req.params.name);
  if (!dir) return res.status(400).json({ error: "invalid name" });
  if (!(await exists(path.join(dir, "outline.json")))) {
    return res.status(400).json({ error: "truyện chưa có outline" });
  }
  try {
    res.json(await saveHook(dir, String(req.body?.text ?? "")));
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

app.post("/api/hook/:name", async (req, res) => {
  const dir = resolveUnder(path.resolve("output"), req.params.name);
  if (!dir) return res.status(400).json({ error: "invalid name" });
  if (!(await exists(path.join(dir, "story_bible.json")))) {
    return res.status(400).json({ error: "truyện chưa có Story Bible" });
  }
  const resolved = await taskConfig(req.body ?? {});
  if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
  try {
    console.log(`[HOOK] ${req.params.name} — viết lại lời dẫn`);
    res.json(await rewriteHook(resolved.config, dir));
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message ?? err).replace(/^HET_KHA_NANG: /, "") });
  }
});

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
    chapterLimit: body.chapterLimit,
    genre: body.genre,
    setting: body.setting
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

// Dropdown giọng đọc lấy từ đĩa chứ không hardcode: thả một file mới vào voices/ là thấy
// ngay, không phải sửa code. hasTranscript cho biết giọng nào đã có file lời đọc đi kèm -
// giọng chưa có vẫn dùng được, chỉ là nhân bản kém chính xác hơn một chút.
// Rút ý tưởng từ một video, KHÔNG tạo truyện. Kết quả đổ vào ô soạn thảo để người dùng
// đọc và sửa trước khi bấm chạy - họ phải nhìn thấy đúng thứ sắp dùng, chứ không bấm một
// cái rồi tin là máy rút đúng. Chạy thẳng chứ không xếp hàng: một lượt yt-dlp và một lượt
// gọi model. Bản ghi lời không bao giờ chạm đĩa và không đi ra khỏi lượt gọi này.
app.post("/api/idea-from-youtube", async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) return res.status(400).json({ error: "thiếu link YouTube" });
  const fidelity = String(req.body?.fidelity ?? "loose");
  if (!["loose", "frame", "tight"].includes(fidelity)) {
    return res.status(400).json({ error: `mức bám sát không hợp lệ: ${fidelity}` });
  }
  const c: Config = { ...config, ...(await loadSettingsOverrides()) };
  try {
    console.log(`[IDEA] rút ý tưởng từ ${url} (mức ${fidelity})`);
    res.json(await ideaFromYoutube(c, url, fidelity));
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err).replace(/^HET_KHA_NANG: /, "") });
  }
});

app.get("/api/voices", async (req, res) => {
  const dir = path.resolve(VOICES_DIR);
  const names = (await fs.readdir(dir).catch(() => [])).filter(isVoiceFile).sort();
  const files = await Promise.all(names.map(async name => ({
    name,
    hasTranscript: await exists(path.join(dir, name.replace(/\.[^.]+$/, "") + ".txt"))
  })));
  res.json({ files, default: path.basename(process.env.TTS_REF_AUDIO ?? DEFAULT_REF_AUDIO) });
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

  // Giọng chọn tại nút chỉ áp cho lượt chạy này, không ghi vào cấu hình - cùng khuôn với
  // ô chọn provider/model của Chấm điểm. Không chọn thì rơi về TTS_REF_AUDIO rồi mới tới
  // mặc định. Tên file đi qua resolveUnder nên không thoát ra ngoài voices/ được, và đi
  // trong body JSON nên tên có dấu cách hay ngoặc vẫn nguyên vẹn.
  const picked = String(req.body?.refAudio ?? "").trim();
  const refAudio = picked
    ? resolveUnder(path.resolve(VOICES_DIR), picked)
    : path.resolve(process.env.TTS_REF_AUDIO ?? DEFAULT_REF_AUDIO);
  if (!refAudio) {
    ttsJob = null;
    return res.status(400).json({ error: "tên file giọng không hợp lệ" });
  }
  if (!(await exists(refAudio))) {
    ttsJob = null;
    return res.status(400).json({ error: `Voice sample not found: ${refAudio}` });
  }
  const refText = await refTextFor(refAudio);

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
          refText,
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
