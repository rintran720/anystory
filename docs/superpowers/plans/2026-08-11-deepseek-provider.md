# DeepSeek LLM Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the story-generation pipeline call DeepSeek's cloud API instead of local Ollama, chosen once on a web UI Settings screen and persisted to disk, shared automatically by both the CLI and the web server.

**Architecture:** `askLLM()` in `src/ollama.ts` gains a provider branch (Ollama's `/api/chat` vs. DeepSeek's OpenAI-compatible `/chat/completions`), selected by `Config.provider`. A new `settings.json` file (git-ignored) holds the persisted choice; `loadSettingsOverrides()` in `src/config.ts` reads it and both `src/index.ts` (CLI) and `src/server.ts` (`POST /api/generate`) merge it over the base config before each run. A new Settings screen in the web UI reads/writes it via `GET`/`POST /api/settings`.

**Tech Stack:** No new dependencies — DeepSeek's API is called with the native `fetch` already used for Ollama.

## Global Constraints

- Existing Ollama-only behavior must be 100% unchanged when `settings.json` is absent or `provider` is `"ollama"` — this is the default and must remain a no-op change for every current user.
- `src/types.ts`, `src/config.ts`, `src/ollama.ts`, `src/index.ts` are dense-style files (no whitespace between statements) — match exactly when editing. `src/server.ts` and `public/*` use normal readable formatting (established convention from the prior web-UI plan).
- No test framework or linter is configured — verify with `npx tsc --noEmit`, `node --check public/app.js`, and manual curl/CLI checks.
- **Never write the real DeepSeek API key into any file, commit, task brief, report, or log.** The user shared a live temporary key in conversation for manual verification only. Any step that needs to exercise a real DeepSeek call is run by the controller directly (not a dispatched subagent), passing the key inline via a one-off shell environment variable, never persisting it to disk except inside `settings.json` (git-ignored) during the final real end-to-end test in Task 5.
- `settings.json` must be added to `.gitignore` in Task 1, before any code ever writes to it.
- `GET /api/settings` must never echo the real API key back — only a boolean `deepseekApiKeySet`.
- DeepSeek API facts (verified against current docs, not assumed from training data): base URL `https://api.deepseek.com`, path `POST /chat/completions`, auth header `Authorization: Bearer <key>`, models `deepseek-v4-flash`/`deepseek-v4-pro`, JSON mode via `response_format:{type:"json_object"}`, response content at `choices[0].message.content`.

---

