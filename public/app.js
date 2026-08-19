const state = { currentStoryName: null, settingsProvider: "", selectedIssues: new Map(), generateSource: null, ttsSource: null, jobsSource: null, activeJobsKey: "", wordsPerMinute: 150, currentBible: null, currentOutline: null };

function suggestStructure(minutes, wpm) {
  const words = minutes * wpm;
  const chapters = Math.min(12, Math.max(3, Math.round(words / 1500)));
  const scenesPerChapter = Math.min(6, Math.max(2, Math.round((words / chapters) / 300)));
  return { chapters, scenesPerChapter };
}

function suggestFromDuration() {
  const minutes = Number(document.getElementById("field-duration").value);
  const hint = document.getElementById("suggest-hint");
  if (!minutes || minutes <= 0) {
    hint.hidden = true;
    return;
  }
  const { chapters, scenesPerChapter } = suggestStructure(minutes, state.wordsPerMinute);
  document.getElementById("field-chapters").value = chapters;
  document.getElementById("field-scenes").value = scenesPerChapter;
  hint.textContent = `Gợi ý theo ${minutes} phút: ${chapters} chương x ${scenesPerChapter} cảnh/chương.`;
  hint.hidden = false;
}

function show(viewId) {
  document.querySelectorAll("section").forEach(s => { s.hidden = true; });
  document.getElementById(viewId).hidden = false;
}

function closeStreams() {
  if (state.generateSource) { state.generateSource.close(); state.generateSource = null; }
  if (state.ttsSource) { state.ttsSource.close(); state.ttsSource = null; }
}

document.querySelectorAll(".btn-back").forEach(btn => {
  btn.addEventListener("click", () => {
    closeStreams();
    loadHome();
    show(btn.dataset.target);
  });
});

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-paste").hidden = btn.dataset.tab !== "paste";
    document.getElementById("tab-file").hidden = btn.dataset.tab !== "file";
  });
});

async function loadIdeaFiles() {
  const res = await fetch("/api/ideas");
  const data = await res.json();
  const select = document.getElementById("field-idea-file");
  select.innerHTML = "";
  for (const file of data.files) {
    const opt = document.createElement("option");
    opt.value = file;
    opt.textContent = file;
    select.appendChild(opt);
  }
}

function selectedIdeaFiles() {
  return [...document.getElementById("field-idea-file").selectedOptions].map(o => o.value);
}

function nameFromIdeaFile(file) {
  return file.split("/").pop().replace(/\.txt$/i, "").trim();
}

function updateFileSelectionHint() {
  const files = selectedIdeaFiles();
  const hint = document.getElementById("file-selection-hint");
  if (files.length < 2) {
    hint.hidden = true;
    return;
  }
  hint.textContent = `Sẽ tạo ${files.length} truyện: ${files.map(nameFromIdeaFile).join(", ")}`;
  hint.hidden = false;
}

async function openCreateForm(prefillName) {
  document.getElementById("create-form").reset();
  document.getElementById("create-error").hidden = true;
  document.getElementById("suggest-hint").hidden = true;
  document.getElementById("file-selection-hint").hidden = true;
  document.getElementById("field-run-until").value = "all";
  document.getElementById("field-chapter-limit-wrap").hidden = true;
  const nameField = document.getElementById("field-name");
  nameField.value = prefillName || "";
  nameField.readOnly = Boolean(prefillName);
  show("view-create");

  const res = await fetch("/api/config");
  const defaults = await res.json();
  state.wordsPerMinute = defaults.targetWordsPerMinute || 150;
  document.getElementById("field-chapters").value = defaults.chapters;
  document.getElementById("field-scenes").value = defaults.scenesPerChapter;
  document.getElementById("field-duration").value = defaults.durationMinutes;
}

document.getElementById("field-duration").addEventListener("input", suggestFromDuration);
document.getElementById("field-idea-file").addEventListener("change", updateFileSelectionHint);

document.getElementById("field-run-until").addEventListener("change", ev => {
  document.getElementById("field-chapter-limit-wrap").hidden = ev.target.value !== "chapters";
});

document.getElementById("btn-new-story").addEventListener("click", async () => {
  await loadIdeaFiles();
  openCreateForm(null);
});

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
  document.getElementById("settings-claude").hidden = provider !== "claude";
  populateEditorModels(provider);
}

