---
name: plan
description: Turn an approved Factree spec into a plan — a plan.md overview plus a design and task list for each vertical it touches (backend, frontend, infra…) — how it will be built, following the repo's existing patterns, broken into tasks that each fit one code review. Use when a spec is approved and the user wants to plan the build. Writes only under the Factree workspace; never writes product code.
argument-hint: "<spec path or id>"
---

# Plan

Turn an approved spec into a plan, split by **vertical**: the kinds of code it touches (backend, frontend, infra and so on). Each vertical gets its own **design.md** (how it will be built and why) and **tasks.md** (the work, in pieces a reviewer can review), so the people who build and review that kind of code get a plan in their terms. One **plan.md** ties them together: scope, the order of work across verticals, coverage and status. Works the same way in any kind of repo; what's specific to each vertical comes from its lens.

```
<workspace>/work/<NNN>-<slug>/
  plan.md              # overview: scope, verticals, order, coverage, status
  backend/design.md
  backend/tasks.md
  frontend/design.md
  frontend/tasks.md
```

Input: $ARGUMENTS

Paths below: `<skill>` is this skill's base directory and `<plugin>` is two levels up from it. Templates and checks are in `<skill>`; shared scripts in `<plugin>/scripts/`; lenses in `<plugin>/lenses/`; the repo profile format in `<plugin>/shared/profile.md`. Load the factree:spec-format skill before reading the spec.

## Why this skill exists

A design that ignores the codebase invents a second way of doing everything. A task list that isn't sized for review produces pull requests nobody can review properly. This skill makes design decisions **from** the repo's existing patterns, justifies every choice with evidence, asks about load only when the repo can't answer, and cuts the work into reviewable pieces that each prove specific scenarios.

<HARD-GATE>
This skill writes only inside the Factree workspace: the plan files, the repo profile, the spec's Decisions and Code sections, and events. It never writes or edits product code, tests, migrations, config or dependencies, and it never starts implementation. When the plan is approved, stop.
</HARD-GATE>

## Process

**Decisions made in the companion:** the user can answer, approve or request changes in the Factree UI, and Claude carries on without them typing (companion-decisions R8):
- **Wait after asking.** Every time you send a decision brief or ask for approval, start `bash <plugin>/scripts/wait-decision.sh <spec-id> <work-id>` with `run_in_background`, then end your turn. Keep one wait running per session: if one is already running for this spec, don't start another.
- **When the wait ends** with "Decided in the Factree companion: …", take each line as the user's own reply and carry on. An answered question is answered, an approved spec or plan is approved (the companion has already set its status and logged the event), and a change request is the user's instruction. If it ends with "No decision in the companion yet", say in one line what is still waiting and stop.
- **If the user replies in the terminal first,** stop the wait before carrying on, and ignore a later report of a decision you already have.
- **On their next message,** the session hook also passes along any companion decision you haven't had, as "Decided in the Factree companion since your last turn: …". Treat it the same way.
- Without background commands (another harness), skip the wait; the hook still delivers decisions with the next message.
- **A plan approved in the companion** is approved like one approved here: carry on as step 9 says.

Log each numbered decision in a plan brief as `question.asked` on the spec, with the same fields as the spec skill, including `options`.

**The flow runs on its own** (factory-flow): Factree is a factory. Once nothing needs the user, go straight on to the next stage in the same session, saying one line as it starts ("Building 002-spec-order."). Stop only for a decision brief, an approval the user must give, a failed or blocked task, or the verify result; never to ask whether to start the next stage. Never push, open a pull request or merge. With `flow: step` in the preferences, stop after this stage instead and say which comes next.

**Preferences:** read `<workspace>/preferences.md` if it exists (format and keys: `<plugin>/shared/preferences.md`). A line `key: value` not starting with `#` sets a key. A missing file or key means the default. Say once, in a line, if it sets a key you don't know (e.g. `approve_specs`) or a value you don't know, and ignore it.

### 1. Get the spec

