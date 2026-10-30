// Runs in the LeetCode page itself (MAIN world) so it can see the page's network calls.
// When you press Run or Submit, LeetCode POSTs your code to .../interpret_solution/ or .../submit/,
// then polls /submissions/detail/<id>/check/ until the result is ready. We watch those calls and
// hand each run (code + result) to the extension via window.postMessage. Nothing is modified.
(() => {
  if (window.__lcTimerHooked) return;
  window.__lcTimerHooked = true;

  const START_RE = /\/problems\/([^/]+)\/(interpret_solution|submit)\/?(?:\?|$)/;
  const CHECK_RE = /\/submissions\/detail\/([^/]+)\/check\/?(?:\?|$)/;
  const pending = new Map(); // id -> record

  const post = (rec) => window.postMessage({ source: "lc-timer-hook", rec }, location.origin);
  const parse = (t) => { try { return JSON.parse(t); } catch (_) { return null; } };
  const clip = (v, n = 4000) => (typeof v === "string" && v.length > n ? v.slice(0, n) + "…" : v);
  const clipList = (a) => (Array.isArray(a) ? a.map((x) => clip(x, 1000)) : a);

  function onStart(url, bodyText, respText) {
    const m = url.match(START_RE);
    if (!m) return;
    const body = parse(bodyText) || {};
    const resp = parse(respText) || {};
    const id = resp.interpret_id || resp.submission_id;
    const rec = {
      id: String(id || `local-${Date.now()}`),
      kind: m[2] === "submit" ? "submit" : "run",
      slug: m[1],
      at: Date.now(),
      lang: body.lang || null,
      code: typeof body.typed_code === "string" ? body.typed_code : null,
      input: body.data_input || null,
      result: null,
    };
    if (id) pending.set(String(id), rec);
    post(rec);
  }

  function summarize(r) {
    return {
      // For Run, status_msg is "Accepted" whenever the code executed, even if outputs differ.
      status: r.status_msg === "Accepted" && r.correct_answer === false ? "Wrong Answer" : r.status_msg || null,
      runSuccess: r.run_success,
      correct: r.correct_answer,
      compare: r.compare_result || null,
      totalCorrect: r.total_correct,
      totalTestcases: r.total_testcases,
      compileError: clip(r.full_compile_error || r.compile_error || null),
      runtimeError: clip(r.full_runtime_error || r.runtime_error || null),
      answers: clipList(r.code_answer),
      expected: clipList(r.expected_code_answer),
      stdout: clipList(r.std_output_list),
      // Submit-specific fields
      lastTestcase: clip(r.last_testcase || r.input || null),
      codeOutput: clip(typeof r.code_output === "string" ? r.code_output : null),
      expectedOutput: clip(r.expected_output || null),
      stdOutput: clip(typeof r.std_output === "string" ? r.std_output : null),
      runtime: r.status_runtime || null,
      memory: r.status_memory || null,
    };
  }

  function onCheck(url, respText) {
    const m = url.match(CHECK_RE);
    if (!m) return;
    const r = parse(respText);
    if (!r || r.state === "PENDING" || r.state === "STARTED") return;
    const rec = pending.get(m[1]);
    if (!rec) return;
    pending.delete(m[1]);
    rec.result = summarize(r);
    post(rec);
  }

  function handle(url, bodyText, respText) {
    try {
      if (START_RE.test(url)) onStart(url, bodyText, respText);
      else if (CHECK_RE.test(url)) onCheck(url, respText);
    } catch (_) { /* never break the page */ }
  }

  // fetch (what LeetCode uses today)
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const p = origFetch.apply(this, arguments);
    if (START_RE.test(url) || CHECK_RE.test(url)) {
      const bodyText = init && typeof init.body === "string" ? init.body : null;
      p.then((res) => res.clone().text().then((t) => handle(url, bodyText, t))).catch(() => {});
    }
    return p;
  };

  // XMLHttpRequest (fallback, in case LeetCode switches)
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__lcUrl = String(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__lcUrl || "";
    if (START_RE.test(url) || CHECK_RE.test(url)) {
      this.addEventListener("load", () => handle(url, typeof body === "string" ? body : null, this.responseText));
    }
    return origSend.apply(this, arguments);
  };
})();
