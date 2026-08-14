const state = { currentStoryName: null, generateSource: null, ttsSource: null, wordsPerMinute: 150, currentBible: null, currentOutline: null };

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

async function openCreateForm(prefillName) {
  document.getElementById("create-form").reset();
  document.getElementById("create-error").hidden = true;
  document.getElementById("suggest-hint").hidden = true;
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
  toggleProviderFields();
}

document.getElementById("settings-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const messageEl = document.getElementById("settings-message");
  messageEl.hidden = true;

  const body = {
    provider: document.getElementById("field-provider").value,
    ollamaModel: document.getElementById("field-ollama-model").value.trim(),
    deepseekModel: document.getElementById("field-deepseek-model").value,
    claudeModel: document.getElementById("field-claude-model").value
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
    const statusText = story.isRunning
      ? "Đang chạy"
      : story.hasFinalStory
        ? (story.hasAudio ? "Hoàn tất + Audio" : "Hoàn tất")
        : `Đã xong ${story.completedChapters}/${story.totalChapters || "?"} chương`;
    const actionLabel = story.isRunning ? "Xem tiến trình" : (story.hasFinalStory ? "Xem" : "Tiếp tục");

    tr.innerHTML = `
      <td></td>
      <td>${statusText}</td>
      <td><button data-resume="${!story.isRunning && !story.hasFinalStory}">${actionLabel}</button></td>
    `;
    tr.querySelector("td").textContent = story.name;
    tr.querySelector("button").dataset.name = story.name;
    body.appendChild(tr);
  }

  body.querySelectorAll("button[data-name]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.resume === "true") {
        await loadIdeaFiles();
        openCreateForm(btn.dataset.name);
      } else {
        openStory(btn.dataset.name);
      }
    });
  });
}

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
    name,
    chapters: document.getElementById("field-chapters").value || undefined,
    scenesPerChapter: document.getElementById("field-scenes").value || undefined,
    durationMinutes: document.getElementById("field-duration").value || undefined,
    runUntil,
    chapterLimit: runUntil === "chapters" ? (document.getElementById("field-chapter-limit").value || undefined) : undefined
  };

  if (activeTab === "paste") {
    body.idea = document.getElementById("field-idea").value.trim();
  } else {
    body.ideaFile = document.getElementById("field-idea-file").value;
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

  openStory(name);
});

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
  await refreshReviewPanel(name);

  const cfg = await fetch("/api/config").then(r => r.json());
  document.getElementById("field-silence-gap").value = cfg.silenceGapMs;

  const res = await fetch(`/api/stories/${encodeURIComponent(name)}`);
  const data = await res.json();
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
  document.getElementById("review-panel").hidden = !data.bible && !data.outline;
  document.getElementById("btn-view-bible").hidden = !data.bible;
  document.getElementById("btn-view-outline").hidden = !data.outline;
}

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

  if (event.type === "bible") {
    setRunStatus(`Story Bible (${statusLabel(event.status)})`);
  } else if (event.type === "outline") {
    setRunStatus(`Outline (${statusLabel(event.status)})`);
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
  await fetch("/api/generate/stop", { method: "POST" });
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
show("view-home");