// Editor-model options mirror the active provider's own model list, so there is
// no second list to keep in sync and no free-text field to mistype a name into.
function populateEditorModels(provider) {
  const el = document.getElementById("field-editor-model");
  const previous = el.value;
  const source = provider === "claude" ? "field-claude-model"
    : provider === "deepseek" ? "field-deepseek-model"
    : null;
  el.innerHTML = "";
  el.appendChild(new Option("(dùng model viết truyện)", ""));
  if (source) {
    for (const opt of document.getElementById(source).options) {
      el.appendChild(new Option(opt.textContent, opt.value));
    }
  }
  el.value = [...el.options].some(o => o.value === previous) ? previous : "";
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
  document.getElementById("field-claude-model").value = data.claudeModel;
  document.getElementById("field-parallel").value = data.maxParallelStories;
  document.getElementById("field-auto-review").checked = Boolean(data.autoReview);
  document.getElementById("field-auto-fix").checked = Boolean(data.autoFix);
  toggleProviderFields();
  document.getElementById("field-editor-model").value = data.editorModel || "";
}

document.getElementById("settings-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const messageEl = document.getElementById("settings-message");
  messageEl.hidden = true;

  const body = {
    provider: document.getElementById("field-provider").value,
    ollamaModel: document.getElementById("field-ollama-model").value.trim(),
    deepseekModel: document.getElementById("field-deepseek-model").value,
    claudeModel: document.getElementById("field-claude-model").value,
    maxParallelStories: document.getElementById("field-parallel").value || undefined,
    autoFix: document.getElementById("field-auto-fix").checked,
    autoReview: document.getElementById("field-auto-review").checked,
    editorModel: document.getElementById("field-editor-model").value
  };
  const apiKey = document.getElementById("field-deepseek-key").value.trim();
  if (apiKey) body.deepseekApiKey = apiKey;

  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();

  if (res.ok) {
    await openSettings();
    messageEl.className = "success";
    messageEl.textContent = "Đã lưu.";
    messageEl.hidden = false;
  } else {
    messageEl.className = "error";
    messageEl.textContent = data.error || "Đã có lỗi xảy ra.";
    messageEl.hidden = false;
  }
});

async function loadHome() {
  const res = await fetch("/api/stories");
  const data = await res.json();
  const body = document.getElementById("story-table-body");
  body.innerHTML = "";

  for (const story of data.stories) {
    const tr = document.createElement("tr");
    const busy = story.isRunning || story.isQueued;
    const statusText = story.isRunning
      ? "Đang chạy"
      : story.isQueued
        ? "Đang chờ trong hàng đợi"
        : story.hasFinalStory
          ? (story.hasAudio ? "Hoàn tất + Audio" : "Hoàn tất")
          : `Đã xong ${story.completedChapters}/${story.totalChapters || "?"} chương`;
    const actionLabel = busy ? "Xem tiến trình" : (story.hasFinalStory ? "Xem" : "Tiếp tục");

    tr.innerHTML = `
      <td></td>
      <td>${statusText}</td>
      <td class="${scoreClass(story.reviewScore)}" title="${story.staleChapters ? `${story.staleChapters} chương đã viết lại sau lần chấm điểm` : ""}">${story.reviewScore ?? "—"}${story.staleChapters ? " ⚠" : ""}</td>
      <td>
        <button data-resume="${!busy && !story.hasFinalStory}">${actionLabel}</button>
        <button class="btn-secondary" data-review="1" ${story.hasReview ? "" : 'disabled title="Chưa chấm điểm truyện này"'}>Báo cáo</button>
      </td>
    `;
    tr.querySelector("td").textContent = story.name;
    tr.querySelectorAll("button").forEach(b => (b.dataset.name = story.name));
    body.appendChild(tr);
  }

  body.querySelectorAll("button[data-name]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.review === "1") {
        openReview(btn.dataset.name);
      } else if (btn.dataset.resume === "true") {
        await loadIdeaFiles();
        openCreateForm(btn.dataset.name);
      } else {
        openStory(btn.dataset.name);
      }
    });
  });
}

function renderJobs(payload) {
  const active = payload.jobs.filter(j => j.status === "running" || j.status === "queued");
  const panel = document.getElementById("jobs-panel");
  const list = document.getElementById("jobs-list");

  document.getElementById("jobs-summary").textContent =
    `(${payload.running}/${payload.maxParallelStories} chạy song song, ${active.length - payload.running} đang chờ)`;
  panel.hidden = active.length === 0;
  list.innerHTML = "";

  for (const job of active) {
    const li = document.createElement("li");
    li.innerHTML = `<strong></strong> <span></span> <button data-open>Xem</button> <button data-stop>Dừng</button>`;
    li.querySelector("strong").textContent = job.name;
    const what = job.kind === "review" ? "chấm điểm" : job.kind === "fix" ? "sửa chương" : "viết truyện";
    li.querySelector("span").textContent = job.status === "running" ? `đang ${what}` : `chờ ${what} #${job.position}`;
    li.querySelector("[data-open]").addEventListener("click", () => openStory(job.name));
    li.querySelector("[data-stop]").addEventListener("click", () => stopJob(job.name));
    list.appendChild(li);
  }

  // Job vừa xong/lỗi thì bảng truyện đã cũ — chỉ tải lại khi tập job đang hoạt động đổi.
  const key = active.map(j => `${j.name}:${j.status}`).join("|");
  if (key !== state.activeJobsKey) {
    state.activeJobsKey = key;
    loadHome();
  }
}

