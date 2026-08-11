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

function openCreateForm(prefillName) {
  document.getElementById("create-form").reset();
  document.getElementById("create-error").hidden = true;
  const nameField = document.getElementById("field-name");
  nameField.value = prefillName || "";
  nameField.readOnly = Boolean(prefillName);
  show("view-create");
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
      <td>${story.name}</td>
      <td>${statusText}</td>
      <td><button data-name="${story.name}" data-resume="${!story.isRunning && !story.hasFinalStory}">${actionLabel}</button></td>
    `;
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

// Minimal for now — Task 8 replaces this with full SSE wiring.
function openStory(name) {
  state.currentStoryName = name;
  document.getElementById("run-title").textContent = name;
  show("view-run");
}

loadHome();
show("view-home");