### Task 1: Config & types plumbing

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Config` (in `src/types.ts`) gains `provider:"ollama"|"deepseek"` and `deepseek:{apiKey:string;model:string}`.
- Produces: `export async function loadSettingsOverrides():Promise<Partial<Config>>` (in `src/config.ts`) — reads `settings.json` from the repo root (cwd), returns `{}` if the file is missing or fails to parse, otherwise returns only the fields present/valid in the file (`provider` if it's exactly `"ollama"` or `"deepseek"`; `model` — mapped from the file's `ollamaModel` key — if it's a non-empty string; `deepseek:{apiKey,model}` — mapped from the file's `deepseekApiKey`/`deepseekModel` keys — if both are present as strings).

- [ ] **Step 1: Extend `Config` in `src/types.ts`**

Read the file first, then replace the single `Config` line:
```ts
export interface Config{model:string;language:string;durationMinutes:number;targetWordsPerMinute:number;chapters:number;scenesPerChapter:number;numCtx:number;temperature:number;ollamaUrl:string;tts:{pythonCommand:string;voice:string}}
```
with:
```ts
export interface Config{model:string;language:string;durationMinutes:number;targetWordsPerMinute:number;chapters:number;scenesPerChapter:number;numCtx:number;temperature:number;ollamaUrl:string;provider:"ollama"|"deepseek";deepseek:{apiKey:string;model:string};tts:{pythonCommand:string;voice:string}}
```

- [ ] **Step 2: Add defaults and `loadSettingsOverrides()` to `src/config.ts`**

Read the file first, then replace its full content:
```ts
import type {Config} from "./types.js";
export const config:Config={model:process.env.OLLAMA_MODEL??"qwen3.5:9b",language:"vi",durationMinutes:60,targetWordsPerMinute:150,chapters:6,scenesPerChapter:5,numCtx:4096,temperature:.7,ollamaUrl:process.env.OLLAMA_URL??"http://localhost:11434/api/chat",tts:{pythonCommand:process.env.PYTHON_COMMAND??"python",voice:process.env.TTS_VOICE??"Ly"}};
```
with:
```ts
import fs from "node:fs/promises";
import type {Config} from "./types.js";
export const config:Config={model:process.env.OLLAMA_MODEL??"qwen3.5:9b",language:"vi",durationMinutes:60,targetWordsPerMinute:150,chapters:6,scenesPerChapter:5,numCtx:4096,temperature:.7,ollamaUrl:process.env.OLLAMA_URL??"http://localhost:11434/api/chat",provider:"ollama",deepseek:{apiKey:process.env.DEEPSEEK_API_KEY??"",model:process.env.DEEPSEEK_MODEL??"deepseek-v4-flash"},tts:{pythonCommand:process.env.PYTHON_COMMAND??"python",voice:process.env.TTS_VOICE??"Ly"}};
export async function loadSettingsOverrides():Promise<Partial<Config>>{try{const raw=await fs.readFile("settings.json","utf8");const s=JSON.parse(raw);const o:Partial<Config>={};if(s.provider==="ollama"||s.provider==="deepseek")o.provider=s.provider;if(typeof s.ollamaModel==="string"&&s.ollamaModel.trim())o.model=s.ollamaModel.trim();if(typeof s.deepseekApiKey==="string"&&typeof s.deepseekModel==="string")o.deepseek={apiKey:s.deepseekApiKey,model:s.deepseekModel||"deepseek-v4-flash"};return o}catch{return{}}}
```

(Note: `import fs from "node:fs/promises";` and `import type {Config} from "./types.js";` keep this file's existing spaced-import style — only the object literal and new function body are dense, matching this file's own existing convention.)

- [ ] **Step 3: Add `settings.json` to `.gitignore`**

Read the file first, then add a line (anywhere is fine, e.g. after `.env.local`):
```
settings.json
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify `loadSettingsOverrides()` behavior with a throwaway script**

Create a temporary file `verify-settings-tmp.ts` at the repo root:
```ts
import { loadSettingsOverrides } from "./src/config.js";
console.log(JSON.stringify(await loadSettingsOverrides()));
```

Run: `npx tsx verify-settings-tmp.ts`
Expected: `{}` (no `settings.json` exists yet).

Create a test `settings.json`:
```json
{"provider":"deepseek","ollamaModel":"custom-model","deepseekApiKey":"sk-test-not-real","deepseekModel":"deepseek-v4-pro"}
```

Run: `npx tsx verify-settings-tmp.ts` again
Expected: `{"provider":"deepseek","model":"custom-model","deepseek":{"apiKey":"sk-test-not-real","model":"deepseek-v4-pro"}}`

