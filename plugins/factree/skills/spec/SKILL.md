---
name: spec
description: Factree builds every feature through a spec first. Use this before writing any code whenever the user asks to implement, build, add or change a feature, ticket or behaviour in a repository (pasted tickets included), and when they want to specify a feature or update an existing spec. Turns the requirement into .factree/specs/<capability>.md grounded in the code, then the flow plans, builds and verifies it. Not for questions about how code works.
argument-hint: "[requirement text, file path, URL or ticket id]"
---

# Spec

Turn a requirement into a spec: a precise, checkable statement of how one capability behaves, grounded in the code it will live in. The format is defined by the factree:spec-format skill. Load it before writing.

Paths below: `<skill>` is this skill's base directory and `<plugin>` is two levels up from it. `template.md`, `checklist.md`, `builder-check.md` and `scripts/validate.sh` are in `<skill>`; shared scripts are in `<plugin>/scripts/`; lenses in `<plugin>/lenses/`.

Input: $ARGUMENTS

## Why this skill exists

You are very good at building, and you build what you believe the user wants. That belief is usually thinner than it feels. Requirements arrive incomplete: they mix behaviour with implementation, leave failure cases out, and use words like "large" and "fast" that mean nothing to a test. A spec is where those gaps get found while they are still cheap: in words, before code.

<HARD-GATE>
This skill writes only files under `.factree/`. It never writes or edits product code, tests, config or dependencies, and it never starts implementation, even when the requirement looks trivial. Reading code is expected. When the spec is approved, stop.
</HARD-GATE>

## Process

**Decisions made in the companion:** the user can answer, approve or request changes in the Factree UI, and Claude carries on without them typing (companion-decisions R8):
- **Wait after asking.** Every time you send a decision brief or ask for approval, start `bash <plugin>/scripts/wait-decision.sh <spec-id>` with `run_in_background`, then end your turn. Keep one wait running per session: if one is already running for this spec, don't start another.
- **When the wait ends** with "Decided in the Factree companion: …", take each line as the user's own reply and carry on. An answered question is answered, an approved spec or plan is approved (the companion has already set its status and logged the event), and a change request is the user's instruction. If it ends with "No decision in the companion yet", say in one line what is still waiting and stop.
- **If the user replies in the terminal first,** stop the wait before carrying on, and ignore a later report of a decision you already have.
- **On their next message,** the session hook also passes along any companion decision you haven't had, as "Decided in the Factree companion since your last turn: …". Treat it the same way.
- Without background commands (another harness), skip the wait; the hook still delivers decisions with the next message.
- **A spec approved in the companion** is approved like one approved here: carry on as **On approval** says.

**The flow runs on its own** (factory-flow): Factree is a factory. Once nothing needs the user, go straight on to the next stage in the same session, saying one line as it starts ("Planning link-report."). Stop only for a decision brief, an approval the user must give, a failed or blocked task, or the verify result; never to ask whether to start the next stage. Never push, open a pull request or merge. With `flow: step` in the preferences, stop after this stage instead and say which comes next.

**Preferences:** read `<workspace>/preferences.md` if it exists (format and keys: `<plugin>/shared/preferences.md`). A line `key: value` not starting with `#` sets a key. A missing file or key means the default. Say once, in a line, if it sets a key you don't know (e.g. `approve_specs`) or a value you don't know, and ignore it. Preferences never approve a spec, or a compact spec and plan: a person always does.

Work through these steps in order. Steps 1–7 are mostly reading and thinking; keep your messages to the user short until step 8.

### 1. Get the requirement

The input can be anything: pasted text, a list, a file path, a URL, a ticket ID, or nothing at all.

- **Text or a file:** read it.
- **A URL or ticket ID** (Confluence, Jira, Linear, GitHub, Notion): use a connected tool for that system if one exists, else WebFetch for public pages. If you can't reach it, say which system and ask the user to paste the content. Never guess what a page says.
- **Nothing:** ask what they want to specify, in one sentence.

