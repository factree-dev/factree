---
name: build
description: Build an approved Factree plan — run its tasks test-first, in parallel wherever the plan's order allows, each in its own git worktree, merging each into a plan branch and marking it done as it lands. Use when a plan is approved and the user wants it built. Never changes the spec or plan; never pushes.
argument-hint: "<work id, e.g. 015-build>"
---

# Build

Turn an approved plan into working, committed code: every task test-first, in parallel where the plan's dependencies allow, each marked done with evidence (commit, changed lines, tests run) the moment it lands.

Input: $ARGUMENTS

Paths below: `<skill>` is this skill's base directory and `<plugin>` is two levels up from it. Shared scripts are in `<plugin>/scripts/`; the task subagent prompt is `<skill>/task-prompt.md` and the reviewer's is `<skill>/review-prompt.md`.

<HARD-GATE>
Build what the plan says, nothing else. Never edit the spec or the plan's design and tasks (ticking steps through `task-done.sh` is the only exception). Never push or merge (the review skill pushes, after verify), and never touch branches other than `factree/<work>` and its task branches. When reality disagrees with the plan, stop that task and route the problem (step 5).
</HARD-GATE>

## Process

### 1. Load the plan

- Find the workspace with `bash <plugin>/scripts/init.sh` (its last line is the workspace; it creates one on first use, local only, and on exit 3, outside a git repo, say what it printed and stop); the plan is `<workspace>/work/<work>/`. No input: list approved plans that aren't implemented and offer them.
- **Not approved** (`status` isn't `approved` in `plan.md`, or `tasks.md` for an older plan): stop and say it must be approved with `/factree:plan` first.
- Read every task: its id, vertical, **Depends on**, **Proves**, **Files**, **Steps**, and the plan's `review_budget`.
- **Already done:** a task with a `task.done` event for this work in `<workspace>/events.jsonl` is done; skip it. This is how a stopped build resumes.

### 2. Branch

Log `bash <plugin>/scripts/event.sh stage.step <spec-id> '{"stage":"build","work":"<work-id>"}'` as the build starts (live-activity R4); `task.started` then shows each task.


Work on `factree/<work>`: create it from the current commit, or check it out if it exists. Say which in one line. The user's own branch is never changed.

**Baseline** (building R1): run the project's full test command on the plan branch before any task. If anything fails, stop before the first wave and report each failing test as already failing on `factree/<work>`; a task must never be blamed for it.

**Pre-flight scan** (building R2): list every pair of tasks that touch the same file (their **Files**) or the same interface (one produces what the other consumes). Such a pair never runs at the same time, even when both are ready; say so in one line, e.g. "T2 and T3 both change `src/App.tsx`: running them one after the other." Tasks whose **Files** name separate regions of one file (`src/app.js (PATCH route)` and `src/app.js (export route)`) don't conflict and run together; a merge conflict between them is handled in step 4.

### 3. Run in waves

A task is **ready** when every task it depends on is done. Start every ready task the pre-flight scan allows at once, **at most three at a time**, each as its **own subagent in its own git worktree** on a branch `factree/<work>-T<n>` made from the plan branch, with the prompt from `<skill>/task-prompt.md` filled in for that task. Name it `Build <work> T<n>`. In each new worktree, run the project's install command from the profile (e.g. `npm ci`) before the subagent starts (building R1). Log `task.started` with `{"task":"T<n>"}` for each. A ready task held back, by the scan or by the limit of three, logs `task.waiting` with `{"task","reason"}` naming what it waits for (e.g. "shares src/app.js with T2").

**Name a model for every subagent** (building R6), never leaving it to inherit yours: the cheapest model for a builder whose steps give exact tests and signatures and whose estimated diff is 150 lines or fewer; a standard model for any other builder, and for reviews; a more capable model for the last round of a fix loop.

**Never build a task yourself while a subagent tool exists**, however small or sequential the plan. Without one (or without worktrees), say "No subagents here: building tasks one at a time." before the first task, then build and review each task yourself in order, in the working folder on the plan branch, following the same task prompt. The closing message says the reviews weren't fresh.

### 4. Land each task as it returns

When a subagent returns **done**, with its branch, commit, changed lines and the tests it ran, treat the report as claims (building R7): measure the changed lines yourself with `git diff --numstat <plan branch>...<task branch>` (excluding lockfiles and built files), and rerun the task's scenario tests in its worktree. Use your numbers, not the report's.

0. **Review** (building R3): write the task's diff to a file (`git log`, `git diff --stat` and `git diff -U10` against the plan branch) and start a fresh reviewer, named `Review <work> T<n>`, with `<skill>/review-prompt.md` filled in. It reads the diff file and opens other files only to check a risk it names. Both verdicts must pass before it merges. A failing verdict starts the fix loop below. A finding with `beyond_sources: true` doesn't fail a verdict and never goes to the fix loop (see Suggestions not built).
1. **Budget:** if its changed lines (tests included; lockfiles and built files excluded) exceed `review_budget`, don't merge. Log `task.failed` with `{"task","reason":"over budget: <n> lines"}` and propose a split of it into tasks within budget, for the user to make with `/factree:plan`.
2. **Merge** its branch into `factree/<work>`. A conflict: abort the merge and send the task back to its implementer for one rebase onto the plan branch, then review and merge again. Still conflicting: abort and log `task.failed` with the conflicting files.
3. **Full suite** on the plan branch, with the project's test command from the profile. Red: undo the merge (`git reset --hard` to the commit before it, on the plan branch only), log `task.failed` with the failing tests.
4. **Green:** run `bash <plugin>/scripts/task-done.sh <work> <task> <commit> <lines> "<tests run>"`. It ticks the task's steps, logs `task.done`, and marks the plan implemented when it was the last. Then start any tasks that are now ready.

**The fix loop** (building R4). A failing review, failing scenario tests or a red suite after the merge (undone first) doesn't fail the task yet. Send the findings, word for word, back to the same implementer for up to **3 rounds**; then start a **fresh implementer on a more capable model**, named `Build <work> T<n>`, for **1 last round**, telling it what was tried. Every round finds the root cause before changing code: reproduce the failure, read the error and the code around it, compare with a working example in the repo, then fix the cause, not the symptom. After each round, measure again and review only the fix, with a reviewer named `Review <work> T<n>`. Still failing after round 4: log `task.failed` with each round's findings and what was tried, and bring it to the user.

**Suggestions not built** (factory-quality R5). A finding with `beyond_sources: true` (the spec and its sources don't ask for it) is never sent to a fixer or to the spec, whatever its severity. Log it, count it, build nothing. A finding the sources do ask for goes back as today. If the user later asks for one, it goes through `/factree:spec` with the user as its source.

**Rulings on details** (building R5). The implementer decides implementation details the task leaves open and that nothing a user or caller could notice depends on: a helper's name, a private type, how a loop is written. Log each as a call on the spec: `decision.recorded` with `{"id":"call-<n>","by":"Claude","call":true,"text":"<the ruling>"}`. A gap in behaviour (an empty team, a case the spec doesn't cover) still blocks and goes to `/factree:spec`.

When a subagent returns **blocked** or **failed**, log `task.blocked` or `task.failed` with its reason, and don't start tasks that depend on it. Tasks that don't depend on it keep going.

### 5. Route problems, never improvise

| The task found… | Do |
|---|---|
| The spec doesn't say what should happen | `task.blocked`; name the question to raise with `/factree:spec` |
| The plan's pattern or interface doesn't work | `task.blocked`; name the design change to make with `/factree:plan` |
| A new test passes before the change | `task.failed`: the test doesn't prove the scenario |
| The work is bigger than the budget | `task.failed` with a proposed split |

### 6. Finish

When nothing more can start, report in at most 5 lines (`<plugin>/shared/writing.md`): the result, then only what needs the user.

```
Built 015-build: 3 of 4 tasks merged on factree/015-build.
T2 failed: over budget (410 lines). 1. Split it as proposed? → yes (recommended)
```

Commits, line counts and what's waiting on what are in the plan; give them when asked.

**Whole-branch review** (building R9). When every task has merged, log `bash <plugin>/scripts/event.sh stage.step <spec-id> '{"stage":"self-review","work":"<work-id>"}'`, then review the branch as a whole before verify:
1. Write the branch's diff to a file: `git log`, `git diff --stat` and `git diff -U10` from `git merge-base <base> factree/<work>` to `factree/<work>`, where `<base>` is the branch the plan branch was made from. Also make a detached worktree of `factree/<work>` in a scratch folder outside the repo and run the profile's install command there.
2. Start a fresh reviewer on the most capable model with the **Branch** section of `<skill>/review-prompt.md`, giving it the diff file, the checkout's path, the profile's test and start commands, the loaded lenses' gap checks and scale triggers, `plan.md` and the spec, and nothing from this session.
3. Its findings come back as **must fix**, **should fix** or **minor**, each with file and line and its evidence. Log `task.reviewed` with `{"task":"branch","findings":[{"severity","text","file","pattern","evidence","beyond_sources"}]}`.
4. Must- and should-fix findings that aren't `beyond_sources` go to **one** fix implementer together. For each finding about behaviour it first adds a test that fails on the branch, then fixes, and reports both runs. A test that passes before any fix means "not reproduced": it changes no code and the test isn't kept. A finding not about behaviour is fixed without a test, and the report says so. Then **one** scoped re-review of the fix, on the checkout refreshed to the fix commit. Remove the checkout and its probes after the re-review (or after step 3, if nothing needs fixing). A must-fix still open after that fails the build: log `task.failed` with `{"task":"branch","reason":"<the finding>"}` and bring it to the user; don't verify. Should-fix findings still open are listed for the user.
5. In the closing message, say how many minor findings and calls there were (`decision.recorded` with `call: true` since the build started), and list them when the user asks; they're in the event log and go in the pull request's folded sections, so nothing decided for the user stays hidden. Add "1 suggestion not built" (or "<n> suggestions not built") for `beyond_sources` findings, listed when the user asks and in the pull request's "Suggested, not built" section; one whose text starts `security:` gets its own line.

**A fix for a review comment** (review R5) is a task the review skill added to the plan; build it like any other, then verify.

If every task is done and the whole-branch review left no must-fix open, the plan is **implemented**: go straight on to verify its spec (factory-flow R3). Say "Verifying <spec-id>.", load `<plugin>/skills/verify/SKILL.md` and follow it, then end with its result and that `factree/<work>` is ready for review and merging. That is where the run hands back to the user. Review, push and merge are theirs; never start them. If any task failed or is blocked, don't verify: stop and bring those to the user. With `flow: step` in the preferences, say the plan is implemented and that verify comes next, and stop.

## Logging events

`bash <plugin>/scripts/event.sh <type> <work> '<json>'`: `task.started` `{"task"}`, `task.waiting` `{"task","reason"}`, `task.failed` `{"task","reason"}`, `task.blocked` `{"task","reason"}`. After every review, `task.reviewed` `{"task","spec":"pass|fail","quality":"pass|fail","findings":[{"text","pattern":"<the repo path of the pattern it should follow, if any>","beyond_sources":true|false}]}`; after every fix round, `task.reviewed` `{"task","round":N,"cause":"<the root cause, in a few words>"}` (self-improving R2). These are what the factory learns from. `task.done` and `plan.implemented` come from `task-done.sh`, never by hand.

When the build starts and when it finishes, run `bash <plugin>/scripts/link.sh <spec-id> <work>` and end your message with its line, if any.

**Evidence with every claim** (verifying R3): say work is done, passing or fixed only right after running the command that shows it, and quote the command and its result ("npm test: 206 passed"). One failing test is named as failing, never "done".

## Red flags

| Thought | Reality |
|---|---|
| "The test already passes, close enough" | It doesn't prove the scenario. Fail the task. |
| "It's only a bit over budget" | Over is over. Don't merge; propose a split. |
| "Tests pass, skip the review" | Every task is reviewed before it merges. Passing tests don't show extra behaviour or an ignored pattern. |
| "One more round will fix it" | Four rounds, then it goes to the user with what was tried. |
| "The subagent said 180 lines" | Measure it yourself. |
| "The spec doesn't say, I'll pick the obvious behaviour" | That's a behaviour decision. Block the task and route it to /factree:spec. |
| "I'll fix the plan's interface while I'm here" | The plan is approved. Block and route it to /factree:plan. |
| "I'll push the branch so it's safe" | Never push from build. The review skill pushes, after verify. Nothing ever merges. |
| "Let me run T3 too, it barely depends on T2" | Dependencies are the plan's decision. Wait for T2. |