function connectJobsStream() {
  const source = new EventSource("/api/jobs/stream");
  state.jobsSource = source;
  source.onmessage = ev => renderJobs(JSON.parse(ev.data));
}

async function stopJob(name) {
  await fetch("/api/generate/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
}

document.getElementById("btn-stop-all").addEventListener("click", async () => {
  await fetch("/api/generate/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ all: true })
  });
});

function showCreateError(message) {
  const el = document.getElementById("create-error");
  el.textContent = message || "Đã có lỗi xảy ra.";
  el.hidden = false;
}

document.getElementById("create-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  document.getElementById("create-error").hidden = true;

  const name = document.getElementById("field-name").value.trim();
  const activeTab = document.querySelector(".tab-btn.active").dataset.tab;

  const runUntil = document.getElementById("field-run-until").value;
  const body = {
    chapters: document.getElementById("field-chapters").value || undefined,
    scenesPerChapter: document.getElementById("field-scenes").value || undefined,
    durationMinutes: document.getElementById("field-duration").value || undefined,
    runUntil,
    chapterLimit: runUntil === "chapters" ? (document.getElementById("field-chapter-limit").value || undefined) : undefined
  };

  if (activeTab === "paste") {
    if (!name) {
      showCreateError("Nhập tên truyện.");
      return;
    }
    body.name = name;
    body.idea = document.getElementById("field-idea").value.trim();
  } else {
    const files = selectedIdeaFiles();
    if (files.length === 0) {
      showCreateError("Chọn ít nhất một file ý tưởng.");
      return;
    }
    if (files.length === 1) {
      body.name = name || nameFromIdeaFile(files[0]);
      body.ideaFile = files[0];
    } else {
      // Mỗi file là một truyện riêng, dùng chung cấu hình ở trên.
      body.items = files.map(file => ({ name: nameFromIdeaFile(file), ideaFile: file }));
    }
  }

  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();

  if (!res.ok) {
    showCreateError(data.error);
    return;
  }

  showHomeMessage(data.failed);
  if (data.names.length === 1) {
    openStory(data.names[0]);
  } else {
    await loadHome();
    show("view-home");
  }
});

function showHomeMessage(failed) {
  const el = document.getElementById("home-message");
  if (!failed || failed.length === 0) {
    el.hidden = true;
    return;
  }
  el.className = "error";
  el.textContent = `Bỏ qua ${failed.length} truyện: ${failed.map(f => `${f.name} (${f.error})`).join("; ")}`;
  el.hidden = false;
}

async function openStory(name) {
  closeStreams();
  state.currentStoryName = name;
  document.getElementById("run-title").textContent = name;
  document.getElementById("run-log").textContent = "";
  document.getElementById("run-result").hidden = true;
  document.getElementById("story-viewer").hidden = true;
  document.getElementById("tts-panel").hidden = true;
  document.getElementById("btn-stop").hidden = false;
  setProgressFill(0);
  setRunStatus("");
  show("view-run");

  connectGenerateStream(name);
  const data = await refreshReviewPanel(name);

  const cfg = await fetch("/api/config").then(r => r.json());
  document.getElementById("field-silence-gap").value = cfg.silenceGapMs;

  if (data.hasFinalStory) {
    document.getElementById("run-result").hidden = false;
    document.getElementById("btn-stop").hidden = true;
    setRunStatus("Đã hoàn tất.");
    setProgressFill(100);
  }
  if ((data.audioFiles && data.audioFiles.length) || data.finalAudio) {
    document.getElementById("tts-panel").hidden = false;
    showAudioFiles(name, data.audioFiles || []);
    showFinalAudio(name, data.finalAudio);
  }
}