Record every source in the spec's `sources` front matter: the URL, ticket ID or file path. If the requirement came only from conversation, record `conversation YYYY-MM-DD`.

### 2. Find the workspace

Run `bash <plugin>/scripts/init.sh`. Its last line is the workspace folder: `$FACTREE_HOME` if set, else the nearest `.factree/` in this folder or any parent (one workspace can serve several repos below it), else `<repo root>/.factree`, which it creates on first use and keeps out of git through `.git/info/exclude` (workspace-setup R1, R2).

- If it printed "Created a Factree workspace in …", pass that line on to the user.
- If it exits 3 (not in a git repo), nothing was created: say what it printed and stop.
- Create `<workspace>/specs/` if it's missing. Below, `.factree/` means this workspace.

### 3. Recon before asking anything

Read until you can explain how the relevant parts work today and what this requirement would touch:

- **Existing specs.** List `<workspace>/specs/*.md` and read the front matter and requirement headings of any that might overlap.
- **What kind of code this is.** Run `bash <plugin>/scripts/detect.sh <project-dir>` for each project involved and read the lens file for each lens it reports (`<workspace>/lenses/` first, then `<plugin>/lenses/`). If `<workspace>/profiles/<project>.md` exists, read it; don't build one here.
- **Project conventions.** The root `CLAUDE.md` and any `CLAUDE.md` in the directories involved.
- **The code.** Entry points, models, permissions, existing similar features, tests. Follow the requirement's nouns into the codebase.

Never ask the user something the code, the existing specs or the source already answers.

### 4. Size the request

Every change goes through the factory, down to one line of copy or styling: there is always a spec, however small, and the work is planned, built, verified and sent for review like any other (factory-flow R7). A request is never answered with "no spec needed". From what recon showed, size the request and say so in **one line**, with the reason and how to override it, before asking anything:

- **Tiny:** copy, styling, refactors, dependency bumps, renames, typos, internal tooling, performance work. A spec with one requirement and its scenarios, and a one-task plan, written in the same run and approved by the flow when nothing is open; then build, verify and review as usual. A styling choice the user made is recorded as a decision. For a change meant to keep behaviour the same (a refactor, a rename, a bump), the requirement says so and names the existing scenarios that prove it. *"Tiny: a styling change, so a one-requirement spec and a one-task plan, straight through the factory."*
- **Compact:** up to 3 requirements, in one vertical, needing no new pattern, dependency or lens. A short spec, then a plan in the same run, approved together (step 11). *"Compact: one frontend change, about 2 requirements, nothing new, so the spec and plan come for approval together. Say 'treat as standard' to override."*
- **Standard:** everything else. The full flow, with the plan left to `/factree:plan`. Say why, e.g. "spans two verticals".
- **Bug fix:** no new spec. If a spec exists for the area, add a scenario for the case the bug revealed. If none exists, say so and ask whether they want one.

Follow an override without arguing. If a compact request grows past the limits while you write it, say it's now standard (step 11).

### 5. Decide which spec or specs

- Match the requirement to capabilities. **Edit** an existing spec when the requirement changes behaviour it covers. **Create** one when the requirement introduces a capability nobody has specified.
- One requirement may touch several specs. One spec may serve many requirements over its life.
- Name capabilities as a user would ("report export"), not as the code is organised ("ExportsController").
- **If you will create or edit more than one spec, or the match is unclear, list what you plan to touch and confirm before writing.**

### 6. Break the requirement down

Split the input into atomic statements and sort each one:

| It's a… | Example | Goes to |
|---|---|---|
| Behaviour | "only admins can export" | A requirement |
| Behaviour with a vague word | "must work for large teams" | A requirement, once quantified; until then an open question |
| Implementation preference | "use streaming" | A decision, if the user confirms it; otherwise Code notes or an open question |
| Constraint | "must ship before the Q1 audit" | Not the spec. Mention it, don't encode it |
| Out of scope | "scheduled exports later" | Scope → Out |
| Already true in the code | "admins can see teams" | Observations, not a requirement |

