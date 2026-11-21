# /factree:spec test cases

Run each case in a scratch repo with the plugin installed. Paste the input to `/factree:spec`, play the user (answer questions briefly, approve when asked), then check the output against the expectations. Rerun every case after changing the skill, and note results in the table at the bottom.

Every case must also pass:
- `validate.sh` reports 0 errors on every spec written.
- No product code, tests or config were changed (`git status` shows only `.factree/` or nothing, since `.factree/` is excluded).
- `.factree/events.jsonl` has the expected events.
- At most about five questions were asked, one per message, each saying what the answer changes.

---

## 1. New capability from a rough ticket

**Repo:** any app with users and teams (or the scenario in the test fixture, `tests/fixtures/workspace/`).
**Input:**
> Admins want to export links to report. Should include owner name, email, link name, dates. Large teams must work. Use streaming. Only admins.

**Expect:**
- Recon happens before the first question (mentions existing export or auth code if present).
- Asks why (or what the export is used for) before details.
- "Use streaming" becomes a decision or a Code note, not a requirement.
- "Large teams" is quantified or raised as an open question, never left as "large".
- Deleted or inactive links are addressed (decision or question).
- Scenarios include at least: non-admin refused, empty team, a value needing report quoting or a missing date.
- Summary shows source coverage for all five items in the ticket.

## 2. Change to an existing spec

**Setup:** copy `tests/fixtures/workspace/specs/link-report.md` into the scratch repo.
**Input:**
> Admins should also be able to filter the export to links created in a date range.

**Expect:**
- Edits `link-report.md`; does not create a new spec.
- Existing IDs R1–R4 unchanged; new behaviour is R5 (or new scenarios on R2 if justified).
- Asks or decides: inclusive or exclusive range, time zone, what happens with an invalid range (from after to).
- `status` goes back to `draft` until re-approved; `updated` is today.
- Summary lists changes by ID. Event `spec.updated` with the added IDs.

## 3. Existing code, no spec

**Repo:** a real codebase with an existing feature and no `.factree/`.
**Input:**
> Password reset links should expire after 30 minutes instead of 24 hours.

**Expect:**
- Creates `.factree/specs/`, adds `.factree/` to `.git/info/exclude`.
- Writes Observations of current reset behaviour with file references, only for the reset flow.
- Requirement for 30-minute expiry with scenarios at 29 minutes, 31 minutes, and an already-used link.
- Asks or decides what happens to links created before the change.

## 4. Vague ask

**Input:**
> Make the dashboard better for managers.

**Expect:**
- Does not write a spec straight away.
- First question is about why or what managers struggle with, with no menu of options.
- If the user stays vague after a couple of answers, records open questions instead of inventing requirements.

## 5. Not a behaviour change

**Input:**
> Upgrade the ORM to the next major version.

**Expect:**
- Says no spec is needed, in one or two lines, and stops. No files written.

## 6. One requirement, two capabilities

**Setup:** existing `link-report.md` spec.
**Input:**
> Only admins with the new "data export" permission can export, and the permission must be assignable from the roles screen.

**Expect:**
- Recognises two capabilities (export access, role management) and lists the specs it will touch before writing.
- Edits R1 in `link-report.md`; creates or edits a roles/permissions spec for assignment.
- Both specs validate; both record the same source.

## 7. Frontend requirement

**Repo:** an Angular or React app.
**Input:**
> Add an export button to the team page that downloads the links report.

**Expect:**
- Detects the frontend lens and uses its gap checks.
- Asks or decides what the user sees while the download is preparing, if it fails, and on a team with no links.
- Asks whether there's a design (Figma or screenshot) and records it under `sources` if given.
- Covers which roles see the button and what others see.

## 8. Workspace in a parent folder

**Setup:** folder containing `api/` and `web/` repos, with `.factree/` in the parent.
**Expect:**
- Uses the parent workspace from inside either repo; doesn't create `.factree/` in the repo.
- Paths in the spec start with `api/` or `web/`.

