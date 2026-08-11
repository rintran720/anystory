const state = { currentStoryName: null, generateSource: null, ttsSource: null };

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
  const nameField = document.getElementById("field-name");
  nameField.value = prefillName || "";
  nameField.readOnly = Boolean(prefillName);
  show("view-create");

  const res = await fetch("/api/config");
  const defaults = await res.json();
  document.getElementById("field-chapters").value = defaults.chapters;
  document.getElementById("field-scenes").value = defaults.scenesPerChapter;
  document.getElementById("field-duration").value = defaults.durationMinutes;
  document.getElementById("field-model").value = defaults.model;
}

document.getElementById("btn-new-story").addEventListener("click", async () => {
  await loadIdeaFiles();
  openCreateForm(null);
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

  const body = {
    name,
    chapters: document.getElementById("field-chapters").value || undefined,
    scenesPerChapter: document.getElementById("field-scenes").value || undefined,
    durationMinutes: document.getElementById("field-duration").value || undefined,
    model: document.getElementById("field-model").value.trim() || undefined
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

  const res = await fetch(`/api/stories/${encodeURIComponent(name)}`);
  const data = await res.json();
  if (data.hasFinalStory) {
    document.getElementById("run-result").hidden = false;
    document.getElementById("btn-stop").hidden = true;
    setRunStatus("Đã hoàn tất.");
    setProgressFill(100);
  }
  if (data.audioFiles && data.audioFiles.length) {
    showAudioFiles(name, data.audioFiles);
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
  return { writing: "đang viết", memory: "đang cập nhật memory", done: "xong" }[status] || status;
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
  } else if (event.type === "stopped") {
    setRunStatus("Đã dừng.");
    document.getElementById("btn-stop").hidden = true;
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
  setTtsProgress(0);
  setTtsStatus("Đang bắt đầu...");

  const res = await fetch(`/api/tts/${encodeURIComponent(name)}`, { method: "POST" });
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