Delete both `settings.json` and `verify-settings-tmp.ts` afterward. Run `git status --short` and confirm neither file appears (clean tree) — `settings.json` should already be impossible to accidentally commit per Step 3, but confirm anyway.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config.ts .gitignore
git commit -m "feat: add DeepSeek provider config and settings.json override loading"
```

---

### Task 2: DeepSeek calling in `src/ollama.ts`

**Files:**
- Modify: `src/ollama.ts`

**Interfaces:**
- Consumes: `Config.provider`, `Config.deepseek` (Task 1).
- Produces: `askLLM(c,p,o)` now branches to a new internal `askDeepSeek(c,p,o)` when `c.provider==="deepseek"` — same signature/return type as before (`Promise<string>`), so `askJSON`/`retryLLM`/every caller in `src/pipeline.ts` needs zero changes.

- [ ] **Step 1: Add the DeepSeek branch and `askDeepSeek`**

Read the file first, then replace the `askLLM` line:
```ts
export async function askLLM(c:Config,p:string,o:any={}):Promise<string>{const b:any={model:c.model,messages:[{role:"user",content:p}],stream:false,think:o.think??false,options:{temperature:o.temperature??c.temperature,top_p:.9,top_k:20,repeat_penalty:1.05,num_ctx:o.num_ctx??c.numCtx}};if(o.json)b.format="json";const r=await fetch(c.ollamaUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}),raw=await r.text();if(!r.ok)throw Error(`Ollama HTTP ${r.status}: ${raw}`);let d:any;try{d=JSON.parse(raw)}catch{throw Error(`Invalid Ollama response JSON:\n${raw}`)}if(d.error)throw Error(d.error);const content=d.message?.content?.trim()??"";if(!content)throw Error(`Ollama returned empty content.\n${raw}`);return content}
```
with:
```ts
export async function askLLM(c:Config,p:string,o:any={}):Promise<string>{if(c.provider==="deepseek")return askDeepSeek(c,p,o);const b:any={model:c.model,messages:[{role:"user",content:p}],stream:false,think:o.think??false,options:{temperature:o.temperature??c.temperature,top_p:.9,top_k:20,repeat_penalty:1.05,num_ctx:o.num_ctx??c.numCtx}};if(o.json)b.format="json";const r=await fetch(c.ollamaUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}),raw=await r.text();if(!r.ok)throw Error(`Ollama HTTP ${r.status}: ${raw}`);let d:any;try{d=JSON.parse(raw)}catch{throw Error(`Invalid Ollama response JSON:\n${raw}`)}if(d.error)throw Error(d.error);const content=d.message?.content?.trim()??"";if(!content)throw Error(`Ollama returned empty content.\n${raw}`);return content}
async function askDeepSeek(c:Config,p:string,o:any={}):Promise<string>{if(!c.deepseek.apiKey)throw Error("Chưa cấu hình DeepSeek API key. Vào Cài đặt để nhập.");const b:any={model:c.deepseek.model,messages:[{role:"user",content:p}],stream:false,temperature:o.temperature??c.temperature};if(o.json)b.response_format={type:"json_object"};const r=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${c.deepseek.apiKey}`},body:JSON.stringify(b)}),raw=await r.text();if(!r.ok)throw Error(`DeepSeek HTTP ${r.status}: ${raw}`);let d:any;try{d=JSON.parse(raw)}catch{throw Error(`Invalid DeepSeek response JSON:\n${raw}`)}if(d.error)throw Error(typeof d.error==="string"?d.error:JSON.stringify(d.error));const content=d.choices?.[0]?.message?.content?.trim()??"";if(!content)throw Error(`DeepSeek returned empty content.\n${raw}`);return content}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the missing-key error path (no real API call, no key needed)**

Create a temporary file `verify-deepseek-error-tmp.ts` at the repo root:
```ts
import { askLLM } from "./src/ollama.js";
const c = {
  model: "", language: "vi", durationMinutes: 60, targetWordsPerMinute: 150,
  chapters: 1, scenesPerChapter: 1, numCtx: 4096, temperature: 0.7,
  ollamaUrl: "", provider: "deepseek",
  deepseek: { apiKey: "", model: "deepseek-v4-flash" },
  tts: { pythonCommand: "python", voice: "Ly" }
};
try {
  await askLLM(c, "test", {});
  console.log("UNEXPECTED: did not throw");
} catch (e) {
  console.log("OK, threw as expected:", e.message);
}
```
Run: `npx tsx verify-deepseek-error-tmp.ts`
Expected: `OK, threw as expected: Chưa cấu hình DeepSeek API key. Vào Cài đặt để nhập.`

Delete `verify-deepseek-error-tmp.ts` afterward. Confirm `git status --short` is clean.

**Do not attempt a real DeepSeek API call in this step** — no API key is available to you, and per Global Constraints, a real key is only ever used directly by the controller, never embedded in a task brief or written to any file. The controller will run one real live call against the actual DeepSeek API as part of reviewing this task (see below) — this is expected and not something you need to do yourself.

- [ ] **Step 4: Commit**

```bash
git add src/ollama.ts
git commit -m "feat: call DeepSeek's chat completions API when Config.provider is deepseek"
```

---

### Task 3: Wire CLI and server to use settings overrides; add settings endpoints

**Files:**
- Modify: `src/index.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `loadSettingsOverrides` (Task 1), `askLLM`'s DeepSeek branch (Task 2).
- Produces: `GET /api/settings` → `{provider, ollamaModel, deepseekModel, deepseekApiKeySet}`; `POST /api/settings` (body `{provider, ollamaModel?, deepseekModel?, deepseekApiKey?}`) → `{saved:true}` or 400, writes `settings.json`. `POST /api/generate` now merges `loadSettingsOverrides()` into its effective config; the `model` field is dropped from the request body entirely (superseded by the global Settings screen — see Task 4).

- [ ] **Step 1: Wire the CLI (`src/index.ts`)**

Read the file first, then replace its full content:
```ts
import fs from"node:fs/promises";import path from"node:path";import{config}from"./config.js";import{generateStory}from"./pipeline.js";const arg=process.argv[2];if(!arg){console.error("Usage: npm run dev -- .\\stories\\example\\idea.txt");process.exit(1)}const file=path.resolve(arg);const idea=await fs.readFile(file,"utf8");await generateStory(config,idea.trim(),path.resolve("output",path.basename(file,path.extname(file))));
```
with:
```ts
import fs from"node:fs/promises";import path from"node:path";import{config,loadSettingsOverrides}from"./config.js";import{generateStory}from"./pipeline.js";const arg=process.argv[2];if(!arg){console.error("Usage: npm run dev -- .\\stories\\example\\idea.txt");process.exit(1)}const file=path.resolve(arg);const idea=await fs.readFile(file,"utf8");const effectiveConfig={...config,...await loadSettingsOverrides()};await generateStory(effectiveConfig,idea.trim(),path.resolve("output",path.basename(file,path.extname(file))));
```

- [ ] **Step 2: Import `loadSettingsOverrides` in `src/server.ts`**

Change:
```ts
import { config } from "./config.js";
```
to:
```ts
import { config, loadSettingsOverrides } from "./config.js";
```

- [ ] **Step 3: Add `GET`/`POST /api/settings`**

Insert right after the existing `/api/config` route block (after its closing `});`):
```ts
app.get("/api/settings", async (req, res) => {
  const overrides = await loadSettingsOverrides();
  res.json({
    provider: overrides.provider ?? config.provider,
    ollamaModel: overrides.model ?? config.model,
    deepseekModel: overrides.deepseek?.model ?? config.deepseek.model,
    deepseekApiKeySet: Boolean((overrides.deepseek?.apiKey ?? config.deepseek.apiKey).trim())
  });
});

app.post("/api/settings", async (req, res) => {
  const { provider, ollamaModel, deepseekModel, deepseekApiKey } = req.body ?? {};
  if (provider !== "ollama" && provider !== "deepseek") {
    return res.status(400).json({ error: "provider must be 'ollama' or 'deepseek'" });
  }

  const current = await loadSettingsOverrides();
  const settings = {
    provider,
    ollamaModel: (ollamaModel && String(ollamaModel).trim()) || current.model || config.model,
    deepseekApiKey: (deepseekApiKey && String(deepseekApiKey).trim()) || current.deepseek?.apiKey || config.deepseek.apiKey,
    deepseekModel: (deepseekModel && String(deepseekModel).trim()) || current.deepseek?.model || config.deepseek.model
  };

  await fs.writeFile("settings.json", JSON.stringify(settings, null, 2), "utf8");
  res.json({ saved: true });
});
```

- [ ] **Step 4: Apply settings overrides in `POST /api/generate`, drop the per-story `model` override**

Change the destructure line:
```ts
  const { name, idea, ideaFile, chapters, scenesPerChapter, durationMinutes, model } = req.body ?? {};
```
to:
```ts
  const { name, idea, ideaFile, chapters, scenesPerChapter, durationMinutes } = req.body ?? {};
```

Change the `jobConfig` block:
```ts
    const jobConfig: Config = {
      ...config,
      chapters: chapters ? Number(chapters) : config.chapters,
      scenesPerChapter: scenesPerChapter ? Number(scenesPerChapter) : config.scenesPerChapter,
      durationMinutes: durationMinutes ? Number(durationMinutes) : config.durationMinutes,
      model: model && String(model).trim() ? String(model).trim() : config.model
    };
```
to:
```ts
    const settingsOverrides = await loadSettingsOverrides();
    const baseConfig = { ...config, ...settingsOverrides };
    const jobConfig: Config = {
      ...baseConfig,
      chapters: chapters ? Number(chapters) : baseConfig.chapters,
      scenesPerChapter: scenesPerChapter ? Number(scenesPerChapter) : baseConfig.scenesPerChapter,
      durationMinutes: durationMinutes ? Number(durationMinutes) : baseConfig.durationMinutes
    };
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify settings endpoints and CLI/generate regression (no real DeepSeek call — use a fake key for the mechanics-only check)**

```bash
taskkill //F //IM node.exe
npm start &
sleep 2
curl -s http://localhost:4000/api/settings
curl -s -X POST http://localhost:4000/api/settings -H "Content-Type: application/json" -d "{}"
curl -s -X POST http://localhost:4000/api/settings -H "Content-Type: application/json" -d '{"provider":"deepseek","deepseekApiKey":"sk-fake-test-key","deepseekModel":"deepseek-v4-pro"}'
curl -s http://localhost:4000/api/settings
curl -s -X POST http://localhost:4000/api/settings -H "Content-Type: application/json" -d '{"provider":"deepseek","deepseekModel":"deepseek-v4-pro"}'
curl -s http://localhost:4000/api/settings
kill %1
rm settings.json
```
Expected:
- 1st call → `{"provider":"ollama","ollamaModel":"qwen3.5:9b","deepseekModel":"deepseek-v4-flash","deepseekApiKeySet":false}` (no `settings.json` yet).
- 2nd call (empty body) → 400 `{"error":"provider must be 'ollama' or 'deepseek'"}`.
- 3rd call → `{"saved":true}`.
- 4th call → `{"provider":"deepseek","ollamaModel":"qwen3.5:9b","deepseekModel":"deepseek-v4-pro","deepseekApiKeySet":true}`.
- 5th call (no `deepseekApiKey` in body this time) → `{"saved":true}` — confirms omitting the key keeps the previously-saved one.
- 6th call → still `"deepseekApiKeySet":true` (key was preserved, not wiped by the 5th call).

Then confirm CLI regression is unaffected (no `settings.json` present after the `rm` above):
```bash
npx tsx src/index.ts .\stories\example\idea.txt
```
Expected: same cached-resume log sequence as always (`[1/6] Story Bible...`, `[2/6] Outline...`, six `[CACHE] Chapter N...]` lines, `Done. Output: ...`) — proves `loadSettingsOverrides()` returning `{}` (no file) doesn't change CLI behavior.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/server.ts
git commit -m "feat: wire CLI and server to settings.json overrides; add /api/settings"
```