## 9. Link the skill can't reach

**Input:**
> https://accredible.atlassian.net/wiki/spaces/PROD/pages/999/Exports (with no Confluence connector)

**Expect:**
- Says it can't reach Confluence from here and asks for the content to be pasted. Does not guess.

## Sizing [decision-flow#R1.S1] [decision-flow#R1.S2] [decision-flow#R1.S3] [decision-flow#R1.S4] [factory-flow#R7.S1] [factory-flow#R7.S2]

**Input:** in turn: "make the status text smaller"; "add a Copy button next to each scenario id"; "export button on the team page that calls a new export endpoint"; then repeat the second and reply "treat as standard"; then "rename the internal helper parseRow to readRow".
**Expect:**
- (1) one line: Tiny; a one-requirement spec and a one-task plan, approved by the flow, then built, verified and sent for review; it shows in the companion.
- (2) one line: Compact, with its reason; spec and plan come for approval together.
- (3) Standard, because it spans two verticals.
- (4) the full flow after the override.
- (5) Tiny; the requirement says the behaviour stays the same and names the scenarios that prove it; through the factory. No answer in this case says no spec is needed.

## A short report [concise-output#R1.S1] [concise-output#R1.S2]

**Input:** "add a Copy button next to each scenario id", answering "yes" to the brief; then reply "details".
**Expect:**
- The spec report is at most 5 lines, starting with the spec's name and that the flow approved it.
- "details" gives the calls, the coverage and the files.

## Two decisions [concise-output#R2.S1]

**Input:** a requirement that leaves open where a button goes and what a double click does.
**Expect:** a brief of two numbered lines, each a question and its recommended answer, and one line on how to reply; asking "options" gives the alternatives.

## A flow [spec-flow#R1.S1] [spec-flow#R1.S2]

**Input:** (1) "an export button on the team page: exporting shows progress, then the file; a second click while it runs says it's busy"; (2) "the cleanup script exits 0 when done, 2 when the folder is missing".
**Expect:**
- (1) the spec's Sketch is a flow block with a line for each step (Team page, Exporting, File, Busy), each tagged with the scenarios that cover it or none; it validates with no errors.
- (2) no flow block.

## Decision brief [decision-flow#R2.S1] [decision-flow#R2.S2] [decision-flow#R2.S3] [decision-flow#R2.S4]

**Input:** a requirement leaving open both where a button goes and what a double click does, plus a choice that only matters if the user wants a confirmation step.
**Expect:**
- One message numbers both independent decisions, each with a recommendation and what changes otherwise.
- "yes" takes both recommendations; "2: b" changes only decision 2.
- The confirmation-dependent choice comes only in a later brief, after the user wants confirmation.

## Ask by impact [decision-flow#R3.S1] [decision-flow#R3.S2]

**Input:** a requirement silent on what happens when an export is already running, and where a new panel could go in either of two places with no behaviour difference.
**Expect:** the export question is in the brief. The panel placement isn't asked: it's logged as `decision.recorded` with `"call": true` and listed under "My calls".

## Compact spec and plan [decision-flow#R5.S1] [decision-flow#R5.S2]

**Input:** a compact request with no open decisions; then one that turns out to need 4 requirements.
**Expect:**
- (1) the spec and a plan are written in one run; one brief asks "Approve the spec and plan?"; approval sets both approved.
- (2) the skill says it's now standard and asks for spec approval only.

## Options for the companion [companion-decisions#R2.S1]

**Input:** a requirement with an open choice between two placements for a button.
**Expect:** the `question.asked` event has `proposal` (the recommendation) and `options` (the other placement, with what it changes); in the companion's inbox the card shows both, with the recommendation marked and a link to the requirement.

## Link to the companion [companion-handoff#R1.S1] [companion-handoff#R1.S3]

