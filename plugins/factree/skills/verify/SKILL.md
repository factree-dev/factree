---
name: verify
description: Verify a Factree spec — run the project's test suites once, match each test to the scenarios it cites, and mark every scenario proved, failing or unverified, recording the result. Use after a build, or whenever the user asks whether a spec actually holds. Changes no code, spec or plan.
argument-hint: "<spec id>"
---

# Verify

Show whether a spec holds, from evidence. Every scenario ends up **proved**, **failing** or **unverified**. What can't be checked is unverified, never assumed.

Input: $ARGUMENTS

Paths below: `<plugin>` is two levels up from this skill's base directory. Shared scripts are in `<plugin>/scripts/`.

<HARD-GATE>
Read and run tests only. Never change code, tests, the spec or a plan, and never fix a failure here. Failures and gaps go back to `/factree:build` or `/factree:plan`.
</HARD-GATE>

## Process

### 1. Find the spec

Log `bash <plugin>/scripts/event.sh stage.step <spec-id> '{"stage":"verify"}'` as verify starts (live-activity R4).


Find the workspace with `bash <plugin>/scripts/init.sh` (its last line is the workspace; it creates one on first use, local only, and on exit 3, outside a git repo, say what it printed and stop); the spec is `<workspace>/specs/<id>.md`. No input: offer the specs with an implemented plan.

### 2. Run each suite once

For each project the spec's plans touch, take its test command from `<workspace>/profiles/<project>.md`, or from the project's manifest if there's no profile. Run it **once**, with output you can read per test:

| Runner | How |
|---|---|
| Vitest | `npx vitest run --reporter=json --outputFile=<tmp>.json` |
| Jest | `npx jest --json --outputFile=<tmp>.json` |
| pytest | `pytest -rA` (PASSED/FAILED lines) |
| Script suites | lines like `ok <name>` / `FAIL <name>` |

If a suite won't run, say which and why, and carry on. Its scenarios stay unverified.

**Does it build?** (verifying R2) Run each touched project's typecheck and build commands from its profile, once each. For each, add a line `build<TAB>pass<TAB><command>` or `build<TAB>fail<TAB><command>: <first error line>` to the results. A project with no such command: say "no build command found for <project>", and add no line; that isn't failing.

**Does each citation check the scenario?** (verifying R1) A test that cites a scenario is a claim. For each scenario with a passing citing test, read the test against the scenario's THEN. If no citing test asserts that outcome (it only renders, only runs, or checks something else), add `unchecked<TAB><spec>#Rn.Sm`. The scenario then stays unverified: "cited, doesn't check THEN".

### 3. Record

Turn every test result into one line (plus the build and unchecked lines above), `pass<TAB><full test name>` or `fail<TAB><full test name>`, with the full name including its describe blocks, so scenario tags like `[<spec>#R2.S1]` stay in it. Pipe all lines from all suites into:

```
bash <plugin>/scripts/verify-record.sh <spec> <repo root> < <lines>
```

It marks each scenario, counts manual skill cases (`tests/*/cases.md`) only with a pass recorded on or after the build, logs one `spec.verified` event, and prints the summary.

### 4. Report

Result first, at most 5 lines (`<plugin>/shared/writing.md`): the counts, each failing scenario, and the unverified ones by name if there are 3 or fewer, otherwise their number and "details" for the list.

```
verify: 14 proved · 1 failing · 2 unverified
  R2.S1 failing: "one failure makes it failing [verify#R2.S2]" (tests/run.sh)
  R5.S3 unverified: no test cites it
  R1.S2 unverified: manual case not run since the build
```

For each scenario that isn't proved, say what would prove it:
- **Failing:** rebuild or fix it with `/factree:build`.
- **No test cites it:** add a task with `/factree:plan`.
- **Manual case not run:** run the case and record a Results row.
- **Cited, doesn't check THEN:** strengthen the test with `/factree:build`, or add a task with `/factree:plan`.
- **Failing build:** fix it with `/factree:build`; the spec is failing until it builds.

**Evidence with every claim** (verifying R3): say work is done, passing or fixed only right after running the command that shows it, and quote the command and its result ("npm test: 206 passed"). One failing test is named as failing, never "done".

### 5. Lessons

After the result, and only then (self-improving R7), run `bash <plugin>/scripts/lessons.sh`. Each line is a candidate: key, count, file, change, evidence. Take at most the first 3. For each, log `lesson.proposed` on the spec with `{"key","text","file","change","evidence":[<times>]}`, where `text` says in one sentence what it changes and why ("You approved 3 plans that added nothing new; approve those automatically?"). Present them as one brief after the result:

```
Lessons (approve, "not this", or changes)
1. Approve plans with nothing new automatically? You approved 3 such plans without changes (002, 003, 005).
   Adds to .factree/preferences.md: approve_plans: nothing-new
```

Then wait for the answers as for any decision (they can also come from the companion's lesson cards).
- **Approved** (here, or `lesson.approved` from the companion; log `lesson.approved` with `{"key","by"}` when it's here): append the change to its file in the workspace, followed by `<!-- lesson <key>, from <evidence times> -->`. Lens rules go under the lens's **Patterns to inventory**; profile rules under the profile's patterns; checklist questions as `- [ ] <question>` in `checklists/spec.md` or `checklists/plan.md`; defaults as one line each in `defaults.md`. Create the file if needed. Say what was written where.
- **Not this:** log `lesson.rejected` with `{"key","by"}`. It won't be proposed again.
- No lines from the script: say nothing about lessons.

**Lessons approved earlier** (self-improving R8.S3): at the start of a run, look in `<workspace>/events.jsonl` for `lesson.approved` keys whose change isn't yet in its file (no `<!-- lesson <key>` comment there). Apply each first, as verify's step 5 describes, and say so in one line.

**Then review** (factory-flow R3): if this run built a plan and the result has nothing failing, go straight on to send it for review: say "Opening the pull request for <work>.", load `<plugin>/skills/review/SKILL.md` and follow it. With anything failing, or `flow: step`, stop here and say what's next.

Then run `bash <plugin>/scripts/link.sh <spec>` and end with its line, if any.

## Red flags

| Thought | Reality |
|---|---|
| "This scenario is obviously covered" | Not without a test that cites it, or a recorded manual run. Unverified. |
| "The manual case passed last week" | Only runs on or after the build count. |
| "One test is flaky, I'll rerun it until it passes" | One run per suite. Report the failure. |
| "Quick fix and rerun" | Verify never changes code. Route it to /factree:build. |
| "The test cites it, so it's proved" | A citation is a claim. Read the test against the THEN. |
| "Tests pass, so it builds" | Run the typecheck and build. Passing tests don't compile the app. |