**What this workspace has learned** (self-improving R6): if `<workspace>/checklists/spec.md` exists, ask its questions as well as the built-in ones; if `<workspace>/defaults.md` exists, its lines are defaults for your calls (still listed, still overrulable). **Lessons approved earlier** (self-improving R8.S3): at the start of a run, look in `<workspace>/events.jsonl` for `lesson.approved` keys whose change isn't yet in its file (no `<!-- lesson <key>` comment there). Apply each first, as verify's step 5 describes, and say so in one line.

Then find what the requirement is **silent** on. Run through `checklist.md`, plus the **Gaps to check** in each loaded lens (a frontend change gets asked about loading, empty and error states; a backend change about idempotency and concurrency). Each gap that applies and the source doesn't settle becomes a scenario in step 9, or an open question if the answer isn't clear. A case the source already settles comes from the source, not from a second scenario.

### 7. Observe current behaviour

If the capability touches existing code, write Observations: what the code does today in the area this spec covers, each with a file reference. Only the parts this requirement touches; don't backfill whole modules. Observations are facts you read, not guesses. If you're unsure, check the code again or leave it out.

### 8. Talk it through

Now you know what's clear and what isn't. Open with at most 3 lines: the requirement in your own words (what, for whom, why as far as stated), the one finding that bears on it most, and which spec you'll create or edit. Then give one **decision brief** (below).

**Ask by impact.** Put in the brief only decisions about:
- behaviour a user or caller would notice;
- scope, limits and failure cases;
- anything that needs a new pattern, dependency or lens;
- anything hard to undo.

Everything else is **your call**: naming, ordering, layout, defaults, wording, implementation. Decide it, log it (`decision.recorded` with `"call": true`), and list it in the brief so the user can overrule it.

- **Ask why first** if the requirement doesn't say why and the answer would change several decisions. Make it decision 1.
- **About five decisions at most** across all briefs. Record what's left as open questions with owners rather than interrogating the user.

**Decision brief:** one message, so one reply settles it, one line per decision (`<plugin>/shared/writing.md`).

```
1. Where does the Copy button go? → beside each scenario id (recommended)
2. Double click? → copy once, show "Copied" (recommended)
Reply "yes", or e.g. "2: copy twice". Say "options" or "calls" for more.
```