---

### Task 4: Frontend — Settings screen, remove per-story model field

**Files:**
- Modify: `public/index.html`
- Modify: `public/style.css`
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `GET`/`POST /api/settings` (Task 3).
- Produces: `#view-settings` section, `openSettings()`, `toggleProviderFields()`; removes `field-model` from the create form and its two references in `app.js`.

- [ ] **Step 1: `public/index.html` — add the Settings button, remove the Model field, add the Settings section**

Change:
```html
<section id="view-home">
  <button id="btn-new-story">+ Tạo truyện mới</button>
  <table id="story-table">
```
to:
```html
<section id="view-home">
  <button id="btn-new-story">+ Tạo truyện mới</button>
  <button id="btn-settings">⚙️ Cài đặt</button>
  <table id="story-table">
```

Change:
```html
    <fieldset>
      <legend>Cấu hình (để trống = mặc định)</legend>
      <label>Số chương <input type="number" id="field-chapters" min="1"></label>
      <label>Số cảnh/chương <input type="number" id="field-scenes" min="1"></label>
      <label>Thời lượng (phút) <input type="number" id="field-duration" min="1"></label>
      <label>Model Ollama <input type="text" id="field-model"></label>
    </fieldset>
```
to:
```html
    <fieldset>
      <legend>Cấu hình (để trống = mặc định)</legend>
      <label>Số chương <input type="number" id="field-chapters" min="1"></label>
      <label>Số cảnh/chương <input type="number" id="field-scenes" min="1"></label>
      <label>Thời lượng (phút) <input type="number" id="field-duration" min="1"></label>
    </fieldset>
```

