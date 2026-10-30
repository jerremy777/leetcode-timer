// Floating countdown on the LeetCode page, so you don't need the popup open.
(() => {
  // If the extension was reloaded, an old copy of this script may still be in the tab but cut off
  // from the extension. Only skip if a *live* copy is already running; otherwise take over.
  try { if (window.__lcTimerAlive && window.__lcTimerAlive()) return; } catch (_) {}
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  window.__lcTimerAlive = alive;
  const stale = document.getElementById("lc-timer-overlay");
  if (stale) stale.remove();

  let session = null;
  let el = null;
  let ticker = null;
  let flashTimer = null;

  const slugFromUrl = () => (location.pathname.match(/^\/problems\/([^/]+)/) || [])[1];

  function fmt(ms) {
    const neg = ms < 0;
    const s = Math.floor(Math.abs(ms) / 1000);
    return `${neg ? "+" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function ensureEl() {
    if (el) return el;
    el = document.createElement("div");
    el.id = "lc-timer-overlay";
    el.innerHTML = `
      <span class="lct-clock"></span>
      <span class="lct-label"></span>
      <button class="lct-btn" data-act="primary"></button>
      <button class="lct-x" data-act="hide" title="Hide (timer keeps running)">×</button>`;
    el.addEventListener("click", (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (act === "hide") el.classList.add("lct-hidden");
      if (act === "primary") {
        e.target.disabled = true;
        chrome.runtime.sendMessage({ type: session.status === "timeup" ? "saveFinal" : "stop" });
      }
    });
    document.documentElement.appendChild(el);
    return el;
  }

  function render() {
    clearInterval(ticker);
    if (!alive()) { if (el) { el.remove(); el = null; } return; } // cut off by an extension reload
    const active = session && session.status !== "done" && session.problem.slug === slugFromUrl();
    if (!active) {
      if (session && session.status === "done" && el && session.problem.slug === slugFromUrl() && session.lastSave) {
        flashSaved();
      } else if (el) {
        el.remove(); el = null;
      }
      return;
    }
    ensureEl();
    el.classList.remove("lct-hidden", "lct-done");
    const timeup = session.status === "timeup";
    el.classList.toggle("lct-over", timeup);
    const btn = el.querySelector(".lct-btn");
    btn.disabled = false;
    btn.style.display = "";
    clearTimeout(flashTimer);
    btn.textContent = timeup ? "Save final" : "Done — save";
    const label = el.querySelector(".lct-label");
    if (timeup) {
      const ls = session.lastSave;
      label.textContent = !ls ? "Time's up — saving…" : ls.ok ? "Time's up — saved ✓" : "Time's up — finish saving in the new tab";
    } else {
      const n = (session.runs || []).length;
      label.textContent = `${session.problem.id}. ${session.problem.title}${n ? ` · ${n} run${n > 1 ? "s" : ""} recorded` : ""}`;
    }
    const clock = el.querySelector(".lct-clock");
    const tick = () => { clock.textContent = fmt(session.endsAt - Date.now()); };
    tick();
    ticker = setInterval(tick, 250);
  }

  function flashSaved() {
    ensureEl();
    el.classList.remove("lct-over", "lct-hidden");
    el.classList.add("lct-done");
    el.querySelector(".lct-clock").textContent = "✓";
    el.querySelector(".lct-label").textContent = session.lastSave.ok ? `Saved ${session.lastSave.path.split("/").pop()}` : "Finish saving in the new tab";
    el.querySelector(".lct-btn").style.display = "none";
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { if (el) { el.remove(); el = null; } }, 5000);
  }

  // Relay Run/Submit events from page_hook.js (page world) to the background worker.
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "lc-timer-hook") return;
    if (!alive()) return;
    try { chrome.runtime.sendMessage({ type: "runEvent", rec: e.data.rec }).catch(() => {}); } catch (_) {}
  });

  chrome.storage.local.get("session").then((r) => { session = r.session || null; render(); });
  chrome.storage.onChanged.addListener((c) => {
    if (c.session) { session = c.session.newValue || null; render(); }
  });

  // LeetCode is a single-page app: re-check when the URL changes.
  let lastPath = location.pathname;
  setInterval(() => { if (location.pathname !== lastPath) { lastPath = location.pathname; render(); } }, 1000);
})();
