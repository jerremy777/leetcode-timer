import { getSettings } from "./shared.js";

// Session shape (chrome.storage.local "session"):
// { problem, tabId, startedAt, endsAt, minutes, status: "running"|"timeup"|"done",
//   lastSave: { ok, path, reason, at, kind } }

const END_ALARM = "lc-end";
const TICK_ALARM = "lc-tick";

// Put the page scripts into a LeetCode tab that was open before the extension was (re)loaded.
// Chrome doesn't do this itself, so without it the overlay and run tracking stay dead until a refresh.
async function injectInto(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["page_hook.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (_) { /* tab closed or not injectable */ }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") chrome.runtime.openOptionsPage();
  const tabs = await chrome.tabs.query({ url: "https://leetcode.com/*" });
  for (const t of tabs) injectInto(t.id);
});

async function getSession() {
  return (await chrome.storage.local.get("session")).session || null;
}
async function setSession(s) {
  await chrome.storage.local.set({ session: s });
  await updateBadge(s);
}

// ---------------- Problem detection (runs inside the LeetCode tab) ----------------

function pageFetchProblem(slug) {
  // Executed in the page (isolated world). Same-origin fetch to LeetCode's GraphQL API.
  const query = `query q($titleSlug: String!) { question(titleSlug: $titleSlug) {
    questionFrontendId title titleSlug difficulty topicTags { name } content } }`;

  function htmlToMd(html) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const walk = (node) => {
      if (node.nodeType === 3) return node.textContent.replace(/ /g, " ");
      if (node.nodeType !== 1) return "";
      const tag = node.tagName.toLowerCase();
      const inner = () => [...node.childNodes].map(walk).join("");
      switch (tag) {
        case "pre": return "\n```\n" + node.textContent.replace(/ /g, " ").trim() + "\n```\n";
        case "code": return "`" + (node.children.length ? inner() : node.textContent) + "`";
        case "strong": case "b": { const t = inner(); return t.trim() ? `**${t.trim()}**` : t; }
        case "em": case "i": { const t = inner(); return t.trim() ? `*${t.trim()}*` : t; }
        case "sup": return "^" + inner();
        case "sub": return "_" + inner();
        case "li": return "\n- " + inner().trim();
        case "ul": case "ol": return "\n" + inner() + "\n";
        case "p": case "div": return "\n" + inner() + "\n";
        case "br": return "\n";
        case "img": return `![image](${node.getAttribute("src")})`;
        default: return inner();
      }
    };
    return walk(doc.body.firstChild).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return fetch("/graphql/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { titleSlug: slug } }),
  })
    .then((r) => r.json())
    .then((j) => {
      const q = j && j.data && j.data.question;
      if (!q) return { error: "LeetCode returned no data for this problem." };
      return {
        id: q.questionFrontendId,
        title: q.title,
        slug: q.titleSlug,
        difficulty: q.difficulty,
        tags: (q.topicTags || []).map((t) => t.name),
        url: `https://leetcode.com/problems/${q.titleSlug}/`,
        statementMd: htmlToMd(q.content),
      };
    })
    .catch((e) => ({ error: String(e) }));
}

async function fetchProblem(tabId, slug) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: pageFetchProblem, args: [slug] });
  return res && res.result;
}

// ---------------- Code capture (runs in the page's MAIN world to reach Monaco) ----------------

function pageGrabCode() {
  const ed = window.monaco && window.monaco.editor;
  if (!ed) return { error: "Monaco editor not found on page." };
  let models = [];
  if (typeof ed.getEditors === "function") {
    models = ed.getEditors().map((e) => e.getModel()).filter(Boolean);
  }
  if (!models.length) models = ed.getModels();
  const candidates = models.filter((m) => m.getLanguageId() !== "plaintext");
  const best = (candidates.length ? candidates : models).sort((a, b) => b.getValue().length - a.getValue().length)[0];
  if (!best) return { error: "No editor model found." };
  return { code: best.getValue(), lang: best.getLanguageId() };
}