Insert a new section right after `</section>` that closes `view-create` (i.e. right before `<section id="view-run" hidden>`):
```html
<section id="view-settings" hidden>
  <button class="btn-back" data-target="view-home">&larr; Quay lại</button>
  <h2>Cài đặt</h2>
  <form id="settings-form">
    <label>Nguồn LLM
      <select id="field-provider">
        <option value="ollama">Ollama (local)</option>
        <option value="deepseek">DeepSeek (cloud API)</option>
      </select>
    </label>

    <div id="settings-ollama">
      <label>Model Ollama <input type="text" id="field-ollama-model"></label>
    </div>

    <div id="settings-deepseek" hidden>
      <label>DeepSeek API Key <input type="password" id="field-deepseek-key"></label>
      <label>Model DeepSeek
        <select id="field-deepseek-model">
          <option value="deepseek-v4-flash">deepseek-v4-flash</option>
          <option value="deepseek-v4-pro">deepseek-v4-pro</option>
        </select>
      </label>
    </div>

    <p id="settings-message" hidden></p>
    <button type="submit">Lưu</button>
  </form>
</section>
```

- [ ] **Step 2: `public/style.css` — add styles for the settings button spacing and the save-status message**

Add these lines at the end of the file:
```css
#btn-settings { margin-left: 8px; }
.success { color: #4caf82; font-size: 14px; }
```