async function refreshReviewPanel(name) {
  const res = await fetch(`/api/stories/${encodeURIComponent(name)}`);
  const data = await res.json();
  state.currentBible = data.bible;
  state.currentOutline = data.outline;
  state.currentReview = data.review;
  document.getElementById("review-panel").hidden = !data.bible && !data.outline;
  document.getElementById("btn-view-bible").hidden = !data.bible;
  document.getElementById("btn-view-outline").hidden = !data.outline;
  document.getElementById("btn-view-review").hidden = !data.review;
  setReviewActions(data);
  return data;
}

// Nút luôn hiện; mờ thì phải nói rõ vì sao mờ, và nút Sửa phải cho biết
// nó sắp đụng vào mấy chương trước khi bấm.
function setReviewActions(data) {
  const reviewBtn = document.getElementById("btn-review");
  const fixBtn = document.getElementById("btn-fix");
  const hint = document.getElementById("review-actions-hint");
  const chapters = data.completedChapters ?? 0;
  const todo = data.needsFixChapters ?? [];

  reviewBtn.textContent = data.review ? "Chấm điểm lại" : "Chấm điểm truyện";
  reviewBtn.disabled = chapters === 0;
  reviewBtn.title = chapters === 0 ? "Truyện chưa viết chương nào" : "";

  fixBtn.textContent = todo.length ? `Sửa ${todo.length} chương có lỗi` : "Sửa chương";
  fixBtn.disabled = todo.length === 0;
  fixBtn.title = !data.review
    ? "Chấm điểm trước đã"
    : todo.length === 0
      ? "Không chương nào có lỗi nặng hoặc điểm ≤5"
      : `Sẽ viết lại chương ${todo.join(", ")}`;

  ensureSettingsProvider().then(populateTaskModels);

  const stale = data.staleChapters ?? [];
  const warn = document.getElementById("review-actions-warning");
  warn.hidden = stale.length === 0;
  warn.textContent = stale.length
    ? `⚠ Chương ${stale.join(", ")} đã viết lại sau lần chấm điểm — điểm đang hiển thị là của bản cũ. Nên chấm điểm lại.`
    : "";

  const parts = [];
  if (data.review?.generatedAt) {
    parts.push(`Chấm lúc ${new Date(data.review.generatedAt).toLocaleString("vi-VN")}`);
    if (data.review.model) parts.push(`bằng ${data.review.provider}/${data.review.model}`);
    if (data.review.summary?.overall != null) parts.push(`điểm tổng ${data.review.summary.overall}`);
  } else if (chapters) {
    parts.push("Chưa chấm điểm truyện này.");
  }
  if (todo.length) parts.push(`bản gốc của chương được sửa giữ trong pre-fix/`);
  hint.textContent = parts.join(" · ");
}

// Danh sách model cho lượt chạy nhân bản từ dropdown của màn hình Cài đặt: một nguồn
// sự thật duy nhất, và không gõ tay được sai tên model.
async function ensureSettingsProvider() {
  if (!state.settingsProvider) {
    const data = await fetch("/api/settings").then(r => r.json()).catch(() => null);
    state.settingsProvider = data?.provider || "";
    const opt = document.getElementById("field-task-provider").options[0];
    if (state.settingsProvider) opt.textContent = `(theo cài đặt: ${state.settingsProvider})`;
  }
  return state.settingsProvider;
}

function populateTaskModels(providerId = "field-task-provider", modelId = "field-task-model") {
  // Bỏ trống nguồn = dùng nguồn trong Cài đặt, nhưng vẫn cho đổi riêng model,
  // vì "giữ nguồn, đổi model" mới là trường hợp hay dùng nhất.
  const provider = document.getElementById(providerId).value || state.settingsProvider;
  const el = document.getElementById(modelId);
  const previous = el.value;
  const source = provider === "claude" ? "field-claude-model"
    : provider === "deepseek" ? "field-deepseek-model"
    : null;
  el.innerHTML = "";
  el.appendChild(new Option("(theo cài đặt)", ""));
  if (source) {
    for (const opt of document.getElementById(source).options) el.appendChild(new Option(opt.textContent, opt.value));
  }
  el.disabled = !source;
  el.title = source ? "" : "Model Ollama đặt trong Cài đặt";
  el.value = [...el.options].some(o => o.value === previous) ? previous : "";
}

document.getElementById("field-task-provider").addEventListener("change", () => populateTaskModels());
document.getElementById("field-sel-provider").addEventListener("change",
  () => populateTaskModels("field-sel-provider", "field-sel-model"));

