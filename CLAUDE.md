# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local pipeline that generates long-form Vietnamese drama stories via a local Ollama LLM (or, optionally, the DeepSeek cloud API — see Config below), then optionally converts the finished story to voice-over audio via a local Python TTS worker (VieNeu-TTS with voice cloning). By default everything runs locally against `localhost:11434` (Ollama) and a local Python environment; DeepSeek is an opt-in alternative for the story-generation LLM calls only.

## Commands

- `npm install` — install deps (tsx, typescript; no test framework, no linter configured)
- `npm run dev -- .\stories\example\idea.txt` — run the story pipeline on an idea file, writes to `output/<idea-filename>/`
- `npm run tts -- .\output\<idea-name>` — build a TTS manifest from a generated story and run the Python worker to synthesize audio (requires a Python env with `vieneu` installed and a voice sample)
- `npm start` — launch the local web UI (Express + SSE) on `http://localhost:4000` (override with `PORT`); drives story generation and TTS through the browser instead of the CLI

There are no test or lint scripts. `tsc` is a dependency but not wired to a script; use `npx tsc --noEmit` to type-check if needed.

## Architecture

### Story generation pipeline (`src/index.ts` → `src/pipeline.ts`)

`generateStory(config, idea, outDir, onProgress?, shouldAbort?)` runs a fixed sequence of LLM calls, each stage caching its output to disk under `outDir` so a rerun resumes instead of regenerating. `onProgress` (optional) receives `ProgressEvent`s (`bible`/`outline`/`chapter`/`scene`/`edit`/`error`/`stopped`/`complete`, see `src/types.ts`) as each stage starts/caches/completes; `shouldAbort` (optional) is polled between steps and, if it returns true, aborts the run by throwing `Error("ABORTED")`. Both are used by `src/server.ts` to drive the web UI's live progress and stop button; the CLI (`src/index.ts`) calls `generateStory` without them.

1. **Story Bible** (`story_bible.json`) — title/genre/theme/premise/tone/characters/setting/conflicts/ending, from the `ARCH` prompt.
2. **Outline** (`outline.json`) — N chapters (`config.chapters`) via the `OUT` prompt, validated by `validateOutline`.
3. Per chapter, per scene (`config.scenesPerChapter`):
   - **Scene plan** via `SC` prompt, validated by `validateScenePlan`.
   - **Scene draft** via `WR` prompt (`retryLLM`, not JSON — raw story text), appended to a running chapter draft. Last 6000 chars of the draft are passed back in as `RECENT` context for continuity.
   - **Memory update** via `MEM` prompt after each scene — tracks `characterState`, `knownFacts`, `revealedSecrets`, `unresolvedQuestions`, `foreshadowing`, `lastChapterSummary`. Memory failures are logged and swallowed (non-critical); story-critical stages are not.
   - After all scenes: **chapter edit pass** via `EDIT` prompt, cleaned, and written to `chapter-<n>.txt`. Chapter files are the resume checkpoint — if `chapter-<n>.txt` already exists, the whole chapter (planning/writing/editing) is skipped.
4. All chapter files are concatenated into `final_story.txt`.

Prompts (`src/prompts.ts`) are Vietnamese and instruct the model to output either strict JSON (no Markdown) or plain narration text (no Markdown, no meta-commentary like "Dưới đây là..."). `cleanGeneratedStory` (`src/utils.ts`) strips Markdown artifacts and stock LLM preambles from narrative output as a second line of defense.

### Retry/validation model (`src/ollama.ts`)

Two retry wrappers around `askLLM`, both doing 3 attempts with temperature stepped down each retry (`config.temperature` → `0.2` → `0.1`) to trade creativity for reliability on retry. Both also sleep between attempts (`backoffMs`): exponential with jitter from an 800 ms base, or a 5 s base when the error text looks like throttling (`429`/`529`/`503`/"rate limit"/"overloaded") — without this, parallel jobs burn all 3 attempts within a second of a single rate-limit response.

- `askJSON` — expects JSON, uses `extractJSON` to strip code fences / find the outermost `{}`/`[]` if the model wraps the JSON in prose, then runs an optional `validate(x)` callback that throws on missing/malformed fields.
- `retryLLM` — expects non-empty raw text (used for scene writing and chapter editing).

Per the README: Story Bible, Outline, Chapter Plan, Scene Writing, and Chapter Editing are all critical — if they still fail after 3 attempts, the whole run aborts (no partial/corrupt story is written). Memory updates are the one non-critical stage that retries but doesn't abort the run on failure.

### TTS pipeline (`src/tts/index.ts` + `src/tts/worker.py`)

Runs after a story exists, either manually via the CLI or driven by the web server:

1. The exported `runTTS(storyDir, opts, onProgress?)` reads `final_story.txt` (or falls back to concatenating `chapter-*.txt`), cleans Markdown, splits into ≤450-char segments on paragraph/sentence boundaries, and writes `tts/manifest.json` (segments with id/text/output path).
2. It spawns `python src/tts/worker.py --manifest ... --voice ... --ref-audio ...`, which loads `vieneu.Vieneu`, does reference-audio voice cloning per segment, and writes `tts/audio/<0001>.wav` etc. Existing output files >1000 bytes are skipped, so reruns resume like the story pipeline.
3. Default voice sample path is `voices/minhthu.mp3`; override with `TTS_REF_AUDIO`. `TTS_REF_TEXT` (transcript of the sample) improves cloning quality when set.
4. `opts.pipeOutput` controls stdio: unset/falsy (the CLI path, `main()` at the bottom of the file) uses `stdio: "inherit"` so the Python process's TTY/prompts pass through untouched; `pipeOutput: true` (used by `src/server.ts`) pipes stdout/stderr instead, parsing `[i/total] SKIP|TTS ...` lines out of stdout into `TtsProgressEvent`s (`src/types.ts`) for `onProgress`.

### Web server (`src/server.ts`)

Express app (`npm start`, default port 4000, binds `127.0.0.1` only) serving `public/` statically and `output/` at `/output` for direct file access (story text, audio).

**Generate jobs run many-at-a-time.** In-memory state is a `Map<name, GenerateJob>` (`generateJobs`) plus a FIFO `jobQueue`; `pump()` promotes queued jobs to running while `runningCount() < maxParallelStories`, and is re-run whenever a job finishes, a job is stopped, a batch is submitted, or the limit changes via `POST /api/settings`. Job identity is the story name, so each job writes to its own `output/<name>/` and they never collide; re-submitting a name that is already `queued`/`running` 409s. `POST /api/generate` accepts either one story (`{name, idea|ideaFile, ...}`) or a batch (`{items: [...], ...shared config}`) and returns the queued names plus per-item `failed` entries — a bad item never blocks the rest. `POST /api/generate/stop` takes `{name}` (a queued job is dropped from the queue and marked `stopped` immediately; a running one gets `abortRequested`) or `{all: true}`. Per-story SSE stays at `GET /api/generate/stream?name=`, replaying buffered events on (re)connect and now including scheduler events `queued`/`started`; `GET /api/jobs` and `GET /api/jobs/stream` expose a whole-queue snapshot (`JobSummary[]`, `running`, `maxParallelStories`) that drives the home screen's queue panel.

Parallelism is deliberately **across** stories, not within one — scenes depend on the previous scene's `RECENT` text and chapters on the running memory, so intra-story concurrency would break continuity. Because each job's LLM calls are strictly sequential, concurrent LLM requests equal running jobs, which is why one knob (`maxParallelStories`) is enough.

TTS is still single-job-at-a-time (`ttsJob`): `POST /api/tts/:name` 409s if one is running, since the Python worker is GPU/CPU-bound and parallelising it would not help. All routes that resolve a filesystem path from request input go through a shared `resolveUnder(root, name)` helper to keep the path inside `output/`/`stories/`.

### Config (`src/config.ts`, `src/types.ts`)

All tunables live in one `Config` object, overridable via env vars: `OLLAMA_MODEL`, `OLLAMA_URL`, `PYTHON_COMMAND`, `TTS_VOICE`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `MAX_PARALLEL_STORIES` (`src/tts/index.ts` imports `config` for the TTS ones; it separately reads `TTS_REF_AUDIO`/`TTS_REF_TEXT` from env since those aren't in `Config`). Story length is controlled by `durationMinutes × targetWordsPerMinute`, chapter/scene count by `chapters`/`scenesPerChapter`.

`Config.maxParallelStories` (default 3, clamped to 1–16 when set from `settings.json`) caps how many generate jobs the web server runs at once; it is a server-only knob (the CLI runs one story per process). Set it to 1 for Ollama, higher for DeepSeek/Claude.

`Config.provider` (`"ollama"|"deepseek"`) selects which LLM backend `src/ollama.ts`'s `askLLM` calls — Ollama's `/api/chat` or DeepSeek's OpenAI-compatible `/chat/completions`, both behind the same `askJSON`/`retryLLM` retry wrappers, so nothing downstream of `askLLM` needs to know which provider is active. `loadSettingsOverrides()` (`src/config.ts`) reads an optional `settings.json` (git-ignored, repo root) and returns override fields; both the CLI (`src/index.ts`) and the web server (`src/server.ts`, `POST /api/generate`) merge it over the base `config` before each run, so switching provider via the web UI's Settings screen (`GET`/`POST /api/settings`) takes effect for the CLI too without restarting anything. Absent `settings.json` behaves exactly as before (`provider:"ollama"`). Once a user saves the Settings screen, `settings.json` becomes the source of truth for `model`/`provider`/`deepseek` and outranks the env-var defaults (e.g. `OLLAMA_MODEL`) from that point on.

## Code style note

Source files under `src/` (excluding `src/tts/index.ts`) are written densely — no whitespace between statements, minimal formatting. This appears to be the existing convention for the core pipeline files; match it when editing those files rather than reformatting.