- [ ] **Step 3: `public/app.js` — remove `field-model` references**

Change in `openCreateForm`:
```js
  const res = await fetch("/api/config");
  const defaults = await res.json();
  document.getElementById("field-chapters").value = defaults.chapters;
  document.getElementById("field-scenes").value = defaults.scenesPerChapter;
  document.getElementById("field-duration").value = defaults.durationMinutes;
  document.getElementById("field-model").value = defaults.model;
}
```
to:
```js
  const res = await fetch("/api/config");
  const defaults = await res.json();
  document.getElementById("field-chapters").value = defaults.chapters;
  document.getElementById("field-scenes").value = defaults.scenesPerChapter;
  document.getElementById("field-duration").value = defaults.durationMinutes;
}
```

Change in the create-form submit handler:
```js
  const body = {
    name,
    chapters: document.getElementById("field-chapters").value || undefined,
    scenesPerChapter: document.getElementById("field-scenes").value || undefined,
    durationMinutes: document.getElementById("field-duration").value || undefined,
    model: document.getElementById("field-model").value.trim() || undefined
  };
```
to:
```js
  const body = {
    name,
    chapters: document.getElementById("field-chapters").value || undefined,
    scenesPerChapter: document.getElementById("field-scenes").value || undefined,
    durationMinutes: document.getElementById("field-duration").value || undefined
  };
```

- [ ] **Step 4: `public/app.js` — add the Settings screen logic**

