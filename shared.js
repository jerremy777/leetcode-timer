// Shared helpers used by background, popup, options, offscreen and save pages.

export const DEFAULT_SETTINGS = {
  limits: { Easy: 15, Medium: 25, Hard: 40 },
  subfolder: "leetcode-attempts",
  includeStatement: true,
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    limits: { ...DEFAULT_SETTINGS.limits, ...((settings && settings.limits) || {}) },
  };
}

export async function saveSettings(s) {
  await chrome.storage.local.set({ settings: s });
}

// ---- IndexedDB: holds the FileSystemDirectoryHandle for the project folder ----
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("lc-timer", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction("kv").objectStore("kv").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Writes `content` to <picked folder>/<subfolder>/<filename>.
// interactive=true may show Chrome's permission prompt (needs a user click).
// Returns { ok, path } or { ok:false, reason: "no-folder" | "needs-permission" | "error", error }.
export async function writeAttemptFile(filename, content, subfolder, interactive = false) {
  const dir = await idbGet("dir");
  if (!dir) return { ok: false, reason: "no-folder" };
  const opts = { mode: "readwrite" };
  let perm = await dir.queryPermission(opts);
  if (perm !== "granted" && interactive) perm = await dir.requestPermission(opts);
  if (perm !== "granted") return { ok: false, reason: "needs-permission" };
  try {
    const target = subfolder ? await dir.getDirectoryHandle(subfolder, { create: true }) : dir;
    const fh = await target.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
    return { ok: true, path: `${dir.name}/${subfolder ? subfolder + "/" : ""}${filename}` };
  } catch (e) {
    return { ok: false, reason: "error", error: String(e && e.message ? e.message : e) };
  }
}

export function fmtClock(ms) {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${neg ? "+" : ""}${m}:${ss}`;
}