Number the decisions, each the question and the recommended answer on one line. The alternatives and what each changes go in the `question.asked` options (the companion's card shows them) and in your reply when the user asks; your calls are listed when they say "calls". A reply of "yes" takes every recommendation; "2: …" changes only that one. Leave out a decision whose options depend on an earlier answer, and put it in the next brief once that answer is in. If a reply can't be matched to the brief, ask once which number it means.
- **Play back in parts** (standard specs; spec-writing R3). As soon as you understand one part well enough to describe it (who can do it, what the result contains, what happens when it fails), describe it back in at most 300 words, then ask what's wrong or missing. Only what the user said goes in as theirs; anything you filled in is your proposal, with your reason. Playback and briefs alternate until every part has been played back. A compact request skips this: its one brief covers it.
- **Show what they'll see** (spec-writing R1). When the requirement changes something the user will look at (a page, a screen, a layout, a flow of steps), sketch it in a fenced block of text, a few lines of what they'd see, and put it next to the part you're playing back. Requirements, limits and trade-offs stay in words.
- **Offer a spike** when a throwaway build of under an hour would answer an open question faster than talking (does a 10,000-row table stay usable on one page?). Offer it in one line; build only on the user's yes, on a branch `factree/spike-<spec-id>` made from their current commit, labelled throwaway, never merged, and never on their branch. Log `spec.step` with `{"step":"spike","note":"factree/spike-<spec-id>"}`. Then say what it showed and record it in the spec, as an Observation or, if the user decides something from it, a Decision. If they say no, build nothing and keep the question in the brief (spec-writing R4).
- **Approaches only for real choices.** If there are genuinely different ways to deliver the behaviour (synchronous download vs background job and email), sketch two or three with trade-offs, recommend one, and let the user pick. The choice becomes a decision.

If the user says "just write it" or "you decide", stop asking: make the calls, log and list each as yours, and put anything that truly needs a human in Open questions.

### 9. Write the spec

Start from `template.md` for a new spec. Follow factree:spec-format exactly. Writing rules are below under **Writing requirements and scenarios**.

- Every requirement traces to a `Source:` (the requirement, a section of it, or an observation), unless it's a technical necessity you state as such.
- **A source the build can read that states behaviour testably** (exact values, codes, formats, limits): each requirement's statement names the source section it implements instead of restating it; concrete values live in scenarios, one per stated rule plus the cases it leaves unstated (edge cases, lens risks). Any other source, including a tracker only this session reached, is treated like a vague one: state the rules.
- Lens gap checks that apply become scenarios (step 6); say so in the summary ("added from the backend lens: ...").
- Every gap you didn't resolve becomes an open question with an owner, and `Blocked by:` on the requirements it blocks.
- Decisions: only what a person decided in this conversation, or what the user explicitly delegated to you ("you decide" → record it with your name as `Claude, delegated by <user>`).
- Code: entry points and key modules with paths. "Not built yet." for new capabilities.
- Scope's **Anti-goals:** what would make this a failure even if it technically works ("an export that silently drops rows"). Use the user's words if they gave any; otherwise propose them and list them among your calls (spec-writing R2).
- **Sketch:** when the user will look at the result, the sketch you agreed on goes in the `## Sketch` section, after Requirements, in one fenced block, and the approval summary shows it too. Leave the section out when there's nothing to look at (spec-writing R1).
- **Flow** (spec-flow R1): when the spec has screens or states, or otherwise warrants one, the Sketch is a `flow` block: one line per step, `From -> To : action [R2.S1]`, the first line starting the main path, each line naming the scenarios that prove it (none makes it a gap). A spec with no screens or states gets none. Format: factree:spec-format, Sketch.
- Paths: when the workspace serves several repos, start every path with the repo folder (`api/src/exports/routes.ts`), so it's unambiguous.
- When editing, keep every existing ID, follow the editing rules in spec-format, set `status: draft`, and update `updated`.

### 10. Check it

Do all three before showing the user:

1. **Self-review** against `checklist.md`'s final section (the quality checks). Fix what fails.
2. **Validate the structure:** run `bash <skill>/scripts/validate.sh <workspace>/specs/<id>.md`. Fix every ERROR. Fix WARNINGs unless you have a reason, and mention any you leave.
3. **Builder check** only when the spec has open questions, behaviour calls about what the source didn't settle, a conversation-only source, or the user asks: dispatch a fresh subagent with `builder-check.md` and the spec path. Sort what it raises: already answered (add it to the spec), minor (decide it, note it as your call), or needs the user (bring these in one message, most important first). Without a subagent tool, do this read yourself.

### 11. Present and get approval

Send a short report, not the spec (the user can open the file): at most 5 lines, result first (`<plugin>/shared/writing.md`), then any decision still open, one line each.

```
Spec link-report: 4 requirements, 9 scenarios. Approved by the flow; planning.
Changed: added R4 Export limit; R2 gains S3            ← edits only
1. Audit log entry per export? → no (recommended)      ← only if a decision is open
```

Decisions, your calls, open questions and source coverage are in the spec; give them when the user says "details".

**No approval stop** (factory-flow R1, D2): if no decision is open (every brief answered, no open question blocking a requirement), don't ask for approval. Set `status: approved`, `approved_by: "flow: no open decisions"` and `approved_at`, log `spec.approved` with `{"by":"flow: no open decisions"}`, send the summary as a report, and go straight on as **On approval** says. If a decision is still open, ask it as a brief and go on once it's answered (factory-flow R1.S3). With `flow: step`, ask **"Approve this spec?"** as before.

**Compact requests:** after step 10, plan the spec in the same run, following `/factree:plan`'s process: load its skill file from `<plugin>/skills/plan/SKILL.md`. Then, if nothing is open in either, record both as approved by the flow (`approved_by: "flow: no open decisions"`), log `spec.approved` and the plan's events, send both summaries as a report, and go straight on to build the plan (with `flow: step`, ask **"Approve the spec and plan?"** instead): load `<plugin>/skills/build/SKILL.md` and follow it (factory-flow R1.S2). If the spec ended up with more than 3 requirements, more than one vertical, or something new, say it's now standard, ask for spec approval alone, and leave planning to `/factree:plan`.

- **On approval** (by the flow, or by the user under `flow: step`): set `status: approved`, `approved_by` (`flow: no open decisions`, or the user's name from `git config user.name`) and `approved_at`. Log `spec.approved`. Then go straight on to plan it: say "Planning <spec-id>.", load `<plugin>/skills/plan/SKILL.md` and follow it (factory-flow R1). With `flow: step`, say it's ready to plan with `/factree:plan` and stop instead.
- **On changes:** make them, re-run step 10, summarise what changed, ask again.
- **Approval covers only what they've seen.** "Looks good" to an idea is not approval of a spec you haven't shown.

## Logging events

Log as you go with `bash <plugin>/scripts/event.sh <type> <spec-id> '<json>'`. The Factree UI shows these live, so people can follow a spec being written and see your questions clearly. Start logging as soon as step 5 settles the spec id (for a new spec, the id you're about to create). Keep JSON values short, plain strings; escape any double quote inside them as `\"`.

**Progress**, one `spec.step` at the start of each of these steps:

| Step | Event data |
|---|---|
| 6. Break the requirement down | `{"step":"gaps","note":"<one line, e.g. 3 asks, 4 gaps found>"}` |
| 7. Observe current behaviour | `{"step":"observe","note":"<what you looked at>"}` |
| 8. Talk it through | `{"step":"questions","note":"<how many questions you expect>"}` |
| 9. Write the spec | `{"step":"writing"}` |
| 10. Check it | `{"step":"checking"}` |
| 11. Present and get approval | `{"step":"approval","note":"<n> requirements, <n> scenarios"}` |

On the first `spec.step` also include `"title"` and `"sources"`, so a spec still being written can be listed before its file exists: `{"step":"gaps","title":"Export button on the team page","sources":["JIRA-517"],"note":"…"}`. If step 4 sizes the request as tiny, nothing is logged.

**Questions you ask in the conversation** (step 8, and any later step):
- Just before sending a brief, one `question.asked` per numbered decision in it (the number is `n`, counting on across briefs): with `{"n":2,"text":"<the question>","why":"<what the answer changes>","proposal":"<your recommendation, or empty>","options":["<another option> — <what it changes>"]}`. `options` lists the choices other than the recommendation, so the Factree UI can offer them.
- When the user answers: `question.answered` with `{"n":2,"answer":"<their answer in a few words>"}`.

**Links to the Factree UI:** whenever you ask the user a question, ask for approval, or have just written the spec file, run `bash <plugin>/scripts/link.sh <spec-id>`. If it prints a line, end your message with that line, unchanged, so the user can open the spec in one click. It prints nothing when the UI isn't running; then add nothing.

**Changes to the spec:**

| When | Event |
|---|---|
| New spec file written | `spec.created` with `{"requirements":N,"sources":[...]}` |
| Existing spec edited | `spec.updated` with `{"added":["R4"],"changed":["R2"],"retired":[]}` |
| Approved | `spec.approved` with `{"by":"<name>"}` |
| Question added / answered | `question.opened` `{"id":"Q3"}` / `question.resolved` `{"id":"Q1","by":"D2"}` |
| Decision recorded | `decision.recorded` with `{"id":"D2","by":"<name>"}` |
| Your own call | `decision.recorded` with `{"id":"call-1","by":"Claude","call":true,"text":"<the call, in a few words>"}` |
| The user overrules one of your calls | `decision.recorded` with `{"id":"call-1-override","by":"<name>","overrides":"call-1","kind":"<what kind of call, in 2–3 words, e.g. date format>","choice":"<their choice>"}` (self-improving R1). Use the same `kind` wording for the same kind of call every time, so repeats can be counted. |
| A bug fix adds a scenario to a spec whose last verify had proved scenarios, or the user calls a bug escaped | `bug.escaped` with `{"scenario":"R1.S5","slipped":"<what slipped through, in a few words>"}` (self-improving R3). Not for a spec that was never verified, unless the user calls it escaped. |

## Writing requirements and scenarios

**A requirement is one observable behaviour.** Test: could a tester who has never seen the code tell whether it holds?

| Weak | Strong |
|---|---|
| The system SHALL handle large exports gracefully. | The export service SHALL begin the download within 2 seconds for teams of up to 100,000 links. |
| The system SHALL validate and store the upload and notify the user. | Three requirements: validation, storage, notification. |
| The system SHALL use a Redis queue for exports. | Not a requirement. A decision, if a person made it. |
| The system SHALL be secure. | The export service SHALL refuse export requests from users without the admin role. |

- Name the subject concretely ("the export service", "an admin"), not "the system", when there's a better word.
- SHALL/MUST by default. SHOULD only when there's room for a justified exception; MAY only for genuinely optional behaviour. Quantify every adjective: numbers, limits, formats, time. A requirement may instead name the source section it implements as its one behaviour ("SHALL behave as SHORT-43 §3 states"); that section and its scenarios quantify it.

**A scenario is a concrete case that could become a test.**

- Use specific values: "2 active and 1 deleted link", not "some links".
- One scenario, one case. Name it after the case: "S2 Empty team", not "S2 Second test".
- Cover the cases where bugs live: empty input, the limit and one over it, missing permission, the thing already existing, the thing disappearing midway, the second click, the failure of something this depends on.
- A scenario that just restates its requirement tests nothing. Rewrite it as a specific situation with a specific outcome.
- Before finishing, ask yourself: which case would the user be most upset to see broken? Make sure a scenario names it.

**Evidence with every claim** (verifying R3): say work is done, passing or fixed only right after running the command that shows it, and quote the command and its result ("npm test: 206 passed"). One failing test is named as failing, never "done".

## Red flags

| Thought | Reality |
|---|---|
| "I'll ask this now and the other one after" | If the two don't depend on each other, they go in one brief. |
| "Better ask about this layout choice, to be safe" | Layout, naming and defaults are your call. Log it and list it; the user can overrule. |
| "This looks small, I'll skip sizing" | Size every request, in one line, before asking anything. |
| "The requirement is clear, I'll skip recon" | Recon is what turns a requirement into a spec. Read the code first. |
| "I'll list all my questions at once" | One at a time. Most questions disappear once the first is answered. |
| "I'll fill in a sensible default quietly" | Defaults are fine. Say them. A default the user never heard is one they couldn't reject. |
| "This decision is obvious, I'll record it" | Only people make decisions. Propose it and let them agree. |
| "The happy path is covered, that's enough" | Bugs live in the failure cases. Cover them. |
| "I'll put the table design in the requirement so the builder knows" | Implementation goes in Code or Decisions. Requirements describe behaviour. |
| "While I'm here I'll tidy the other requirements" | Change only what this requirement touches, and say exactly what changed. |
| "It's approved in spirit, I'll start building" | This skill ends at approval. Building is a separate step. |