- The input is a spec path or id. Find the workspace with `bash <plugin>/scripts/init.sh` (its last line is the workspace; it creates one on first use, local only, and on exit 3, outside a git repo, say what it printed and stop); specs are in `<workspace>/specs/`.
- No input: list specs with `status: approved` and offer them. None approved: say so and point to `/factree:spec`.
- **Spec is `draft`:** stop. It must be approved first (`/factree:spec`).
- Run `bash <plugin>/skills/spec/scripts/validate.sh <spec>` (the spec skill's validator). If it reports errors, stop and say the spec needs fixing first.

### 2. Settle the scope

Log progress as you go, so the companion shows it live (live-activity R4): `bash <plugin>/scripts/event.sh stage.step <spec-id> '{"stage":"plan","step":"starting"}'` now, then the same with `"step":"reading the repo"` at step 3, `"designing"` at step 5, `"writing tasks"` at step 7 and `"checking"` at step 8, adding `"work"` once the work folder exists.


Decide which requirements this plan covers, then confirm with the user.

- **Spec never built** (no `live` status in its history): all requirements.
- **Spec was live before:** the requirements added or changed since then, from `spec.updated` events in `<workspace>/events.jsonl`.
- Remove requirements already covered by another approved plan in `<workspace>/work/*/` (the `scope` in its `plan.md`, or in `tasks.md` for plans written before verticals).
- Remove requirements with `Blocked by:` an open question, and say which and why.

Show the scope as a list of requirement IDs and names and ask the user to confirm or narrow it. They may plan a subset ("only R5 for now").

Create the work folder: `<workspace>/work/<NNN>-<slug>/`, where NNN is the next unused three-digit number and slug is the spec id or a short name.

### 3. Know the repo

1. **Which projects** the spec touches: from its Code and Observations paths. When the workspace sits above several repos, paths start with the repo folder (`api/…`, `web/…`).
2. **Detect** each project: `bash <plugin>/scripts/detect.sh <project-dir>`. Load the lens file for every lens it reports, from `<workspace>/lenses/` first (repo overrides), else `<plugin>/lenses/`. If a reported lens has no file, say you're working without one for that area.
3. **Verticals:** group the code the change touches by lens. Each lens with touched code is a vertical, named after the lens (`backend`, `frontend`, `infra`, `mobile`…), even one with no lens file. `detect.sh` also reports workspace lenses by their Detect patterns, so a lens generated by an earlier plan is found like a built-in one. A vertical exists only if the change touches it: a repo with infra files gets no `infra` vertical for a change that doesn't touch them. When one project reports several lenses (Next.js: frontend and backend), split its code by what each file is: API routes and data access to backend, pages and components to frontend.
4. **A lens for code no lens covers:** when touched code matches no built-in or workspace lens (scripts, tooling, plugin files, a project reporting `lenses: none`), don't fall back to `general`. Draft a workspace lens for that kind of code, named for it in one lowercase word or hyphenated words (`tooling`, `claude-plugin`, `data-pipeline`):
   - **Every contract section** from `<plugin>/lenses/README.md`, plus **Detect**: path patterns matching the touched files and their siblings, relative to the folder you ran `detect.sh` on.
   - **Patterns to inventory from this repo**, with real paths; **Gaps to check and Scale triggers from what usually goes wrong** with that kind of code, which the repo can't show.
   - **First line:** `> Generated by /factree:plan on <date> for plan <work>. Approved by: <pending>.`

   Keep the draft out of the workspace until it's approved (step 6). Plan that code as a vertical named after the lens, using its design sections. If the user declines, plan it as `general` and write no lens file.
5. **Profile:** read `<workspace>/profiles/<project>.md`. Build or refresh it as `<plugin>/shared/profile.md` describes if it's missing, stale or wrong.
6. **Decisions already made:** the spec's Decisions, Decisions in related specs, `CLAUDE.md` files in the projects, and any ADRs or architecture docs.
7. **Read the code** the change will touch, and the closest existing features to it.

### 4. Check the spec is enough to build from

If designing reveals behaviour the spec doesn't define (an unhandled case, a contradiction, a missing limit a user would notice), **don't decide it in the design.** Stop and tell the user: either update the spec with `/factree:spec`, or, with their agreement, add an open question to the spec and leave the affected requirement out of scope.

### 5. Design

Draft `plan.md` from `<skill>/plan-template.md`: front matter (scope, `verticals`, `review_budget`, status) and Context. Then draft `<vertical>/design.md` for each vertical from `<skill>/design-template.md`, adding the **Design sections** of that vertical's lens. A vertical with no lens file says so at the top of its design and follows the core process.

Pattern IDs (P1, N1) run across the whole plan, so each is unique in every vertical's design.

**Shared interfaces are defined once.** An interface one vertical produces and another consumes (an API contract, an event, a message) is defined in the producing vertical's design, under Interfaces. The consuming vertical's design names it and links to that definition (`../backend/design.md#interfaces`) instead of repeating its request and response.

**Every significant choice is a pattern, and every pattern is justified:**

- **Reused:** name the existing pattern, cite where it's used (`path:line`, preferably two places), and say **why it fits** this change. Reuse is the default.
- **New:** anything the repo doesn't already do: a new library, a new kind of component, a queue where there was none, a new table design convention. Say **why the existing patterns don't fit**, what alternatives you considered, and mark it as needing approval. A new pattern is never final until the user explicitly approves it.

Prefer the most local precedent: the same module over the same repo, the same repo over general best practice. If two existing patterns conflict, say so and recommend one.

**Load and scale:** go through each loaded lens's **Scale triggers**. For each trigger this change hits, look for the answer in the repo first (migrations, indexes, docs, existing features, perf tests). Ask the user only what the repo can't answer, one question per message, saying what the answer changes ("Under 100k rows a day I'd reuse the existing index; above that it needs its own table"). Record every assumption with its source: the spec, the repo (with a path), or the person who confirmed it. Targets a user would notice belong in the spec; if one is missing and matters, go back to step 4.

**Approach:** the chosen approach, and the alternatives considered with why each lost.

**Diagrams:** draw a flow as a picture whenever a reader would otherwise have to hold it in their head. Use Mermaid in a fenced `mermaid` code block, so the diagram is text in the plan and diffs in review:
- **Flows that cross parts:** for each in-scope flow through three or more components, or through more than one vertical, put a `sequenceDiagram` in the Flows section of the vertical that owns the flow (the producer, for a request between verticals). Name the participants as the components table does.
- **Lifecycles:** when a requirement introduces or changes something with three or more states, draw a `stateDiagram-v2` with exactly the states and transitions the spec names.
- **Otherwise none:** a change inside one component gets "Not applicable." in Flows, not a diagram for its own sake.

Start every block with its kind (`sequenceDiagram`, `stateDiagram-v2`, `flowchart`); the validator warns about anything else, because the Factree UI can't draw it.

**What this workspace has learned** (self-improving R6): if `<workspace>/checklists/plan.md` exists, ask its questions as well as the built-in ones; if `<workspace>/defaults.md` exists, its lines are defaults for your calls (still listed, still overrulable). **Lessons approved earlier** (self-improving R8.S3): at the start of a run, look in `<workspace>/events.jsonl` for `lesson.approved` keys whose change isn't yet in its file (no `<!-- lesson <key>` comment there). Apply each first, as verify's step 5 describes, and say so in one line.

**Map everything:** every in-scope requirement to a component; every in-scope scenario to its failure handling (if it's a failure case) and to a test approach from the lens's **Test mapping**. Sections that don't apply say "Not applicable." so readers know they weren't forgotten. Scale the depth to the change: a small change can be short.

### 6. Checkpoint: approve what's new in the design

**Only when the design adds something new:** a new pattern, a new dependency or a drafted lens. Otherwise skip this step, go straight to tasks, and approve design and tasks together in step 9.

**Ask by impact.** New patterns, dependencies and lenses are always named decisions. So is anything about load or limits the repo couldn't answer. Everything else in the design is your call: component split, file names, ordering, test file layout. Decide it, log it (`decision.recorded` with `"call": true`), and list it.

Show a summary, not the file, as a **decision brief**: one message, each decision numbered with your recommendation and what changes otherwise, then your calls, so one reply settles it (the shape is in the spec skill, step 8):

```
Design 002-link-report: backend + frontend, streaming rows like the audit export.
1. Approve the new tooling lens (scripts/*.sh)? → yes (recommended)
Reply "yes", or e.g. "1: no". Say "details" for patterns and assumptions.
```

At most 5 lines (`<plugin>/shared/writing.md`). Reused patterns, assumptions and spec decisions to add are in the design files; give them when asked.

In the brief, name each new pattern and each drafted lens as its own decision ("1. Approve the tooling lens? → yes, recommended"), and ask for the design as a whole last. On a lens's approval, fill in its approver and save it as `<workspace>/lenses/<name>.md`; on a decline, move its code to `general` and rewrite that vertical's design without the lens. On approval: set `status: design-approved`, `design_approved_by`, `design_approved_at` in `plan.md` (the only place a plan's status lives; vertical files carry none), record approvals on each new pattern, and log `plan.design_approved`.

Then update the spec, and only these two sections:
- **Decisions:** add durable decisions made here (approved new patterns, choices future readers need the reason for), with who approved them. Log `decision.recorded`.
- **Code:** the planned locations.
These don't change behaviour, so the spec keeps its status. Never edit the spec's requirements, scenarios, Scope or Purpose from this skill.

### 7. Tasks

Write `<vertical>/tasks.md` for each vertical from `<skill>/tasks-template.md`. Each task belongs to exactly one vertical: the one whose code it changes.

**Number tasks in build order across the whole plan**, not per vertical: T1 is built first wherever it lives, so backend might hold T1, T2, T4 and frontend T3, T5. A task depends only on lower-numbered tasks, in any vertical.

**Size every task to one review.** The review budget is the maximum changed lines per task, tests included, excluding lockfiles and generated files. Use the user's number if they give one, else `review_budget` from the preferences, else 300, and record it as `review_budget`. Estimate each task's diff; if it's over budget, split it. A task is right-sized when it:
- ends with tests passing and the code working,
- is one commit,
- is something a reviewer could reject while accepting its neighbours,
- fits within the budget.

Split only where a reviewer could reject one task and approve the other (planning R4). Fold setup, configuration and documentation into the task whose deliverable needs them: a config entry used by one endpoint belongs to the endpoint's task, not a task of its own.

**Vertical slices.** Build one behaviour end to end before the next, so the feature works from the first task and grows. A slice usually spans verticals: the backend task that adds an endpoint and the frontend task that uses it deliver one behaviour together, numbered next to each other. Add a foundation task first only when several slices genuinely share it (a migration, a shared component), and say which tasks rely on it.

**Each task has:** `### T<n>: <title>`, `**Proves:**` (scenario IDs as `<spec>#R<n>.S<n>`, or `none` for a foundation task with the reason), `**Depends on:**` (earlier tasks only), `**Est. diff:**`, **Files** (create or modify, with paths and where), **Interfaces** (consumes, produces, with exact signatures), and **Steps**.

**Steps are test-first, each with a command and the result to expect:**
1. Write the failing tests, named with the scenarios they prove, each with the assertions it makes and the spec's exact values (planning R1): `it("excludes deleted links [link-report#R2.S1]")`, a team with 2 active and 1 deleted; expect a header and 2 rows. Test names and assertions, not full test code. A step that only says "Write the failing tests" decides nothing; the validator warns on it.
2. Run them and see them fail, with the exact command and the expected failure.
3. Implement: the signature, the file, the pattern to follow (with its path), and any values the spec pins. A code body only when the signature and tests don't settle it.
4. Run them and see them pass.
5. Run the project's full test command (from the profile).
6. Commit, with the message.

Use the project's real commands and test conventions from the profile. If the lens's test mapping calls for a test type the repo doesn't have (visual tests, perf tests), say so in the task rather than inventing infrastructure; adding it would be a new pattern.

**A plan is the decisions the builder can't make alone.** Signatures, files, test names, values from the spec, the pattern to follow. If the plan is longer than the code it describes, it has written the code instead: cut bodies down to signatures and assertions.

**Global constraints** (planning R3): in `plan.md`, copy word for word from the spec every value all tasks must respect (limits, formats, wording, versions), one per line, or "None.". Every builder gets this section with its task.

**Review focus** (planning R2): with the spec in front of you, list in `plan.md` up to five inputs or failure modes the spec implies but no scenario tests, most likely to bite first ("a spec with no file yet", "a double click on Export"). For each, say where it went: a behaviour the spec doesn't decide becomes a proposed scenario under **Spec updates** (behaviour gaps go back to the spec); anything else becomes a named test added to the task that owns the code. If you looked and found none, write "None found."

Add each vertical's summary table from the template. Then complete `plan.md`: **Verticals** (what each builds, with its tasks), **Order** (the slices, each listing its tasks with their verticals, and above them a `flowchart LR` of tasks and their dependencies, each node labelled with its vertical, whenever the plan has more than one vertical or more than three tasks), **Coverage** (every in-scope scenario with the task or tasks that prove it, across all verticals) and **Spec updates**.

### 8. Check

1. **Self-review** against `<skill>/checklist.md`. Fix what fails. Three checks always (planning R5):
   - **Names match:** every function, type and file a later task consumes is spelled as the earlier task produces it (`clearLayers()` in T1 is not `clearFullLayers()` in T3).
   - **Step scan:** no step that decides nothing ("handle edge cases", "add tests"), and no step that writes out code the signature and tests already settle.
   - **Proportion:** the plan isn't longer than the code it describes; if code blocks are most of it, cut them to signatures and assertions.
2. **Validate:** `bash <skill>/scripts/validate-plan.sh <work-folder>`. Fix every ERROR; fix WARNINGs unless you have a reason, and mention any you leave.
3. **Fresh review** when the plan has 5 or more tasks, touches more than one project, or introduces a new pattern: dispatch a fresh subagent with `<skill>/review-check.md`. Sort what it finds: already answered (fix the plan), minor (decide and note it), or needs the user (bring in one message). Without a subagent tool, do this read yourself.

### 9. Approve the plan

Summarise as a decision brief. If step 6 was skipped, because nothing in the design is new, this one brief covers the design and the tasks together:

```
Plan 002-link-report: 2 tasks (T1 backend, T2 frontend), every scenario covered. Approved by the flow; building.
```

**No approval stop** (factory-flow R2, D2): if step 6 was skipped (the design adds no new pattern, dependency or lens, and no load question is open), don't ask, whatever `approve_plans` says. Say "Plan approved by the flow: nothing in it needs you." with the summary and your calls, and record the approver everywhere as `flow: no open decisions` (`design_approved_by`, `approved_by`, and `"by"` in both events). With `flow: step`, `approve_plans: nothing-new` approves it as `preference: approve_plans`, and `ask` (the default there) asks. Otherwise, when step 6 raised decisions they were settled there:

List your calls. Under `flow: step`, ask **"Approve this plan?"**; otherwise the decisions settled in step 6 approve it. On approval set `status: approved`, `approved_by`, `approved_at` in `plan.md`, and log `plan.approved`. If step 6 was skipped, also set `design_approved_by` and `design_approved_at` and log `plan.design_approved` first, since the one approval covered the design. Then make the spec updates from step 6. Then go straight on to build it, whoever approved it (you by preference, the user here or in the companion): say "Building <work-id>.", load `<plugin>/skills/build/SKILL.md` and follow it (factory-flow R2). With `flow: step`, say the plan is ready to build and stop instead.

**Amending an approved plan** (planning R6): when the spec changes after the plan was approved and you add or change tasks to cover it, the plan must be approved again, or it reads as out of date. Update the plan files and coverage, then ask any new pattern, dependency or lens as a decision, as in step 6. Once nothing is open, set a new `approved_at` (and `approved_by: "flow: no open decisions"` if the flow approves it) and log `plan.approved` again with the new task count. Then carry on building.

## Logging events

`bash <plugin>/scripts/event.sh <type> <id> '<json>'`:

| When | Event | Id |
|---|---|---|
| Work folder and first draft written | `plan.created` with `{"spec":"<spec-id>","scope":["R1",…],"verticals":["backend","frontend"]}` | work id |
| Design approved | `plan.design_approved` with `{"by":"<name>","new_patterns":["N1"]}` | work id |
| Decision added to the spec | `decision.recorded` with `{"id":"D4","by":"<name>","from":"<work-id>"}` | spec id |
| Your own call | `decision.recorded` with `{"id":"call-1","by":"Claude","call":true,"from":"<work-id>","text":"<the call>"}` | spec id |
| Plan approved | `plan.approved` with `{"by":"<name>","tasks":N}` | work id |

## Links to the Factree UI

At the design checkpoint (step 6) and when asking to approve the plan (step 9), run `bash <plugin>/scripts/link.sh <spec-id> <work-id>`. If it prints a line, end your message with that line, unchanged. It prints nothing when the UI isn't running; then add nothing.

**Evidence with every claim** (verifying R3): say work is done, passing or fixed only right after running the command that shows it, and quote the command and its result ("npm test: 206 passed"). One failing test is named as failing, never "done".

## Red flags

| Thought | Reality |
|---|---|
| "I'll get the design approved, then the tasks" | Only when the design adds something new. Otherwise one approval covers both. |
| "This library is a detail, I'll just use it" | A new dependency is always a named decision, never your call. |
| "There's a better way than what this repo does" | Maybe. That's a new pattern: justify it and get approval. Reuse is the default. |
| "This is standard practice, no need to cite anything" | Every reused pattern cites where this repo uses it. If you can't find it, it isn't a repo pattern. |
| "I'll ask about load to be safe" | Ask only when a trigger applies and the repo can't answer. Every question costs the user. |
| "The spec doesn't say, I'll pick something sensible" | Behaviour gaps go back to the spec. The design decides how, never what. |
| "This task is big but it's all one thing" | If it's over the review budget, split it. Reviewers don't care that it's one thing. |
| "I'll write the full code in the plan so it's unambiguous" | Signatures and assertions. A plan longer than the code is a transcript, not a plan. |
| "We'll need visual tests, I'll add a task to set them up" | New test infrastructure is a new pattern. Raise it; don't slip it in. |
| "This backend change is tiny, I'll fold it into the frontend task" | Each task belongs to the vertical whose code it changes. Small tasks are fine. |
| "No lens fits, so it's general" | Draft the lens. One approval now saves every later plan from planning that code blind. |
| "This flow is clear enough in prose" | If it crosses three components or two verticals, draw it. Reviewers see a picture faster than they parse a paragraph. |
| "I'll restate the API in the frontend design so it reads on its own" | Define it once, in the producer's design, and link to it. Two copies drift. |
| "Design approved, I'll start on T1" | This skill ends at plan approval. Building is a separate step. |