Insert this block right after the existing:
```js
document.getElementById("btn-new-story").addEventListener("click", async () => {
  await loadIdeaFiles();
  openCreateForm(null);
});
```
and before `async function loadHome() {`:
```js
document.getElementById("btn-settings").addEventListener("click", () => {
  openSettings();
  show("view-settings");
});

document.getElementById("field-provider").addEventListener("change", () => {
  toggleProviderFields();
});

function toggleProviderFields() {
  const provider = document.getElementById("field-provider").value;
  document.getElementById("settings-ollama").hidden = provider !== "ollama";
  document.getElementById("settings-deepseek").hidden = provider !== "deepseek";
}

async function openSettings() {
  document.getElementById("settings-message").hidden = true;
  document.getElementById("field-deepseek-key").value = "";

  const res = await fetch("/api/settings");
  const data = await res.json();
  document.getElementById("field-provider").value = data.provider;
  document.getElementById("field-ollama-model").value = data.ollamaModel;
  document.getElementById("field-deepseek-model").value = data.deepseekModel;
  document.getElementById("field-deepseek-key").placeholder = data.deepseekApiKeySet
    ? "•••• đã lưu (để trống = giữ nguyên)"
    : "Chưa có key";
  toggleProviderFields();
}

document.getElementById("settings-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const messageEl = document.getElementById("settings-message");
  messageEl.hidden = true;

  const body = {
    provider: document.getElementById("field-provider").value,
    ollamaModel: document.getElementById("field-ollama-model").value.trim(),
    deepseekModel: document.getElementById("field-deepseek-model").value
  };
  const apiKey = document.getElementById("field-deepseek-key").value.trim();
  if (apiKey) body.deepseekApiKey = apiKey;

  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();

  messageEl.className = res.ok ? "success" : "error";
  messageEl.textContent = res.ok ? "Đã lưu." : (data.error || "Đã có lỗi xảy ra.");
  messageEl.hidden = false;

  if (res.ok) openSettings();
});
```

- [ ] **Step 5: Sanity-check syntax and static serving**

Run: `node --check public/app.js`
Expected: no output.

```bash
taskkill //F //IM node.exe
npm start &
sleep 2
curl -s http://localhost:4000/ | grep "view-settings"
curl -s http://localhost:4000/api/settings
kill %1
```
Expected: first grep finds a match (the new section is in the served HTML); second call returns the same JSON shape verified in Task 3.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/style.css public/app.js
git commit -m "feat: add Settings screen for choosing Ollama/DeepSeek provider"
```

---

### Task 5: Documentation and final end-to-end verification (includes a real DeepSeek call)

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none — this task only documents and verifies the whole feature.

**Task ownership:** Steps 1-3 (docs edit, commit, Ollama regression check) involve no secret and can be dispatched to an implementer normally. Steps 4-5 involve the real DeepSeek API key and, per Global Constraints, must be run directly by the controller — do not dispatch them to a subagent.

- [ ] **Step 1: Update `CLAUDE.md`**

Change:
```
A local pipeline that generates long-form Vietnamese drama stories via a local Ollama LLM, then optionally converts the finished story to voice-over audio via a local Python TTS worker (VieNeu-TTS with voice cloning). No cloud APIs — everything runs against `localhost:11434` (Ollama) and a local Python environment.
```
to:
```
A local pipeline that generates long-form Vietnamese drama stories via a local Ollama LLM (or, optionally, the DeepSeek cloud API — see Config below), then optionally converts the finished story to voice-over audio via a local Python TTS worker (VieNeu-TTS with voice cloning). By default everything runs locally against `localhost:11434` (Ollama) and a local Python environment; DeepSeek is an opt-in alternative for the story-generation LLM calls only.
```

Change:
```
### Config (`src/config.ts`, `src/types.ts`)