async function runStoryTask(kind, overrides = null) {
  const name = state.currentStoryName;
  const body = overrides ?? {
    provider: document.getElementById("field-task-provider").value || undefined,
    model: document.getElementById("field-task-model").value || undefined
  };
  const res = await fetch(`/api/${kind}/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    setRunStatus(`Không chạy được: ${data.error}`);
    return;
  }
  document.getElementById("btn-review").disabled = true;
  document.getElementById("btn-fix").disabled = true;
  document.getElementById("btn-stop").hidden = false;
  setProgressFill(0);
  setRunStatus(kind === "review" ? "Đã xếp hàng chấm điểm..." : "Đã xếp hàng sửa chương...");
  closeStreams();
  connectGenerateStream(name);
}

document.getElementById("btn-review").addEventListener("click", () => runStoryTask("review"));
document.getElementById("btn-fix").addEventListener("click", () => runStoryTask("fix"));

document.getElementById("btn-view-bible").addEventListener("click", () => {
  const el = document.getElementById("bible-text");
  el.textContent = JSON.stringify(state.currentBible, null, 2);
  el.hidden = false;
});

document.getElementById("btn-view-outline").addEventListener("click", () => {
  const el = document.getElementById("outline-text");
  el.textContent = JSON.stringify(state.currentOutline, null, 2);
  el.hidden = false;
});

document.getElementById("btn-view-review").addEventListener("click", () => {
  openReview(state.currentStoryName);
});

const CHAPTER_CRITERIA = ["hook", "nhipDo", "showKhongTell", "hoiThoai", "cangThang", "nhanVat"];
const SUMMARY_CRITERIA = [
  ["cauTruc", "Cấu trúc"], ["vongCungNhanVat", "Vòng cung nhân vật"], ["caoTrao", "Cao trào"],
  ["ketThuc", "Kết thúc"], ["doMoiLa", "Độ mới lạ"], ["bamMoralMotif", "Bám moral/motif"]
];

function scoreClass(value) {
  // Number(null) is 0, not NaN - without this guard a missing score reads as "hỏng".
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n <= 5 ? "score-bad" : n === 6 ? "score-mid" : "score-good";
}

async function openReview(name) {
  state.currentStoryName = name;
  const res = await fetch(`/api/stories/${encodeURIComponent(name)}`);
  const data = await res.json();
  state.selectedIssues.clear();
  updateSelectionBar();
  await ensureSettingsProvider();
  populateTaskModels("field-sel-provider", "field-sel-model");
  renderReview(name, data.review, data.fixReport, data.staleChapters);
  show("view-review");
}

function renderReview(name, review, fixReport, staleChapters = []) {
  const stale = new Set(staleChapters);
  document.getElementById("review-title").textContent = `Báo cáo review — ${name}`;

  const summary = review?.summary;
  const overallEl = document.getElementById("review-overall");
  overallEl.textContent = summary?.overall ?? "—";
  overallEl.className = "score-big " + scoreClass(summary?.overall);
  document.getElementById("review-verdict").textContent = summary?.verdict ?? "";

  const chips = document.getElementById("review-summary-scores");
  chips.innerHTML = "";
  for (const [key, label] of SUMMARY_CRITERIA) {
    const value = summary?.scores?.[key];
    const chip = document.createElement("span");
    chip.className = "score-chip " + scoreClass(value);
    chip.textContent = `${label} ${value ?? "—"}`;
    chips.appendChild(chip);
  }

  const issuesEl = document.getElementById("review-top-issues");
  issuesEl.innerHTML = "";
  for (const issue of summary?.topIssues ?? []) issuesEl.appendChild(issueCard(issue, issue.chapters));
  if (!issuesEl.children.length) issuesEl.innerHTML = '<p class="hint">Không có lỗi nào được nêu.</p>';

  const fixByChapter = new Map((fixReport?.fixes ?? []).map(f => [f.chapter, f]));
  const body = document.getElementById("review-chapter-body");
  body.innerHTML = "";
  document.getElementById("review-chapter-detail").innerHTML = "";

  const staleNote = document.getElementById("review-stale-note");
  staleNote.hidden = stale.size === 0;
  staleNote.textContent = stale.size
    ? `⚠ Chương ${[...stale].join(", ")} đã viết lại sau lần chấm điểm. Điểm của những chương đó là của bản cũ, không phải bản đang nằm trên đĩa.`
    : "";

  for (const chapter of review?.chapters ?? []) {
    const tr = document.createElement("tr");
    tr.className = "review-row";
    const first = document.createElement("td");
    first.textContent = chapter.chapter;
    if (stale.has(chapter.chapter)) {
      const badge = document.createElement("span");
      badge.className = "badge badge-stale";
      badge.textContent = "cũ";
      badge.title = "Chương đã viết lại sau lần chấm điểm này";
      first.append(" ", badge);
      tr.classList.add("row-stale");
    }
    tr.appendChild(first);

    for (const key of CHAPTER_CRITERIA) {
      const td = document.createElement("td");
      const value = chapter.scores?.[key];
      td.textContent = chapter.error ? "lỗi" : (value ?? "—");
      td.className = scoreClass(value);
      tr.appendChild(td);
    }

    const fix = fixByChapter.get(chapter.chapter);
    const fixCell = document.createElement("td");
    fixCell.textContent = fix ? (fix.kept ? "đã sửa" : "giữ gốc") : "—";
    if (fix?.note) fixCell.title = fix.note;
    tr.appendChild(fixCell);

    tr.addEventListener("click", () => showChapterDetail(chapter, fix));
    body.appendChild(tr);
  }
}

// Model output goes in via textContent, never innerHTML - it is prose we did not write.
function issueCard(issue, chapters, chapterNo = null, index = null) {
  const card = document.createElement("div");
  card.className = "issue-card";

  // Lỗi tổng hợp ở đầu báo cáo gộp nhiều chương nên không tick được; chỉ lỗi
  // thuộc đúng một chương mới ánh xạ được về chỉ số trong review-report.
  let checkbox = null;
  if (chapterNo !== null) {
    checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(state.selectedIssues.get(chapterNo)?.has(index));
    card.classList.toggle("picked", checkbox.checked);
    checkbox.addEventListener("change", () => {
      if (!state.selectedIssues.has(chapterNo)) state.selectedIssues.set(chapterNo, new Set());
      const set = state.selectedIssues.get(chapterNo);
      if (checkbox.checked) set.add(index); else set.delete(index);
      if (!set.size) state.selectedIssues.delete(chapterNo);
      card.classList.toggle("picked", checkbox.checked);
      updateSelectionBar();
    });
  }

  const head = document.createElement("p");
  head.className = "issue-head";
  if (checkbox) head.appendChild(checkbox);
  const badge = document.createElement("span");
  badge.className = "badge " + (issue.severity === "cao" ? "badge-high" : issue.severity === "vừa" ? "badge-mid" : "badge-low");
  badge.textContent = issue.severity ?? "?";
  head.appendChild(badge);
  if (chapters?.length) {
    const chip = document.createElement("span");
    chip.className = "chapter-chip";
    chip.textContent = "chương " + chapters.join(", ");
    head.appendChild(chip);
  }
  card.appendChild(head);

  const detail = document.createElement("p");
  detail.textContent = issue.detail ?? "";
  card.appendChild(detail);

  if (issue.suggestion) {
    const suggestion = document.createElement("p");
    suggestion.className = "issue-fix";
    suggestion.textContent = "→ " + issue.suggestion;
    card.appendChild(suggestion);
  }
  return card;
}

function updateSelectionBar() {
  const bar = document.getElementById("fix-selection-bar");
  const chapters = [...state.selectedIssues.keys()].sort((a, b) => a - b);
  const total = chapters.reduce((n, ch) => n + state.selectedIssues.get(ch).size, 0);
  bar.hidden = total === 0;
  document.getElementById("fix-selection-count").textContent =
    `Đã chọn ${total} lỗi ở chương ${chapters.join(", ")}. Bấm sửa sẽ viết lại đúng những chương đó theo các lỗi đã chọn, rồi kiểm lại từng lỗi xem đã hết chưa. Bản gốc luôn cất vào pre-fix/.`;
}

document.getElementById("btn-clear-selection").addEventListener("click", () => {
  state.selectedIssues.clear();
  updateSelectionBar();
  document.querySelectorAll("#review-chapter-detail input[type=checkbox]").forEach(el => { el.checked = false; });
  document.querySelectorAll("#review-chapter-detail .issue-card").forEach(el => el.classList.remove("picked"));
});

document.getElementById("btn-fix-selected").addEventListener("click", async () => {
  const selection = {};
  for (const [chapter, set] of state.selectedIssues) selection[chapter] = [...set];
  const name = state.currentStoryName;
  const provider = document.getElementById("field-sel-provider").value || undefined;
  const model = document.getElementById("field-sel-model").value || undefined;
  state.selectedIssues.clear();
  updateSelectionBar();
  // Nhảy về màn hình truyện trước: đó mới là chỗ có SSE, thanh tiến trình và nút Dừng.
  await openStory(name);
  await runStoryTask("fix", { selection, provider, model });
});

function showChapterDetail(chapter, fix) {
  const el = document.getElementById("review-chapter-detail");
  el.innerHTML = "";

  const heading = document.createElement("h4");
  heading.textContent = `Chương ${chapter.chapter}`;
  el.appendChild(heading);

  if (chapter.error) {
    const p = document.createElement("p");
    p.className = "error";
    p.textContent = "Chấm điểm thất bại: " + chapter.error;
    el.appendChild(p);
    return;
  }

  if (fix) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = fix.kept
      ? `Đã sửa, giữ bản mới — ${fix.note || "không rõ"}.`
      : `Giữ bản gốc — ${fix.note || "không rõ lý do"}.`;
    el.appendChild(p);
    if (fix.newProblems?.length) {
      const warn = document.createElement("p");
      warn.className = "warn";
      warn.textContent = `⚠ Lần sửa này có thể đã làm sinh lỗi mới: ${fix.newProblems.join(" · ")}. Bản trước khi sửa nằm ở pre-fix/chapter-${fix.chapter}.txt.`;
      el.appendChild(warn);
    }
  }

  (chapter.issues ?? []).forEach((issue, i) => el.appendChild(issueCard(issue, null, chapter.chapter, i)));

  if (chapter.strengths?.length) {
    const list = document.createElement("ul");
    list.className = "strengths";
    for (const item of chapter.strengths) {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    }
    el.appendChild(list);
  }
}

function setProgressFill(percent) {
  document.getElementById("run-progress-fill").style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function setRunStatus(text) {
  document.getElementById("run-status-text").textContent = text;
}

function appendLog(elId, text) {
  const el = document.getElementById(elId);
  el.textContent += text + "\n";
  el.scrollTop = el.scrollHeight;
}

function statusLabel(status) {
  return { start: "đang chạy", cache: "đã có sẵn", done: "xong" }[status] || status;
}

function sceneStatusLabel(status) {
  return { writing: "đang viết", done: "xong" }[status] || status;
}

function connectGenerateStream(name) {
  const source = new EventSource(`/api/generate/stream?name=${encodeURIComponent(name)}`);
  state.generateSource = source;
  source.onmessage = ev => handleGenerateEvent(JSON.parse(ev.data));
}

function handleGenerateEvent(event) {
  if (event.type === "idle") {
    state.generateSource?.close();
    return;
  }
  appendLog("run-log", `[${event.type}] ${JSON.stringify(event)}`);

  if (event.type === "queued") {
    setRunStatus(`Đang chờ trong hàng đợi (vị trí ${event.position})`);
  } else if (event.type === "started") {
    setRunStatus("Bắt đầu chạy...");
  } else if (event.type === "bible") {
    setRunStatus(`Story Bible (${statusLabel(event.status)})`);
  } else if (event.type === "outline") {
    setRunStatus(`Outline (${statusLabel(event.status)})`);
  } else if (event.type === "hook") {
    setRunStatus(`Lời dẫn (${statusLabel(event.status)})`);
  } else if (event.type === "outro") {
    setRunStatus(`Lời kết (${statusLabel(event.status)})`);
  } else if (event.type === "check") {
    setRunStatus(`Rà soát continuity (${statusLabel(event.status)})`);
  } else if (event.type === "review") {
    if (event.chapter && event.status === "done") setProgressFill((event.chapter / event.total) * 100);
    setRunStatus(event.summary
      ? "Tổng hợp báo cáo cả truyện (đang chạy)"
      : event.chapter
        ? `Chấm điểm chương ${event.chapter}/${event.total} (${statusLabel(event.status)})`
        : `Chấm điểm truyện (${statusLabel(event.status)})`);
  } else if (event.type === "fix") {
    if (event.chapter && event.status === "done") setProgressFill((event.chapter / event.total) * 100);
    setRunStatus(event.chapter
      ? `Sửa chương ${event.chapter}/${event.total} (${event.status === "done" ? (event.kept ? "đã sửa" : "giữ bản gốc") : statusLabel(event.status)})`
      : `Sửa chương theo báo cáo (${statusLabel(event.status)})`);
  } else if (event.type === "chapter") {
    const doneOffset = event.status === "done" || event.status === "cache" ? 0 : 1;
    setProgressFill(((event.chapter - doneOffset) / event.total) * 100);
    setRunStatus(`Chương ${event.chapter}/${event.total}: ${event.title} (${statusLabel(event.status)})`);
  } else if (event.type === "scene") {
    setRunStatus(`Chương ${event.chapter} - Cảnh ${event.scene}/${event.total}: ${event.title} (${sceneStatusLabel(event.status)})`);
  } else if (event.type === "edit") {
    setRunStatus(`Chương ${event.chapter}: Biên tập (${statusLabel(event.status)})`);
  } else if (event.type === "complete") {
    setProgressFill(100);
    setRunStatus("Đã hoàn tất.");
    document.getElementById("btn-stop").hidden = true;
    document.getElementById("run-result").hidden = false;
    refreshReviewPanel(state.currentStoryName);
  } else if (event.type === "stopped") {
    setRunStatus("Đã dừng. Xem lại kết quả rồi bấm Tiếp tục từ trang chủ nếu muốn chạy tiếp.");
    document.getElementById("btn-stop").hidden = true;
    refreshReviewPanel(state.currentStoryName);
  } else if (event.type === "error") {
    setRunStatus(`Lỗi: ${event.message}`);
    document.getElementById("btn-stop").hidden = true;
    showRetryButton();
  }
}

function showRetryButton() {
  if (document.getElementById("btn-retry")) return;
  const btn = document.createElement("button");
  btn.id = "btn-retry";
  btn.textContent = "Thử lại";
  btn.addEventListener("click", async () => {
    closeStreams();
    await loadIdeaFiles();
    openCreateForm(state.currentStoryName);
  });
  document.getElementById("run-log").after(btn);
}

document.getElementById("btn-stop").addEventListener("click", async () => {
  await stopJob(state.currentStoryName);
});

document.getElementById("btn-view-story").addEventListener("click", async () => {
  const res = await fetch(`/output/${encodeURIComponent(state.currentStoryName)}/final_story.txt`);
  const text = await res.text();
  document.getElementById("story-text").textContent = text;
  document.getElementById("story-viewer").hidden = false;
});

document.getElementById("btn-run-tts").addEventListener("click", async () => {
  const name = state.currentStoryName;
  document.getElementById("tts-panel").hidden = false;
  document.getElementById("tts-log").textContent = "";
  document.getElementById("tts-audio-list").innerHTML = "";
  document.getElementById("tts-final-audio").hidden = true;
  setTtsProgress(0);
  setTtsStatus("Đang bắt đầu...");

  const silenceGapMs = document.getElementById("field-silence-gap").value || undefined;
  const res = await fetch(`/api/tts/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ silenceGapMs })
  });
  const data = await res.json();
  if (!res.ok) {
    setTtsStatus(`Lỗi: ${data.error}`);
    return;
  }

  connectTtsStream(name);
});