async function findProblemTab(session) {
  const slug = session.problem.slug;
  try {
    const t = await chrome.tabs.get(session.tabId);
    if (t && t.url && t.url.includes(`/problems/${slug}/`)) return t.id;
  } catch (_) { /* tab closed */ }
  const tabs = await chrome.tabs.query({ url: `https://leetcode.com/problems/${slug}/*` });
  return tabs.length ? tabs[0].id : null;
}

async function captureCode(session) {
  const tabId = await findProblemTab(session);
  if (tabId == null) return { error: "The LeetCode tab for this problem was closed, so the code couldn't be captured." };
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: pageGrabCode });
    return (res && res.result) || { error: "Capture returned nothing." };
  } catch (e) {
    return { error: String(e) };
  }
}

// ---------------- Markdown ----------------

const FENCE = { python3: "python", python: "python", cpp: "cpp", c: "c", java: "java", csharp: "csharp",
  javascript: "javascript", typescript: "typescript", golang: "go", go: "go", rust: "rust", kotlin: "kotlin",
  swift: "swift", ruby: "ruby", scala: "scala", php: "php", mysql: "sql", sql: "sql", dart: "dart" };

function pad(n, w = 2) { return String(n).padStart(w, "0"); }
function localStamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function mmss(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

function buildFilename(session, kind) {
  const d = new Date(session.startedAt);
  const p = session.problem;
  const suffix = kind === "final" ? "-final" : "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}_${pad(p.id, 4)}-${p.slug}${suffix}.md`;
}

function fence(text, lang = "") {
  const t = String(text == null ? "" : text).replace(/\s+$/, "");
  const ticks = t.includes("```") ? "````" : "```";
  return [ticks + lang, t, ticks];
}

function trimList(a) {
  if (!Array.isArray(a)) return [];
  const out = a.slice();
  while (out.length && out[out.length - 1] === "") out.pop(); // LeetCode pads with a trailing ""
  return out;
}

function runResultLines(r) {
  if (!r) return ["- **Result:** _not captured (page closed or still running)_"];
  const L = [];
  const passed = r.compare ? [...r.compare].filter((c) => c === "1").length : r.totalCorrect;
  const total = r.compare ? r.compare.length : r.totalTestcases;
  const status = r.status || (r.correct ? "Accepted" : r.runSuccess ? "Wrong Answer" : "Error");
  L.push(`- **Result:** ${status}${total != null && passed != null ? ` (${passed}/${total} test cases passed)` : ""}`);
  if (r.compileError) L.push("", "Compile error:", ...fence(r.compileError));
  if (r.runtimeError) L.push("", "Runtime error:", ...fence(r.runtimeError));
  const ans = trimList(r.answers), exp = trimList(r.expected), out = trimList(r.stdout);
  if (ans.length || exp.length) {
    L.push("", "| Case | Your output | Expected | |", "|---|---|---|---|");
    const n = Math.max(ans.length, exp.length);
    for (let i = 0; i < n; i++) {
      const ok = r.compare ? r.compare[i] === "1" : ans[i] === exp[i];
      const cell = (v) => (v == null ? "—" : "`" + String(v).replace(/\|/g, "\\|").replace(/\n/g, " ") + "`");
      L.push(`| ${i + 1} | ${cell(ans[i])} | ${cell(exp[i])} | ${ok ? "✓" : "✗"} |`);
    }
  }
  if (r.lastTestcase) L.push("", "Failing input:", ...fence(r.lastTestcase));
  if (r.codeOutput != null || r.expectedOutput) {
    L.push("", `Your output: \`${r.codeOutput ?? "—"}\` · Expected: \`${r.expectedOutput ?? "—"}\``);
  }
  const printed = out.map((o, i) => (o && o.trim() ? `case ${i + 1}:\n${o.replace(/\s+$/, "")}` : "")).filter(Boolean);
  if (r.stdOutput) printed.push(r.stdOutput);
  if (printed.length) L.push("", "Printed output (stdout):", ...fence(printed.join("\n")));
  return L;
}

function runHistoryMd(session) {
  const runs = session.runs || [];
  if (!runs.length) return [];
  const nSub = runs.filter((r) => r.kind === "submit").length;
  const L = ["", `## Run history (${runs.length - nSub} run${runs.length - nSub === 1 ? "" : "s"}, ${nSub} submit${nSub === 1 ? "" : "s"})`, ""];
  let prevCode = null;
  runs.forEach((run, i) => {
    const t = mmss(run.at - session.startedAt);
    const st = run.result ? run.result.status || "" : "";
    L.push(`### Attempt ${i + 1} — ${run.kind === "submit" ? "Submit" : "Run"} at ${t}${run.overtime ? " (overtime)" : ""}${st ? ` — ${st}` : ""}`, "");
    if (run.kind === "run" && run.input) L.push("Test input:", ...fence(run.input), "");
    L.push(...runResultLines(run.result), "");
    if (run.code == null) L.push("_Code not captured._", "");
    else if (run.code === prevCode) L.push(`_Code unchanged from Attempt ${i}._`, "");
    else L.push("Code:", ...fence(run.code, FENCE[run.lang] || run.lang || ""), "");
    prevCode = run.code;
  });
  return L;
}

function buildMarkdown(session, capture, kind, settings) {
  const p = session.problem;
  const now = Date.now();
  const used = now - session.startedAt;
  const outcome = {
    timeup: "Ran out of time (auto-saved at 0:00)",
    early: "Stopped before the limit",
    final: `Final version after time ran out (${mmss(now - session.endsAt)} over)`,
  }[kind];
  const lang = capture.lang || "unknown";
  const lines = [
    `# ${p.id}. ${p.title} (${p.difficulty})`,
    "",
    `- **Link:** ${p.url}`,
    `- **Topics:** ${p.tags.length ? p.tags.join(", ") : "—"}`,
    `- **Started:** ${localStamp(new Date(session.startedAt))}`,
    `- **Time limit:** ${session.minutes} min`,
    `- **Time used:** ${mmss(used)}`,
    `- **Outcome:** ${outcome}`,
    `- **Language:** ${lang}`,
    "",
    "## My code",
    "",
  ];
  if (capture.code != null) {
    lines.push("```" + (FENCE[lang] || lang), capture.code.replace(/\s+$/, ""), "```");
  } else {
    lines.push(`_Code not captured: ${capture.error}_`);
  }
  lines.push(...runHistoryMd(session));
  lines.push("", "## Where I'm stuck / what I want feedback on", "", "_(optional — jot a note here before asking Claude)_", "");
  if (settings.includeStatement && p.statementMd) {
    lines.push("## Problem statement", "", p.statementMd, "");
  }
  return lines.join("\n");
}

// ---------------- Writing (offscreen document holds the folder handle) ----------------

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Write saved LeetCode attempts to the folder chosen in settings (File System Access API).",
  });
}

