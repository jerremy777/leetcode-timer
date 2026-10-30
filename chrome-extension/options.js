import { getSettings, saveSettings, idbGet, idbSet, writeAttemptFile } from "./shared.js";

const $ = (id) => document.getElementById(id);
let settings;

async function showFolder() {
  const dir = await idbGet("dir");
  $("folderName").textContent = dir ? `📁 ${dir.name}` : "No folder chosen";
  $("pick").textContent = dir ? "Change folder…" : "Choose folder…";
  if (dir) {
    const perm = await dir.queryPermission({ mode: "readwrite" });
    const note = $("permNote");
    note.classList.toggle("hidden", perm === "granted");
    note.textContent = "Chrome needs you to re-confirm access after a restart. Click “Write test file” and choose “Allow on every visit” if offered, so saves happen silently.";
  }
}

async function load() {
  settings = await getSettings();
  for (const d of ["Easy", "Medium", "Hard"]) $(d).value = settings.limits[d];
  $("subfolder").value = settings.subfolder;
  $("includeStatement").checked = settings.includeStatement;
  await showFolder();
}

async function persist() {
  for (const d of ["Easy", "Medium", "Hard"]) {
    const v = parseInt($(d).value, 10);
    if (v > 0) settings.limits[d] = v;
  }
  settings.subfolder = $("subfolder").value.trim().replace(/^\/+|\/+$/g, "");
  settings.includeStatement = $("includeStatement").checked;
  await saveSettings(settings);
  $("savedMsg").textContent = "Saved.";
  setTimeout(() => ($("savedMsg").textContent = ""), 1200);
}

$("pick").onclick = async () => {
  try {
    const dir = await window.showDirectoryPicker({ id: "lc-timer", mode: "readwrite" });
    await idbSet("dir", dir);
    await showFolder();
  } catch (e) {
    if (e.name !== "AbortError") alert(e.message);
  }
};

$("test").onclick = async () => {
  const res = await writeAttemptFile("_test.md", `# LeetCode Timer test\n\nWritten ${new Date().toLocaleString()}\n`, settings.subfolder, true);
  $("testResult").textContent = res.ok ? `✓ Wrote ${res.path}` : `✗ ${res.reason}${res.error ? ": " + res.error : ""}`;
  await showFolder();
};

for (const id of ["Easy", "Medium", "Hard", "subfolder", "includeStatement"]) $(id).addEventListener("change", persist);
load();
