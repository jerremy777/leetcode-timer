---
name: "check-leetcode-attempt"
description: "When the user says \"check my latest leetcode attempt\" (or review/look at my last attempt): find the newest saved attempt, run the code, and give hint-based feedback. Log only if asked."
---

# Check my latest LeetCode attempt

This skill pairs with the **LeetCode Practice Timer** Chrome extension. The user times a LeetCode attempt with it. When the timer ends or they click "Done", the extension saves their code as a Markdown file in a `leetcode-attempts/` subfolder of the folder they chose in the extension's settings. (The subfolder name can be changed in settings.)

Each file has a header (problem, difficulty, time limit, time used, outcome, language), the code, an optional "Where I'm stuck" note, and the problem statement. It can also contain a **Run history** section: every time they pressed Run or Submit during the attempt, it records the code that ran, the test input, their output vs expected, errors, and any print output.

This skill makes the review the same every time.

## Hard rules
- **Hints, not solutions.** Never show corrected or complete code for the problem. Describe what is wrong, show failing inputs, and give hints. Only show full code if the user explicitly asks for it after the hints.
- **Run the code. Do not eyeball it.** Never say "correct" or "incorrect" without executing it.
- **Concrete data first.** Lead with input -> expected output -> what their code returned, and use a short step-by-step trace before any abstract explanation.
- **Direct and honest.** No cheerleading. State what is right, what is wrong, and the evidence. If a comment or claim in their code is inaccurate (for example a wrong complexity claim), correct it plainly.
- **Do not write to a log unless the user asks.** End with a one-line offer instead.

## Steps

### 1. Find the attempt
- Locate the `leetcode-attempts/` folder. If the session is linked to the user's computer, use the linked-computer tools to search the connected folders for it. If you can't find it, ask the user where their attempts folder is. If the session can't reach their computer at all, say so and ask them to attach the latest attempt file. Do not search the cloud workspace for files that live on their computer.
- List the folder newest first. Ignore `_test.md` (the extension's settings-page test file).
- Take the newest file. If the same problem has earlier files (an original, a `-final.md`, or a rewrite), also read those and compare them.
- Read the file fully, including `## Run history` if present. If "Where I'm stuck / what I want feedback on" is filled in, address that first.

### 2. Gather context (silently)
- If the user keeps a practice log (for example a CSV of past attempts in their project or folder), read it. Look for earlier attempts at the same problem and for repeated bug classes.
- If you have notes about this user's recurring bugs or prep goals (memory, a prep doc), use them to connect this attempt to known patterns. Common classes worth watching for: check-before-insert ordering in seen-sets/maps, off-by-one ranges, shadowed variables, unhandled empty or mismatch cases, and language idiom gaps (in Python: `[0] * n`, `.items()`, comprehensions).

### 3. Run the code
- Python: write the final solution plus a trusted reference implementation to a scratch file in the working directory. Run both on: every example in the problem statement, edge cases (empty or minimal input, single element, all identical, lone or extra closing/opening items, large values), and, where the input space is small, **exhaustive or random small inputs** compared against the reference. Report the count of disagreements and concrete minimal failing inputs.
- Other languages: run it if the toolchain exists. Otherwise trace by hand and say it was not executed.
- "Passes the statement's examples" is not "correct". Say which one you verified.
- Submission status: if the Run history has a Submit entry, report its result (Accepted, or Wrong Answer with the failing input). If there is no Submit entry, say you cannot tell whether they submitted. "Outcome: Stopped before the limit" does NOT mean they submitted.
- "Time used" can be misleading if the editor kept code from an earlier attempt (for example 0:02 for a full solution). Say so when it looks implausible.

### 4. Analyze the run history (when present)
Use the recorded runs as evidence of process, not just the final code:
- For each attempt: what error or mismatch occurred, and what they changed next (compare consecutive code blocks).
- Classify each error: syntax or name error, language mechanics (idiom, indexing, types), logic bug, missed edge case, or wrong approach.
- Look for patterns: repeated identical errors, edits that didn't address the reported error, guess-and-run cycles (several runs a minute apart with small unrelated tweaks), or print-debugging. Note the time between runs.
- Note what they fixed on their own from the error message. That counts as an independent fix.
- Do not re-explain errors they already fixed in a later run. Focus on what the progression says about the process.

### 5. Write the review (concise)
Use this structure:
1. **Headline:** `NN. Title (Difficulty): correct / likely fails / fails on X. Time used of limit. N runs, M submits.`
2. **Verdict and evidence.**
   - If wrong: a small table of failing input | their output | correct output, then a step-by-step trace of one failing input showing exactly where it diverges. Explain the missing case or bug in plain words, not as a fix.
   - If correct: state complexity, and what is inefficient or non-ideal with a concrete input that shows it.
3. **Progression (only if Run history exists):** a compact table: Attempt | time | result | what changed. Then one or two sentences on the pattern.
4. **Hints (numbered, no code).** Each hint should be a question or nudge that leads toward the fix. Include one hint about edge cases or inputs to test. For correct solutions, hints go toward the better approach, plus optional follow-ups labeled as optional.
5. **What went well:** one or two specifics (for example they chose an approach in a comment before coding, or they read an error message and fixed it in one run). Do not inflate it.
6. **Process note (one short item):** time use against the limit, leftover debug prints, or a habit to add (such as a "what inputs break this?" check before pressing Run). If their log uses different time caps than the extension's limit, mention it once.
7. **Next step:** ask them to rewrite and save, and offer to log this attempt.

### 6. Logging (only when asked, or when they say "log it")
- **If a log already exists:** read its header row and follow its columns and conventions exactly (column order, value wording such as how "solved with hints" is written, date format). Leave blank any column whose value you don't know and the user hasn't given. Never guess personal fields.
- **If no log exists:** ask where they want it, then create a CSV with these columns:
  `Date,LC #,Problem,Topic,Difficulty,Solved?,Minutes,Cap (min),Stuck type,Mechanics issue?,Notes`
  - `Solved?`: `Yes`, `Yes (with hints)`, `Yes (with review)`, or `No`. Use `No` for a wrong or unfinished attempt, and put what was found in Notes.
  - `Minutes`: time used from the file (rounded). `Cap (min)`: the time limit from the file unless they say otherwise.
  - `Stuck type`: `n/a` when solved cleanly, otherwise a short accurate phrase (for example "Knew the idea, couldn't implement it").
  - `Mechanics issue?`: Yes if any run failed on a language mechanics error.
- One row per attempt (per saved file). A rewrite or redo is its own row: `Problem (rewrite after hints)` or `Problem (redo)`. Runs inside one attempt are not separate rows. Summarize them in Notes (for example "4 runs: NameError, wrong answer on case 2, then pass").
- Notes: bugs, failing inputs, run progression, hints given, and optional follow-ups. Keep it factual.
- Procedure: read the current file, parse it with a real CSV parser (for example Python's `csv` module; quote any field containing a comma), check every existing row has the header's field count, append, write the whole file back, then re-read to confirm. Do not alter existing rows except to fix an error you made, and say so if you do.

## Style
- Short sections and tables where it helps. No long prose. Do not repeat the problem statement back to the user.
- No emojis. Do not mention reading memory or the log.