**Setup:** the Factree UI running (`/factree:ui`); then again with it stopped.
**Expect:** with the UI running, each question, the approval request and the message after writing the spec end with `View in Factree: http://localhost:<port>/#spec=<id>`. With it stopped, no such line.

## Answered in the terminal while waiting [companion-decisions#R8.S2]

**Setup:** the Factree UI running. Get to a question; the skill starts the background wait.
**Expect:** answer in the terminal instead. Claude stops the wait before carrying on, and no "Decided in the Factree companion" report of that answer arrives afterwards.

## Approved in the companion [companion-decisions#R11.S1]

**Setup:** the Factree UI running. Get to "Approve this spec?" and approve it in the companion instead of replying.
**Expect:** with nothing typed, Claude says the spec was approved and starts the plan for it.

## Woken by a companion decision [companion-decisions#R8.S1]

**Setup:** the Factree UI running; a session that has asked a question and started `wait-decision.sh <spec>` in the background, then gone idle. Make the decision from somewhere Claude Code isn't tracking (the companion, or a detached `curl` to `/api/decisions`).
**Expect:** within 5 seconds of the decision, with nothing typed, the session wakes with "Decided in the Factree companion:" and the decision, and carries on from it.


## Nothing open, then planned [factory-flow#R1.S1] [factory-flow#R4.S1]

**Setup:** no `approve_plans` preference; a requirement whose plan will need nothing new.
**Expect:** answer the brief. With nothing more typed, Claude records the spec as approved by "flow: no open decisions" (never asking "Approve this spec?"), says "Planning <id>.", records the plan the same way, says "Building <work>.", builds it, says "Verifying <id>.", and ends with the verify result. No message asks whether to go on.

## Compact, then built [factory-flow#R1.S2]

**Setup:** a compact request.
**Expect:** with nothing open, the spec and plan are both recorded as approved by the flow and Claude goes straight on to building the plan, not to planning it again.

## Open decision stops it [factory-flow#R1.S3]

**Setup:** a requirement leaving an open question that blocks a requirement.
**Expect:** Claude asks that question and doesn't plan until it's answered.

## Step by step [factory-flow#R5.S1]

**Setup:** `flow: step` in `.factree/preferences.md`.
**Expect:** after the spec is approved, Claude says it's ready to plan and stops; after a plan is approved, that it's ready to build, and starts nothing.


## Sketch for a page change [spec-writing#R1.S1]

**Input:** "Add an Export button to the team page."
**Expect:** the approval message includes a text sketch of the team page with the button, and the spec has a `## Sketch` section holding it. The spec validates with 0 errors.

## Anti-goals proposed [spec-writing#R2.S1]

**Input:** "Finance wants a report export of links."
**Expect:** Scope has an Anti-goals line such as "an export that silently drops rows", and the summary lists it as Claude's call.

## Played back in parts [spec-writing#R3.S1] [spec-writing#R3.S2]

**Input:** a standard requirement covering who can export and what the file contains; then a compact one.
**Expect:** for the standard one, "who can export" and "what the file contains" are played back in separate messages of at most 300 words, each ending with what's wrong or missing; the compact one has no separate playback.

## Spike [spec-writing#R4.S1] [spec-writing#R4.S2]

**Input:** an open question whether a 10,000-row table stays usable on one page; accept the offered spike, then in another run decline it.
**Expect:** accepted: Claude builds on `factree/spike-<spec-id>`, reports what it showed, records it in the spec, and the user's branch is unchanged. Declined: nothing is built and the question stays in the brief.


## Override recorded [self-improving#R1.S1]

**Setup:** a spec where Claude logged call-2 "ISO 8601 dates".
**Expect:** pasting its override with "use DD/MM/YYYY" logs `decision.recorded` with `overrides: call-2`, kind "date format" and choice "DD/MM/YYYY".

## Escaped bug [self-improving#R3.S1] [self-improving#R3.S2]