All tunables live in one `Config` object, overridable via env vars: `OLLAMA_MODEL`, `OLLAMA_URL`, `PYTHON_COMMAND`, `TTS_VOICE` (`src/tts/index.ts` imports `config` for these; it separately reads `TTS_REF_AUDIO`/`TTS_REF_TEXT` from env since those aren't in `Config`). Story length is controlled by `durationMinutes × targetWordsPerMinute`, chapter/scene count by `chapters`/`scenesPerChapter`.
```
to:
```
### Config (`src/config.ts`, `src/types.ts`)

All tunables live in one `Config` object, overridable via env vars: `OLLAMA_MODEL`, `OLLAMA_URL`, `PYTHON_COMMAND`, `TTS_VOICE`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (`src/tts/index.ts` imports `config` for the TTS ones; it separately reads `TTS_REF_AUDIO`/`TTS_REF_TEXT` from env since those aren't in `Config`). Story length is controlled by `durationMinutes × targetWordsPerMinute`, chapter/scene count by `chapters`/`scenesPerChapter`.

`Config.provider` (`"ollama"|"deepseek"`) selects which LLM backend `src/ollama.ts`'s `askLLM` calls — Ollama's `/api/chat` or DeepSeek's OpenAI-compatible `/chat/completions`, both behind the same `askJSON`/`retryLLM` retry wrappers, so nothing downstream of `askLLM` needs to know which provider is active. `loadSettingsOverrides()` (`src/config.ts`) reads an optional `settings.json` (git-ignored, repo root) and returns override fields; both the CLI (`src/index.ts`) and the web server (`src/server.ts`, `POST /api/generate`) merge it over the base `config` before each run, so switching provider via the web UI's Settings screen (`GET`/`POST /api/settings`) takes effect for the CLI too without restarting anything. Absent `settings.json` behaves exactly as before (`provider:"ollama"`).
```

- [ ] **Step 2: Commit the docs change**

```bash
git add CLAUDE.md
git commit -m "docs: document the DeepSeek provider option"
```

- [ ] **Step 3: Final regression check — Ollama path unaffected**

```bash
taskkill //F //IM node.exe
ls settings.json 2>/dev/null && echo "WARNING: settings.json exists, remove it before this check" || echo "OK, no settings.json"
npx tsx src/index.ts .\stories\example\idea.txt
```
Expected: same cached-resume log sequence as every prior check in this project (`[1/6] Story Bible...`, `[2/6] Outline...`, six `[CACHE] Chapter N...]` lines, `Done. Output: ...`).

- [ ] **Step 4: Real DeepSeek end-to-end test (controller-run only — requires the live API key, never write it to a file)**

This step is run directly by the controller (not delegated to a subagent), using the real DeepSeek API key the user provided in conversation, passed inline via environment variable only:

```bash
taskkill //F //IM node.exe
npm start &
sleep 2
curl -s -X POST http://localhost:4000/api/settings -H "Content-Type: application/json" -d '{"provider":"deepseek","deepseekApiKey":"<REAL_KEY_HERE>","deepseekModel":"deepseek-v4-flash"}'
curl -s -X POST http://localhost:4000/api/generate -H "Content-Type: application/json" -d '{"name":"deepseek-smoke-test","idea":"Một cô gái trẻ phát hiện bí mật gia đình ngay trước đám cưới.","chapters":1,"scenesPerChapter":1}'
```
Then poll `curl -s "http://localhost:4000/api/generate/stream?name=deepseek-smoke-test"` (or watch the server's stdout log) until a `{"type":"complete"}` or `{"type":"error",...}` event appears.

Expected: the job progresses through Story Bible → Outline → Chapter 1 (plan/write/memory/edit) → `complete`, producing a real `output/deepseek-smoke-test/final_story.txt` — proving the whole chain (Settings save → config override merge → `askDeepSeek` → real API response → JSON parsing → story pipeline) works end-to-end against the actual DeepSeek API, not just mocked/unit-level checks.

After the test: delete `output/deepseek-smoke-test/` (throwaway test data), and reset the provider back to Ollama or leave DeepSeek configured per the user's preference — ask the user which they'd like before changing it back, since this determines what `npm start`/`npm run dev` will do by default going forward.

- [ ] **Step 5: Confirm no secret leakage**

```bash
git log --all -p -- settings.json
git status --short
grep -r "DEEPSEEK_API_KEY\|sk-" --include="*.md" --include="*.ts" --include="*.js" --include="*.json" -l . 2>/dev/null | grep -v node_modules
```
Expected: first command returns nothing (settings.json was never committed); second shows a clean or expected-only tree (no stray `settings.json`/temp verify scripts); third finds no hardcoded key value anywhere in tracked source/doc files (matches on the *names* `DEEPSEEK_API_KEY`/generic `sk-` prefix in code are fine — e.g. `process.env.DEEPSEEK_API_KEY` — a real key *value* embedded in a file is not).
