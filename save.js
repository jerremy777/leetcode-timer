import { idbGet, idbSet, writeAttemptFile } from "./shared.js";

const $ = (id) => document.getElementById(id);

async function init() {
  const { pending } = await chrome.storage.local.get("pending");
  if (!pending) {
    $("why").textContent = "Nothing waiting to be saved.";
    $("save").classList.add("hidden");
    return;
  }
  const hasDir = !!(await idbGet("dir"));
  $("fname").textContent = `${pending.subfolder ? pending.subfolder + "/" : ""}${pending.filename}`;
  $("preview").textContent = pending.content;
  $("why").textContent = hasDir
    ? "Chrome needs one click to re-allow writing to your folder (it resets after a browser restart)."
    : "No save folder has been chosen yet — pick your Job Search folder.";
  if (!hasDir) { $("save").classList.add("hidden"); $("choose").classList.remove("hidden"); }

  $("choose").onclick = async () => {
    try {
      const dir = await window.showDirectoryPicker({ id: "lc-timer", mode: "readwrite" });
      await idbSet("dir", dir);
      await doSave(pending);
    } catch (e) { if (e.name !== "AbortError") $("result").textContent = e.message; }
  };
  $("save").onclick = () => doSave(pending);
}

async function doSave(pending) {
  const res = await writeAttemptFile(pending.filename, pending.content, pending.subfolder, true);
  if (res.ok) {
    await chrome.storage.local.remove("pending");
    const { session } = await chrome.storage.local.get("session");
    if (session && session.lastSave && !session.lastSave.ok) {
      session.lastSave = { ...session.lastSave, ok: true, path: res.path };
      await chrome.storage.local.set({ session });
    }
    $("result").textContent = `✓ Saved to ${res.path}. Closing…`;
    $("save").disabled = true;
    setTimeout(() => window.close(), 1500);
  } else {
    $("result").textContent = `✗ Couldn't save (${res.reason}${res.error ? ": " + res.error : ""}).`;
  }
}

init();