async function writeFile(filename, content) {
  const settings = await getSettings();
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "write", filename, content, subfolder: settings.subfolder });
  if (res && res.ok) return res;
  // Couldn't write silently: park it and open a page where one click finishes the save.
  await chrome.storage.local.set({ pending: { filename, content, subfolder: settings.subfolder, reason: res && res.reason } });
  await chrome.tabs.create({ url: chrome.runtime.getURL("save.html"), active: true });
  return res || { ok: false, reason: "error" };
}

async function saveAttempt(session, kind) {
  const settings = await getSettings();
  const capture = await captureCode(session);
  const filename = buildFilename(session, kind);
  const md = buildMarkdown(session, capture, kind, settings);
  const res = await writeFile(filename, md);
  return { ok: !!res.ok, path: res.path || `${settings.subfolder}/${filename}`, reason: res.reason, at: Date.now(), kind,
    captureError: capture.error || null };
}

// ---------------- Timer lifecycle ----------------

// All session writes go through this queue, so a Run event arriving mid-save isn't overwritten.
let queue = Promise.resolve();
function locked(fn) {
  const p = queue.then(fn);
  queue = p.catch(() => {});
  return p;
}

// A Run/Submit seen by page_hook.js: first the code (result null), then the same id with the result.
async function recordRun(rec) {
  const s = await getSession();
  if (!s || s.status === "done" || !rec || rec.slug !== s.problem.slug) return;
  s.runs = s.runs || [];
  const i = s.runs.findIndex((r) => r.id === rec.id);
  if (i >= 0) s.runs[i] = { ...s.runs[i], result: rec.result || s.runs[i].result };
  else s.runs.push({ ...rec, overtime: s.status === "timeup" });
  await setSession(s);
}