function connectTtsStream(name) {
  const source = new EventSource(`/api/tts/${encodeURIComponent(name)}/stream`);
  state.ttsSource = source;
  source.onmessage = ev => handleTtsEvent(name, JSON.parse(ev.data));
}

function handleTtsEvent(name, event) {
  if (event.type === "idle") {
    state.ttsSource?.close();
    return;
  }
  appendLog("tts-log", `[${event.type}] ${JSON.stringify(event)}`);

  if (event.type === "segment") {
    setTtsProgress((event.index / event.total) * 100);
    setTtsStatus(`Đoạn ${event.index}/${event.total}${event.skipped ? " (đã có sẵn)" : ""}`);
  } else if (event.type === "complete") {
    setTtsProgress(100);
    setTtsStatus("Hoàn tất TTS.");
    loadAudioFiles(name);
  } else if (event.type === "error") {
    setTtsStatus(`Lỗi TTS: ${event.message}`);
  }
}

function setTtsProgress(percent) {
  document.getElementById("tts-progress-fill").style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function setTtsStatus(text) {
  document.getElementById("tts-status-text").textContent = text;
}

async function loadAudioFiles(name) {
  const res = await fetch(`/api/stories/${encodeURIComponent(name)}`);
  const data = await res.json();
  showAudioFiles(name, data.audioFiles || []);
  showFinalAudio(name, data.finalAudio);
}

function showFinalAudio(name, finalAudio) {
  const panel = document.getElementById("tts-final-audio");
  if (!finalAudio) {
    panel.hidden = true;
    return;
  }
  const url = `/output/${encodeURIComponent(name)}/${finalAudio}`;
  document.getElementById("tts-final-audio-player").src = url;
  document.getElementById("tts-final-audio-download").href = url;
  panel.hidden = false;
}

function showAudioFiles(name, files) {
  const container = document.getElementById("tts-audio-list");
  container.innerHTML = "";
  for (const file of files) {
    const wrapper = document.createElement("div");
    wrapper.className = "audio-item";
    wrapper.innerHTML = `
      <span>${file}</span>
      <audio controls src="/output/${encodeURIComponent(name)}/tts/audio/${encodeURIComponent(file)}"></audio>
    `;
    container.appendChild(wrapper);
  }
}

loadHome();
connectJobsStream();
show("view-home");
