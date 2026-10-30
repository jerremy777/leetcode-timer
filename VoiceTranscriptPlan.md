# Plan: Live voice transcript in LeetCode attempt files

## Goal
While the user works on a problem with the timer running, optionally transcribe their think-aloud speech using the Web Speech API (`SpeechRecognition`) and include the timestamped transcript in the saved attempt Markdown, so the `check-leetcode-attempt` skill can analyze their reasoning alongside the code and run history.

## Feasibility
Yes, with caveats:
- Only the recognition half of the Web Speech API is needed. Chrome exposes it as `webkitSpeechRecognition`, and it works in content scripts and extension pages.
- **Privacy:** by default Chrome streams audio to Google's servers. Chrome 139+ supports `processLocally = true` (needs an on-device language pack); use it when available and fall back to cloud with a clear notice in options.
- **Mic permission:** the prompt must be shown from a page with UI. Offscreen documents can't show it, so recognition runs in the leetcode.com content script (permission is granted once per origin).
- **Auto-stop:** recognition ends on silence, network errors, or after a while. It must be restarted on `onend` while a session is active.
- **Lifetime:** it only works while the LeetCode tab is open. Navigation or reload drops it, so the content script must resume it on load if a session is active.
- **Accuracy:** code jargon ("hash map", "two pointers") is transcribed imperfectly. Treat the transcript as context, not ground truth.
- Store text only, never audio.

## Design
1. **Setting**
   - Add `recordTranscript: false` (opt-in) to the defaults in `chrome-extension/shared.js`.
   - Add a checkbox in `options.html` / `options.js` with a privacy note (audio may be sent to Google unless on-device is available).
   - Add a "Test microphone" button that triggers the permission prompt on leetcode.com.
2. **Capture (`content.js`, `content.css`)**
   - If a session is active for this problem and the setting is on, start `webkitSpeechRecognition` with `continuous = true`, `interimResults = false`, `lang = navigator.language`, and `processLocally = true` when supported.
   - On each final result, send `{ type: "transcript", text, at: Date.now() }` to the background.
   - Restart on `onend` while the session is active, with a short backoff on errors.
   - Stop on `not-allowed` (and don't retry), and when the session ends.
   - Show a small recording indicator next to the existing timer UI.
3. **Storage (`background.js`)**
   - Handle the `transcript` message inside the `locked()` queue.
   - Append `{ at, text }` to `session.transcript`. It is cleared with the session, like `runs`.
   - Ignore messages when no session is active or the setting is off.
4. **Markdown (`background.js`, `buildMarkdown`)**
   - After the run history, add a `## Thinking-aloud transcript` section.
   - Format lines as `- [m:ss] text`, using `mmss(at - session.startedAt)` so they line up with the run history.
   - Omit the section when the transcript is empty or the setting is off.
   - Mark any entries after the time limit as overtime, as run history does.
5. **Docs**
   - README: describe the feature, mic permission, and privacy.
   - `skills/check-leetcode-attempt/SKILL.md` (and the packaged `chrome-extension/check-leetcode-attempt.skill`): tell the skill to read the transcript to understand the user's approach, compare stated intent to the code, and address misconceptions. It must still give hints rather than solutions.

## Todos
1. `setting`: add the `recordTranscript` setting and options UI.
2. `capture`: add speech recognition to the content script with auto-restart and an indicator.
3. `store`: add the background handler and session storage. Depends on `capture`.
4. `markdown`: render the transcript section. Depends on `store`.
5. `docs`: update the README, SKILL.md and the `.skill` bundle. Depends on `markdown`.

## Testing (manual)
- Load the extension unpacked, enable the setting, grant the mic, speak, press Run, and finish. Check that the `.md` has stamped lines that match the run history.
- Deny the mic: no transcript section and no errors.
- Pause for a long silence: recognition restarts.
- Reload the LeetCode tab mid-session: capture resumes.
- Setting off: output is identical to today.

## Decisions / defaults
- Opt-in, default off.
- Capture in the content script, not the offscreen document.
- Text only, no audio saved.
- Prefer on-device recognition when available.
