import { writeAttemptFile } from "./shared.js";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen" || msg.type !== "write") return false;
  writeAttemptFile(msg.filename, msg.content, msg.subfolder, false)
    .then(sendResponse, (e) => sendResponse({ ok: false, reason: "error", error: String(e) }));
  return true;
});
