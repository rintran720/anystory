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
    // Duyệt mọi panel thay vì gọi tên từng cái: thêm tab mới mà quên sửa chỗ này thì tab
    // cũ không bao giờ ẩn, và hai panel chồng lên nhau.
    document.querySelectorAll(".tab-panel").forEach(pane => { pane.hidden = pane.id !== `tab-${btn.dataset.tab}`; });
  });
});

// Rút ý tưởng từ video rồi ĐỔ VÀO ô soạn thảo, không tạo truyện luôn. Người dùng phải đọc
// được đúng thứ sắp dùng trước khi trả tiền cho một lượt sinh truyện đầy đủ.
document.getElementById("btn-yt-fetch").addEventListener("click", async () => {
  const url = document.getElementById("field-yt-url").value.trim();
  const msg = document.getElementById("yt-message");
  const btn = document.getElementById("btn-yt-fetch");
  const show = (cls, text) => { msg.hidden = false; msg.className = cls; msg.textContent = text; };
  if (!url) return show("error", "Dán link YouTube vào đã.");
  btn.disabled = true;
  show("hint", "Đang lấy bản ghi lời và rút ý tưởng. Video không có phụ đề thì phải nghe lại bằng Whisper, có thể mất vài phút...");
  try {
    const res = await fetch("/api/idea-from-youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, fidelity: document.getElementById("field-yt-fidelity").value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    document.getElementById("field-idea").value = data.idea;
    const nameField = document.getElementById("field-name");
    // Tên truyện thành tên thư mục, nên bỏ những ký tự Windows không nhận. Chỉ điền khi ô
    // còn trống - không giẫm lên tên người dùng đã tự đặt.
    if (!nameField.value.trim() && data.title)
      nameField.value = data.title.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 80);
    document.querySelector('.tab-btn[data-tab="paste"]').click();
    // Nói rõ bản ghi lấy từ đâu: phụ đề là chữ do người/máy YouTube ghi sẵn, còn Whisper là
    // máy nghe lại từ tiếng nói, sai sót khác hẳn nhau - người đọc ý tưởng cần biết mình
    // đang soi lại bản nào.
    const nguon = data.source === "whisper" ? "nghe bằng Whisper" : "phụ đề";
    show("success", `Đã rút ý tưởng từ "${data.title || data.videoId}" (${nguon}, ${data.transcriptWords} từ). Đọc lại và sửa ở tab Dán text trước khi tạo truyện.`);
  } catch (err) {
    show("error", String(err.message || err));
  } finally {
    btn.disabled = false;
  }
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

  const genreSelect = document.getElementById("field-genre");
  genreSelect.innerHTML = (defaults.genres ?? []).map(g => `<option value="${g.id}">${g.label}</option>`).join("");
  genreSelect.value = defaults.genre ?? "drama";
  // Thể loại nào tự khai hình dạng truyện của nó (hồi quy: 33 phút, 4 chương, 4 cảnh) thì đổi
  // dropdown là ba ô số nhảy theo. Không làm việc này thì người dùng chọn thể loại đo theo dải
  // 8.000 từ nhưng vẫn gửi lên 60 phút, và truyện ra đời đã lệch chuẩn trước khi viết chữ nào.
  // Vẫn sửa tay đè lên được: đây là giá trị gợi ý, không phải khoá.
  const applyGenreShape = () => {
    const shape = (defaults.genres ?? []).find(g => g.id === genreSelect.value)?.defaults;
    if (!shape) return;
    document.getElementById("field-duration").value = shape.durationMinutes;
    document.getElementById("field-chapters").value = shape.chapters;
    document.getElementById("field-scenes").value = shape.scenesPerChapter;
  };
  genreSelect.onchange = applyGenreShape;
  applyGenreShape();

  const settingSelect = document.getElementById("field-setting");
  settingSelect.innerHTML = (defaults.settings ?? []).map(s => `<option value="${s.id}">${s.label}</option>`).join("");
  settingSelect.value = defaults.setting ?? "auto";

  // Điều kiện phải TRÙNG KHÍT với cái server dùng để khoá: story_bible.json đã tồn tại
  // hay chưa - không phải "form có sẵn tên hay không". Truyện chết ngay ở ARCH chưa kịp
  // ghi bible vẫn mở bằng đúng form này, và nó vẫn được quyền chọn thể loại; giấu ô đi
  // là âm thầm ép nó về mặc định. Có bible thì ngược lại: server bỏ qua mọi giá trị gửi
  // lên, nên hiện ô ra là nói dối. Hỏi thẳng server câu đó qua hasBible.
  const locked = prefillName ? await storyHasBible(prefillName) : false;
  document.getElementById("field-genre-wrap").hidden = locked;
  document.getElementById("field-setting-wrap").hidden = locked;
}

// Trả lời của server cho đúng câu hỏi server tự hỏi. Hỏi không được (truyện chưa có thư
// mục, mạng lỗi) thì coi như chưa có bible: hiện ô ra, và nếu đoán sai thì server vẫn là
// chốt chặn cuối - nó bỏ qua giá trị gửi lên. Sai theo chiều này chỉ thừa một ô; sai theo
// chiều kia là mất quyền chọn thể loại mà không nói gì.
async function storyHasBible(name) {
  const res = await fetch(`/api/stories/${encodeURIComponent(name)}`).catch(() => null);
  if (!res || !res.ok) return false;
  const data = await res.json().catch(() => null);
  return Boolean(data?.hasBible);
}

// Ô đang bị giấu (chạy tiếp một truyện cũ) thì không gửi giá trị của nó lên.
function fieldIfShown(id) {
  const el = document.getElementById(id);
  return document.getElementById(`${id}-wrap`).hidden ? undefined : (el.value || undefined);
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
  document.getElementById("field-retries").value = data.maxRetries;
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
    maxRetries: document.getElementById("field-retries").value || undefined,
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
      <td>${genreSettingLabel(story)}</td>
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
    genre: fieldIfShown("field-genre"),
    setting: fieldIfShown("field-setting"),
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
  await loadVoices();

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
  // Nút "Sửa N chương" chạy theo thể loại/bối cảnh đóng dấu trong bible, không theo cài
  // đặt hiện tại - nên màn hình phải nói ra nó đang là truyện gì trước khi người dùng bấm.
  const genreEl = document.getElementById("run-genre");
  genreEl.hidden = !data.bible;
  genreEl.textContent = data.bible
    ? genreSettingLabel({ genre: data.bible.genreId ?? null, setting: data.bible.settingId ?? null })
    : "";
  state.currentReview = data.review;
  document.getElementById("review-panel").hidden = !data.bible && !data.outline;
  document.getElementById("btn-view-bible").hidden = !data.bible;
  document.getElementById("btn-view-outline").hidden = !data.outline;
  document.getElementById("btn-view-review").hidden = !data.review;
  setReviewActions(data);
  setHookPanel(data);
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
  const rounds = Math.max(1, Number(document.getElementById("field-fix-rounds").value) || 1);
  fixBtn.title = !data.review
    ? "Chấm điểm trước đã"
    : todo.length === 0
      ? "Không chương nào còn lỗi cao/vừa hay tiêu chí ≤5"
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
  if (todo.length) parts.push(`sửa ${todo.length} chương tốn khoảng ${todo.length * 3} lượt gọi mỗi vòng${rounds > 1 ? `, tối đa ${rounds} vòng` : ""}`);
  if (todo.length) parts.push("bản gốc luôn cất trong pre-fix/");
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
    model: document.getElementById("field-task-model").value || undefined,
    maxRounds: Number(document.getElementById("field-fix-rounds").value) || 1
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

// Đổi số vòng thì dòng ước tính chi phí phải đổi theo ngay, không đợi mở lại truyện.
document.getElementById("field-fix-rounds").addEventListener("input", () => {
  if (state.currentStoryName) refreshReviewPanel(state.currentStoryName);
});

document.getElementById("btn-review").addEventListener("click", () => runStoryTask("review"));
document.getElementById("btn-fix").addEventListener("click", () => runStoryTask("fix"));

// Ô soạn thảo hiện đúng hook.txt đang có trên đĩa. Chỉ nạp lại khi người dùng chưa động
// vào ô; nếu họ đang gõ dở thì để yên, vì mất một đoạn vừa gõ khó chịu hơn nhiều so với
// nhìn bản cũ chậm một nhịp.
function setHookPanel(data) {
  const panel = document.getElementById("hook-panel");
  panel.hidden = !data.hook;
  if (!data.hook) return;
  const box = document.getElementById("hook-text");
  if (box.value === (state.hookLoaded ?? "")) {
    box.value = data.hook;
    state.hookLoaded = data.hook;
  }
  // Đổi lời dẫn là dựng lại final_story.txt, nhưng file audio đã đọc xong thì không tự
  // đổi theo. Nói ra chứ không tự xoá: file audio là thứ tốn hàng giờ để dựng lại.
  const warn = document.getElementById("hook-warning");
  const hasAudio = Boolean((data.audioFiles && data.audioFiles.length) || data.finalAudio);
  warn.hidden = !hasAudio;
  warn.textContent = hasAudio
    ? "Truyện này đã có file audio. Đổi lời dẫn xong, audio cũ vẫn đọc bản cũ - phải chạy lại TTS mới khớp."
    : "";
}

async function runHookAction(method, label, busyText) {
  const name = state.currentStoryName;
  if (!name) return;
  const box = document.getElementById("hook-text");
  const msg = document.getElementById("hook-message");
  const saveBtn = document.getElementById("btn-hook-save");
  const rewriteBtn = document.getElementById("btn-hook-rewrite");
  saveBtn.disabled = true;
  rewriteBtn.disabled = true;
  msg.hidden = false;
  msg.className = "hint";
  msg.textContent = busyText;
  try {
    const body = method === "PUT"
      ? { text: box.value }
      : {
          provider: document.getElementById("field-task-provider").value || undefined,
          model: document.getElementById("field-task-model").value || undefined
        };
    const res = await fetch(`/api/hook/${encodeURIComponent(name)}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    box.value = data.hook;
    state.hookLoaded = data.hook;
    // Vòng lặp có quyền loại cả ba lượt viết lại rồi giữ nguyên bản cũ. Đó là kết quả hợp
    // lệ chứ không phải lỗi - nhưng phải nói thẳng ra, vì màn hình không đổi một chữ nào
    // thì người dùng chỉ có thể kết luận là nút hỏng.
    if (data.kept === false) {
      const last = (data.attempts ?? []).slice(-1)[0];
      msg.className = "warn";
      msg.textContent = `Giữ nguyên lời dẫn cũ: ${data.calls} lượt viết lại đều bị đo ra là tệ hơn`
        + (last && last.regressions && last.regressions.length ? ` — ${last.regressions.join("; ")}.` : ".");
      return;
    }
    msg.className = "success";
    msg.textContent = [
      label,
      data.calls > 1 ? `Phải ${data.calls} lượt mới đạt.` : "",
      (data.gains ?? []).length ? `Đo được: ${data.gains.join("; ")}.` : "",
      data.after ? `Nhịp câu ${data.before.avgSentence} → ${data.after.avgSentence} chữ/câu.` : "",
      data.chaptersFound !== null && data.chaptersFound < data.total
        ? `Truyện mới có ${data.chaptersFound}/${data.total} chương nên chưa dựng lại file truyện hoàn chỉnh.`
        : "Đã dựng lại file truyện hoàn chỉnh. Bản trước nằm ở pre-fix/hook.txt."
    ].filter(Boolean).join(" ");
  } catch (err) {
    msg.className = "error";
    msg.textContent = String(err.message || err);
  } finally {
    saveBtn.disabled = false;
    rewriteBtn.disabled = false;
  }
}

document.getElementById("btn-hook-save").addEventListener("click",
  () => runHookAction("PUT", "Đã lưu lời dẫn.", "Đang lưu..."));
document.getElementById("btn-hook-rewrite").addEventListener("click",
  () => runHookAction("POST", "Đã viết lại lời dẫn.", "Đang viết lại, việc này mất một lúc..."));

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

const GENRE_LABELS = { drama: "Drama gia đình", ngontinh: "Ngôn tình sủng", hoiquy: "Hồi quy báo thù" };
const SETTING_LABELS = { vietnam: "Việt Nam", china: "Trung Quốc" };

// Hai trường hợp khác hẳn nhau: KHÔNG có dấu (truyện đời cũ, đúng là drama/Việt Nam) và
// CÓ dấu nhưng lạ (thể loại thứ ba chưa có nhãn ở đây). Trường hợp sau phải hiện đúng id
// thô, gán bừa nhãn drama cho nó là dán sai nhãn lên một truyện ngôn tình hoặc hơn thế.
function genreSettingLabel(story) {
  const genre = story.genre ? (GENRE_LABELS[story.genre] ?? story.genre) : "Drama gia đình";
  const setting = story.setting ? (SETTING_LABELS[story.setting] ?? story.setting) : "Việt Nam";
  return `${genre} · ${setting}`;
}

// The two genres score chapters on different last-two criteria, so headers and
// cells both read their keys from the report itself rather than a hardcoded list -
// an unknown key still renders (as itself) instead of turning into "undefined".
const CRITERIA_LABELS_SHORT = {
  hook: "Hook", nhipDo: "Nhịp", showKhongTell: "Show", hoiThoai: "Thoại",
  cangThang: "Căng", nhanVat: "N.vật",
  ngotNgao: "Ngọt", namChinh: "Nam chính"
};
const CRITERIA_LABELS_FULL = {
  hook: "Hook", nhipDo: "Nhịp độ", showKhongTell: "Show không tell", hoiThoai: "Hội thoại",
  cangThang: "Căng thẳng", nhanVat: "Nhân vật",
  ngotNgao: "Độ ngọt", namChinh: "Nam chính"
};
const criteriaLabelShort = key => CRITERIA_LABELS_SHORT[key] ?? key;
const criteriaLabelFull = key => CRITERIA_LABELS_FULL[key] ?? key;
const criteriaKeys = scores => Object.keys(scores ?? {});
// Header and cells must read the same key set, or a score renders under the
// wrong heading - so both come from the first scored chapter in the report.
function reportCriteriaKeys(review) {
  return criteriaKeys((review?.chapters ?? []).find(c => c.scores)?.scores);
}
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

// Khung đo được (src/craft.ts). Báo cáo cũ không có trường này, và đó là trạng thái hợp lệ:
// nói thẳng "chưa đo" thay vì hiện một bảng rỗng trông như truyện không lỗi gì.
function renderCraft(craft) {
  const el = document.getElementById("review-craft");
  el.innerHTML = "";
  if (!craft) {
    el.innerHTML = '<p class="hint">Báo cáo này chưa có số đo khung — chấm điểm lại để có.</p>';
    return;
  }
  const chips = document.createElement("div");
  chips.className = "score-chips";
  for (const note of craft.notes ?? []) {
    const chip = document.createElement("span");
    chip.className = "score-chip";
    chip.textContent = note;
    chips.appendChild(chip);
  }
  el.appendChild(chips);
  if (craft.partial) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Truyện mới viết được một phần, mục tiêu độ dài đã co lại theo số chương đã có.";
    el.appendChild(p);
  }
  const list = document.createElement("ul");
  for (const v of craft.violations ?? []) {
    const li = document.createElement("li");
    li.textContent = v;
    list.appendChild(li);
  }
  if (!list.children.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Nằm trọn trong dải chuẩn.";
    el.appendChild(p);
  } else {
    el.appendChild(list);
  }
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
  // REVIEW_SUM đôi khi ghi chỉ số mảng 0-based vào "chapters" thay vì số chương thật, nên
  // báo cáo đã lưu trên đĩa có thể chứa "chương 0". Lọc ở đây chứ không chỉ chặn lúc sinh:
  // báo cáo cũ vẫn phải hiện đúng mà người dùng không phải trả tiền chấm lại. Một nhãn chỉ
  // sai chương tệ hơn không có nhãn nào - cùng lý lẽ với nhãn "cũ" của điểm lỗi thời.
  const realChapters = new Set((review?.chapters ?? []).map(c => Number(c.chapter)));
  for (const issue of summary?.topIssues ?? [])
    issuesEl.appendChild(issueCard(issue, (issue.chapters ?? []).filter(n => realChapters.has(Number(n)))));
  if (!issuesEl.children.length) issuesEl.innerHTML = '<p class="hint">Không có lỗi nào được nêu.</p>';

  renderCraft(review?.craft);

  const fixByChapter = new Map((fixReport?.fixes ?? []).map(f => [f.chapter, f]));
  const keys = reportCriteriaKeys(review);
  const header = document.getElementById("review-chapter-header");
  header.innerHTML = "";
  const chHeader = document.createElement("th");
  chHeader.textContent = "Ch.";
  header.appendChild(chHeader);
  for (const key of keys) {
    const th = document.createElement("th");
    th.textContent = criteriaLabelShort(key);
    th.title = criteriaLabelFull(key);
    header.appendChild(th);
  }
  const fixHeader = document.createElement("th");
  fixHeader.textContent = "Sửa";
  header.appendChild(fixHeader);

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

    for (const key of keys) {
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

  if (chapter.scores) {
    const scoresLine = document.createElement("p");
    scoresLine.className = "hint";
    scoresLine.textContent = criteriaKeys(chapter.scores)
      .map(key => `${criteriaLabelFull(key)}: ${chapter.scores[key] ?? "—"}`)
      .join(" · ");
    el.appendChild(scoresLine);
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
    const round = event.round > 1 ? `vòng ${event.round} — ` : "";
    setRunStatus(event.chapter
      ? `${round}Sửa chương ${event.chapter}/${event.total} (${event.status === "done" ? (event.kept ? "đã sửa" : "giữ bản gốc") : statusLabel(event.status)})`
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
  const refAudio = document.getElementById("field-ref-audio").value || undefined;
  const res = await fetch(`/api/tts/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ silenceGapMs, refAudio })
  });
  const data = await res.json();
  if (!res.ok) {
    setTtsStatus(`Lỗi: ${data.error}`);
    return;
  }

  connectTtsStream(name);
});

// Danh sách giọng đọc thẳng từ thư mục voices/, không hardcode: thả file mới vào là thấy
// ngay. Giọng chưa có file lời đọc đi kèm vẫn chạy được nên chỉ ghi chú chứ không loại -
// bản ghi lời giúp nhân bản sát hơn, không phải điều kiện bắt buộc.
async function loadVoices() {
  const el = document.getElementById("field-ref-audio");
  const data = await fetch("/api/voices").then(r => r.json()).catch(() => null);
  el.innerHTML = "";
  // Dựng bằng DOM chứ không ghép chuỗi HTML: tên file thật có dấu cách và ngoặc đơn
  // ("vi_female_hoaian_mb (mp3cut.net).mp3"), ghép chuỗi là mời lỗi vào nhà.
  for (const f of data?.files ?? [])
    el.appendChild(new Option(f.hasTranscript ? f.name : `${f.name} — chưa có lời đọc`, f.name));
  el.disabled = !el.options.length;
  if (!el.options.length) {
    el.appendChild(new Option("(thư mục voices/ chưa có file giọng nào)", ""));
    return;
  }
  if ([...el.options].some(o => o.value === data?.default)) el.value = data.default;
}

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
