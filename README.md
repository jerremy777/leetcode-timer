# LeetCode Practice Timer (Chrome extension)

Time-boxes a LeetCode attempt and saves your code to a Markdown file in this project when time runs out, so Claude can read it and give hints.

## Install (one time)
1. Open `chrome://extensions`, turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this `leetcode-timer` folder.
3. The Settings tab opens. Click **Choose folder…** and pick the **Job Search** folder (the parent of this one).
4. Click **Write test file**. If Chrome offers **Allow on every visit**, choose it, so later saves happen without a prompt.
5. Optional: pin the extension (puzzle-piece icon → pin).

## Use
- On a problem page (`leetcode.com/problems/...`), click the extension icon. It shows the problem, difficulty, and suggested time (Easy 15 / Medium 25 / Hard 40 min; change these in Settings, or use −/+ before starting).
- **Start** begins the countdown. A small timer sits at the bottom-left of the page; the toolbar badge shows minutes left.
- At **0:00** your editor code is saved to `Job Search/leetcode-attempts/YYYY-MM-DD_HHMM_0001-slug.md`.
- After time's up the clock keeps counting overtime. **Save final** writes a second `...-final.md` with where you ended up.
- **Done — save** saves early if you finish before the limit.
- If Chrome dropped folder access (usually after a browser restart), a "Finish saving" tab opens: one click saves it.

Then ask Claude something like "give me a hint on my latest LeetCode attempt."

## Files
- `background.js`: timer (chrome.alarms), problem lookup (LeetCode GraphQL), code capture (Monaco editor), Markdown builder
- `offscreen.js` / `shared.js`: write files to the chosen folder (File System Access API)
- `popup.*`, `content.*`, `options.*`, `save.*`: UI
