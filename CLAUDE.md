# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local pipeline that generates long-form Vietnamese drama stories via a local Ollama LLM, then optionally converts the finished story to voice-over audio via a local Python TTS worker (VieNeu-TTS with voice cloning). No cloud APIs — everything runs against `localhost:11434` (Ollama) and a local Python environment.

## Commands

- `npm install` — install deps (tsx, typescript; no test framework, no linter configured)
- `npm run dev -- .\stories\example\idea.txt` — run the story pipeline on an idea file, writes to `output/<idea-filename>/`
- `npm run tts -- .\output\<idea-name>` — build a TTS manifest from a generated story and run the Python worker to synthesize audio (requires a Python env with `vieneu` installed and a voice sample)

There are no test or lint scripts. `tsc` is a dependency but not wired to a script; use `npx tsc --noEmit` to type-check if needed.

## Architecture

### Story generation pipeline (`src/index.ts` → `src/pipeline.ts`)

`generateStory(config, idea, outDir)` runs a fixed sequence of LLM calls, each stage caching its output to disk under `outDir` so a rerun resumes instead of regenerating:

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

Two retry wrappers around `askLLM`, both doing 3 attempts with temperature stepped down each retry (`config.temperature` → `0.2` → `0.1`) to trade creativity for reliability on retry:

- `askJSON` — expects JSON, uses `extractJSON` to strip code fences / find the outermost `{}`/`[]` if the model wraps the JSON in prose, then runs an optional `validate(x)` callback that throws on missing/malformed fields.
- `retryLLM` — expects non-empty raw text (used for scene writing and chapter editing).

Per the README: Story Bible, Outline, Chapter Plan, Scene Writing, and Chapter Editing are all critical — if they still fail after 3 attempts, the whole run aborts (no partial/corrupt story is written). Memory updates are the one non-critical stage that retries but doesn't abort the run on failure.

### TTS pipeline (`src/tts/index.ts` + `src/tts/worker.py`)

Separate from the story pipeline, run manually after a story exists:

1. `index.ts` reads `final_story.txt` (or falls back to concatenating `chapter-*.txt`), cleans Markdown, splits into ≤450-char segments on paragraph/sentence boundaries, and writes `tts/manifest.json` (segments with id/text/output path).
2. `index.ts` spawns `python src/tts/worker.py --manifest ... --voice ... --ref-audio ...`, which loads `vieneu.Vieneu`, does reference-audio voice cloning per segment, and writes `tts/audio/<0001>.wav` etc. Existing output files >1000 bytes are skipped, so reruns resume like the story pipeline.
3. Default voice sample path is `voices/minhthu.mp3`; override with `TTS_REF_AUDIO`. `TTS_REF_TEXT` (transcript of the sample) improves cloning quality when set.

### Config (`src/config.ts`, `src/types.ts`)

All tunables live in one `Config` object, overridable via env vars: `OLLAMA_MODEL`, `OLLAMA_URL`, `PYTHON_COMMAND`, `TTS_VOICE` (`src/tts/index.ts` imports `config` for these; it separately reads `TTS_REF_AUDIO`/`TTS_REF_TEXT` from env since those aren't in `Config`). Story length is controlled by `durationMinutes × targetWordsPerMinute`, chapter/scene count by `chapters`/`scenesPerChapter`.

## Code style note

Source files under `src/` (excluding `src/tts/index.ts`) are written densely — no whitespace between statements, minimal formatting. This appears to be the existing convention for the core pipeline files; match it when editing those files rather than reformatting.