**Setup:** a bug fix adding R1.S5 to `companion-decide` (verified, 4 of 4 proved); then a bug fix on a spec never verified.
**Expect:** the first logs `bug.escaped` naming R1.S5 and what slipped through; the second logs none.


## A spec in a fresh repo [workspace-setup#R1.S2]

**Setup:** a git repo with no Factree workspace anywhere above it.
**Expect:** `/factree:spec Add report export` says "Created a Factree workspace in <repo>/.factree (local only)" and carries on with the spec; `git status` stays clean.

## Lens risks become scenarios [factory-quality#R4.S1] [factory-quality#R4.S2] [factory-quality#R4.S3]

**Setup:** a backend repo. Three runs of `/factree:spec`: (a) "Add PATCH /links/:code to change a link's target"; (b) "Store the User-Agent header on each click and export clicks as CSV"; (c) a source that already says what happens when two requests create the same alias at once, for an alias-creating endpoint.
**Expect:** (a) a scenario for the link being deleted while the body is still arriving, with the status code the caller gets; (b) a scenario with a header of `Mozillé/5` that the export shows unchanged; (c) the alias race comes from the source, and no extra lens scenario repeats it.
**Failing run on record:** the SHORT-43 A/B run's spec (`.factree/ab/short-43/`, spec open questions O3 and O7) had neither scenario; the PATCH-during-delete 500 and the mangled header were found only after the build.

---

## Proportional spec [factory-quality#R6.S1] [factory-quality#R6.S2] [factory-quality#R6.S3] [factory-quality#R6.S4]

**Setup:** three runs of `/factree:spec`: (a) SHORT-43 as a file in the repo (6 sections with status codes, formats and limits); (b) the one-line source "customers want their links to expire"; (c) the same SHORT-43, but only as a ticket id in a tracker this session reached and the build can't open.
**Expect:** (a) each requirement names its ticket section instead of restating it, the spec is under 250 lines, and every rule in the ticket has a scenario; (b) the spec states the rules itself, with scenarios; (c) the rules are stated in the spec, as for (b).
**Failing run on record:** the SHORT-43 A/B round 2 spec (`.factree/ab/short-43/`) was 426 lines and 56 scenarios for a precise ticket, and the builder check ran on it.
**Before the change:** every ticket rule was restated in prose in the requirements and again in scenarios.

## Builder check only when unsettled [factory-quality#R7.S1] [factory-quality#R7.S2]

**Setup:** two runs of `/factree:spec`: (a) a precise file ticket giving 8 requirements, no open questions and no behaviour calls; (b) a request where 3 behaviours are left to Claude's call.
**Expect:** (a) no builder check subagent is dispatched; (b) the builder check runs.
**Before the change:** (a) ran the builder check, because it had 6 or more requirements.

## Implement triggers the factory [factory-quality#R8.S1] [factory-quality#R8.S2]

**Setup:** a repo with no `.factree/`. Three headless runs of `claude -p --max-turns 3 --plugin-dir <branch>/plugins/factree` with the round 1 prompt (`.factree/ab/short-43/judge/prompt.md`: "Implement the following feature in this repository, end to end…" plus the ticket); then three runs with "How does the rate limiter work?".
**Expect:** the first skill invoked is `factree:spec` in all 3 round 1 runs; none of the 3 question runs invokes a Factree skill.
**Failing run on record:** in A/B round 1 the Factree-loaded session invoked no Factree skill on that prompt.
**Before the change:** the description named only specifying, so "implement" went to a plain build.

---

## Results

| Date | Skill version | Case | Pass? | Notes |
|---|---|---|---|---|
| 2026-11-18 | 0.5.0 | Woken by a companion decision | pass | Idle from 18:16:54 UTC; an untracked curl answered bulk-export question 2 in the demo at 18:17:24; the wait printed it at 18:17:25; the session woke at 18:17:28 |
