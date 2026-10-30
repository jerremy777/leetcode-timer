# LeetCode Practice Timer + Claude review

A Chrome extension that time-boxes your LeetCode attempts and saves your code (plus every Run/Submit you made) as a Markdown file. A matching Claude skill reads the newest file and gives you hint-based feedback, so you never have to copy and paste code into a chat.

```
You press Start ──► code on LeetCode ──► timer hits 0:00 (or you click Done)
                                              │
                          leetcode-attempts/2026-10-29_1802_0020-valid-parentheses.md
                                              │
You ask Claude: "check my latest leetcode attempt" ──► Claude reads it, runs it, gives hints
```

---

## 1. Make a practice folder

Create one folder that both Chrome and Claude will use. Example layout:

```
LeetCode Practice/            ← pick this folder in the extension AND in Claude
├── leetcode-attempts/        ← the extension writes attempt files here
└── leetcode-timer/           ← this extension (can live anywhere)
```

You can create `leetcode-attempts/` yourself, or let the extension create it on its first save.

## 2. Install the Chrome extension

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select the `leetcode-timer` folder.
3. A settings tab opens. Click **Choose folder…** and pick your practice folder (the **parent** of `leetcode-attempts/`, not `leetcode-attempts/` itself).
4. Leave **Subfolder** as `leetcode-attempts` unless you want a different name.
5. Click **Write test file**. You should see `✓ Wrote LeetCode Practice/leetcode-attempts/_test.md`. If Chrome offers **Allow on every visit**, choose it so saves happen without asking.
6. Optional: pin the extension (puzzle-piece icon → pin).

Settings (toolbar icon → ⚙) also let you change the time limits (default Easy 15 / Medium 25 / Hard 40 min) and whether the problem statement is included in each file.

## 3. Set up Claude

You need the **Claude desktop app**, because Claude reads the attempt files from your computer.

### 3a. Create a project pointed at the practice folder
1. In the Claude desktop app, select **Projects** in the left panel and click **+**.
2. Choose **Use an existing folder** and select your practice folder (the same one you picked in the extension).
3. Name the project, optionally add instructions (example below), and click **Create**.

Example project instructions:
> LeetCode practice. Attempt files are in `leetcode-attempts/`. When I say "check my latest leetcode attempt", use the check-leetcode-attempt skill. Give hints, not full solutions.

Do your reviews in chats inside this project, so Claude can see the folder. The desktop app has to be open on that computer while Claude works.

### 3b. Add the review skill
The skill is in this folder as `skill/check-leetcode-attempt.zip` (source: `skill/check-leetcode-attempt/SKILL.md`).

1. Make sure code execution is on: **Settings → Capabilities → Code execution and file creation** (on Team/Enterprise plans an owner may need to enable skills).
2. Go to **Customize → Skills**, click **+**, then **+ Create skill → Upload a skill**.
3. Upload `check-leetcode-attempt.zip` and make sure its toggle is on.

Claude's menus change over time. If these names don't match, see Anthropic's help articles: [Organize your tasks with projects](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork) and [Use skills in Claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude).

## 4. Daily use

1. Open a problem on leetcode.com and click the extension icon. It shows the problem, difficulty and suggested time. Adjust with −/+ if you like.
2. Click **Start**. A small timer appears at the bottom-left of the page, and the toolbar badge shows minutes left.
3. Code and press **Run** or **Submit** as often as you like. Each one is recorded (code, test input, your output vs expected, errors, print output). The timer shows "· N runs recorded".
4. The attempt is saved when:
   - the timer hits **0:00** (auto-save), or
   - you click **Done — save** to finish early.
   After time's up the clock counts overtime, and **Save final** writes a second `…-final.md`.
5. In your Claude project, say: **"check my latest leetcode attempt"**.
6. Optional: say **"log it"** to add a row to a practice log CSV. If you don't have one yet, Claude will ask where to create it.

### What a saved file contains
- Problem number, title, difficulty, topics, time limit, time used, outcome, language
- Your final code
- **Run history**: Attempt 1, 2, 3… with the time into the attempt, the result, the error or output table, and the code that ran
- A "Where I'm stuck" section you can fill in before asking Claude
- The problem statement (can be turned off in settings)

## Troubleshooting

| Problem | Fix |
|---|---|
| No timer on the page | Refresh the LeetCode tab once, especially right after installing or reloading the extension. |
| A "Finish saving" tab opens | Chrome dropped folder access (common after a browser restart). Click **Save to folder** once. Nothing is lost. |
| Claude says it can't find the file | Make sure the chat is inside the project from step 3a and the desktop app is open on the computer that has the folder. |
| Runs aren't recorded | Runs only count between **Start** and the save. Refresh the tab and start again. |
| Time used looks too short (e.g. 0:02) | LeetCode kept code from your last attempt in the editor. Clear it before starting for an honest time. |

## Files
- `background.js`: timer, problem lookup, code capture, run history, Markdown builder
- `page_hook.js`: watches LeetCode's Run/Submit requests (read-only)
- `content.js` / `content.css`: the on-page timer
- `popup.*`, `options.*`, `save.*`, `offscreen.*`, `shared.js`: UI and file saving
- `skill/`: the Claude review skill
