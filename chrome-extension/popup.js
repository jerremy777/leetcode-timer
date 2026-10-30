import { getSettings, idbGet, fmtClock } from "./shared.js";

const view = document.getElementById("view");
const send = (msg) => chrome.runtime.sendMessage(msg);
let ticker = null;

document.getElementById("settings").onclick = () => chrome.runtime.openOptionsPage();
document.getElementById("pickFolder").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function problemHeader(p) {
  return `
    <p class="title">${esc(p.id)}. ${esc(p.title)}</p>
    <div class="meta">
      <span class="pill ${esc(p.difficulty)}">${esc(p.difficulty)}</span>
      ${p.tags.slice(0, 4).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
    </div>`;
}

function savedLine(s) {
  if (!s.lastSave) return s.status === "timeup" ? `<div class="saved">Saving…</div>` : "";
  const ls = s.lastSave;
  if (ls.ok) {
    const warn = ls.captureError ? `<br><span class="err">⚠ ${esc(ls.captureError)}</span>` : "";
    return `<div class="saved">✓ Saved to <b>${esc(ls.path)}</b>${warn}</div>`;
  }
  return `<div class="saved err">Not saved yet — finish it in the “Save attempt” tab (${esc(ls.reason || "error")}).</div>`;
}

async function render() {
  clearInterval(ticker);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const session = await send({ type: "getSession" });
  const hasFolder = !!(await idbGet("dir"));
  document.getElementById("folderWarn").classList.toggle("hidden", hasFolder);

  if (session && session.status !== "done") return renderSession(session);

  const m = tab && tab.url && tab.url.match(/^https:\/\/leetcode\.com\/problems\/([^/?#]+)/);
  if (!m) {
    view.innerHTML = (session ? savedLine(session) : "") +
      `<div class="empty">Open a LeetCode problem page to start a timed attempt.</div>`;
    return;
  }
  view.innerHTML = (session ? savedLine(session) : "") + `<div class="empty">Detecting problem…</div>`;
  const problem = await send({ type: "getProblem", tabId: tab.id, slug: m[1] });
  if (!problem || problem.error) {
    view.innerHTML = `<div class="empty">Couldn't read this problem.<br>${esc((problem && problem.error) || "")}</div>`;
    return;
  }
  renderStart(tab, problem, session);
}

async function renderStart(tab, problem, prevSession) {
  const settings = await getSettings();
  const suggested = settings.limits[problem.difficulty] || 25;
  let minutes = suggested;
  view.innerHTML = `
    ${prevSession ? savedLine(prevSession) + "<div style='height:10px'></div>" : ""}
    ${problemHeader(problem)}
    <div class="timebox">
      <button id="minus" title="−5 min">−</button>
      <div class="clock" id="clock">${minutes}:00</div>
      <button id="plus" title="+5 min">+</button>
    </div>
    <div class="hint">Suggested for ${esc(problem.difficulty)}: ${suggested} min</div>
    <button class="primary" id="start">Start</button>`;
  const clock = document.getElementById("clock");
  const set = (v) => { minutes = Math.max(5, Math.min(120, v)); clock.textContent = `${minutes}:00`; };
  document.getElementById("minus").onclick = () => set(minutes - 5);
  document.getElementById("plus").onclick = () => set(minutes + 5);
  document.getElementById("start").onclick = async () => {
    await send({ type: "start", tabId: tab.id, problem, minutes });
    render();
  };
}

function renderSession(s) {
  const timeup = s.status === "timeup";
  view.innerHTML = `
    ${problemHeader(s.problem)}
    <div class="timebox"><div class="clock ${timeup ? "over" : ""}" id="clock"></div></div>
    <div class="hint">${timeup ? "Time's up — overtime shown in red" : `${s.minutes}-minute limit`}</div>
    ${timeup
      ? `<button class="primary" id="final">Save final version</button>
         <div class="row"><button class="ghost" id="close">Close session</button></div>`
      : `<button class="primary" id="stop">Done — save now</button>
         <div class="row"><button class="ghost" id="cancel">Cancel (don't save)</button></div>`}
    ${savedLine(s)}`;
  const clock = document.getElementById("clock");
  const tick = () => { clock.textContent = fmtClock(s.endsAt - Date.now()); };
  tick();
  ticker = setInterval(tick, 250);
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on("stop", async (e) => { e.target.disabled = true; await send({ type: "stop" }); render(); });
  on("final", async (e) => { e.target.disabled = true; await send({ type: "saveFinal" }); render(); });
  on("cancel", async () => { await send({ type: "clear" }); render(); });
  on("close", async () => { await send({ type: "clear" }); render(); });
}

chrome.storage.onChanged.addListener((changes) => { if (changes.session) render(); });
render();