async function start({ tabId, problem, minutes }) {
  const now = Date.now();
  const session = { problem, tabId, minutes, startedAt: now, endsAt: now + minutes * 60000, status: "running", lastSave: null, runs: [] };
  await chrome.alarms.clear(END_ALARM);
  await chrome.alarms.create(END_ALARM, { when: session.endsAt });
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
  await setSession(session);
  await injectInto(tabId); // no-op if the tab's scripts are already live
  return session;
}

async function onTimeUp() {
  const s = await getSession();
  if (!s || s.status !== "running") return;
  s.status = "timeup";
  await setSession(s); // overlay flips to "time's up" immediately
  s.lastSave = await saveAttempt(s, "timeup");
  await setSession(s);
  chrome.notifications.create("lc-timeup", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: `Time's up — ${s.problem.id}. ${s.problem.title}`,
    message: s.lastSave.ok ? `Saved to ${s.lastSave.path}` : "Click 'Save' in the tab that opened to finish saving.",
  });
}

async function stopEarly() {
  const s = await getSession();
  if (!s || s.status !== "running") return s;
  await chrome.alarms.clear(END_ALARM);
  s.status = "done";
  s.lastSave = await saveAttempt(s, "early");
  await setSession(s);
  await chrome.alarms.clear(TICK_ALARM);
  return s;
}

async function saveFinal() {
  const s = await getSession();
  if (!s || s.status !== "timeup") return s;
  s.status = "done";
  s.lastSave = await saveAttempt(s, "final");
  await setSession(s);
  await chrome.alarms.clear(TICK_ALARM);
  return s;
}

async function clearSession() {
  await chrome.alarms.clear(END_ALARM);
  await chrome.alarms.clear(TICK_ALARM);
  await chrome.storage.local.remove("session");
  await updateBadge(null);
}

async function updateBadge(s) {
  if (!s || s.status === "done") {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  if (s.status === "timeup") {
    await chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
    await chrome.action.setBadgeText({ text: "0:00" });
    return;
  }
  const left = Math.max(0, s.endsAt - Date.now());
  await chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
  await chrome.action.setBadgeText({ text: `${Math.ceil(left / 60000)}m` });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === END_ALARM) await locked(onTimeUp);
  if (alarm.name === TICK_ALARM) {
    const s = await getSession();
    await updateBadge(s);
    // Safety net in case the end alarm was missed (e.g. laptop slept through it).
    if (s && s.status === "running" && Date.now() >= s.endsAt) await locked(onTimeUp);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === "offscreen") return false;
  (async () => {
    switch (msg.type) {
      case "getProblem": return fetchProblem(msg.tabId, msg.slug);
      case "start": return locked(() => start(msg));
      case "stop": return locked(stopEarly);
      case "saveFinal": return locked(saveFinal);
      case "clear": return locked(clearSession);
      case "runEvent": return locked(() => recordRun(msg.rec));
      case "getSession": return getSession();
      default: return null;
    }
  })().then(sendResponse, (e) => sendResponse({ error: String(e) }));
  return true;
});
