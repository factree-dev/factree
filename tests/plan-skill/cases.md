# /factree:plan test cases

Run each case in a scratch setup with the plugin installed, play the user, then check the output. Rerun after changing the plan skill or a lens, and log results at the bottom.

Every case must also pass:
- `validate-plan.sh <work-folder>` reports 0 errors.
- No product code, tests, migrations or config changed.
- Only the spec's Decisions and Code sections changed; its status didn't.
- Every reused pattern cites a file that really shows it.
- Events: `plan.created`, `plan.design_approved`, `plan.approved` in order; `plan.created` lists the verticals [plan-verticals#R7.S1].
- The plan is `plan.md` plus a folder per vertical; status and approvals appear only in `plan.md` [plan-verticals#R5.S1].

---

## 1. Backend change following existing patterns

**Setup:** an Express or Rails API with an existing similar feature; an approved spec for a new endpoint.
**Expect:**
- Detects the backend lens; builds `profiles/<project>.md` if missing.
- Every Reused pattern cites `path:line` from this repo; New says "None." if nothing new is needed.
- Asks at most one or two scale questions, and only for triggers the repo can't answer (e.g. doesn't ask table size if a migration or doc states it).
- Tasks are vertical slices, each within 300 lines, each proving named scenarios.

## 2. Frontend change

**Setup:** an Angular or React app; approved spec for a new screen with a list.
**Expect:**
- Only a `frontend/` vertical, with its design and tasks, and `plan.md` beside it [plan-verticals#R1.S2].
- Detects the frontend lens; design has Component tree, UI states and Accessibility sections.
- UI states table covers loading, empty, error and success for each user-facing scenario.
- Asks how many items the list can hold if the repo doesn't show it; mentions pagination or virtualisation depending on the answer.
- Test strategy uses component tests and end-to-end tests matching the repo's tools.
- If there's no Figma or screenshot in the spec's sources for a new screen, says so instead of inventing a layout.

## 3. New pattern needed

**Setup:** a repo with no background job system; spec requires processing that can't finish inside a request.
**Expect:**
- Lists the job system under New, with why existing patterns don't fit and alternatives.
- Asks for explicit approval of that pattern by name, separately from the design.
- After approval, records `Approved: <name>, <date>` on it and adds a decision to the spec.

## 4. Spec gap found while designing

**Setup:** approved spec that doesn't say what happens on a duplicate submission, where the design makes it matter.
**Expect:**
- Stops and raises the gap; does not decide the behaviour in the design.
- Offers `/factree:spec` or, with agreement, an open question in the spec with the requirement left out of scope.

## 5. Draft spec

**Setup:** spec with `status: draft`.
**Expect:** refuses to plan, points to `/factree:spec` for approval. No work folder created.

## 6. One workspace, two repos

**Setup:** folder containing `api/` and `web/` repos with `.factree/` in the parent; spec covering an endpoint and a button.
**Expect:**
- Finds the parent workspace from inside either repo.
- Detects backend for `api/` and frontend for `web/`, builds both profiles.
- Paths in the design and tasks start with `api/` or `web/`.
- Frontend tasks that need the endpoint depend on the backend task, or build against a mock that matches the contract.
- `backend/` and `frontend/` verticals and no `infra/`, even if the repos have Dockerfiles [plan-verticals#R1.S1].
- `plan.md` Coverage names each scenario's task and vertical [plan-verticals#R2.S1]; Order puts the endpoint task before the button task [plan-verticals#R2.S2] and shows them as one slice [plan-verticals#R2.S3].
- The endpoint's request and response are defined in `backend/design.md` only; `frontend/design.md` links to them [plan-verticals#R4.S1].

## 7. Custom review budget

**Input:** "Plan this, but keep tasks under 150 lines."
**Expect:** `review_budget: 150`; tasks split accordingly; validator passes.

## 8. Changed spec, partial scope

**Setup:** a spec that was planned and built before, then gained R5 through `/factree:spec`.
**Expect:** proposes R5 only as scope, from the event log, and asks to confirm.


## 9. Infra vertical [plan-verticals#R9.S1]

**Setup:** a Node API with a `deploy/` folder of Terraform; an approved spec that needs a new queue and a new environment variable.
**Expect:**
- Detects `infra` for `deploy/` and loads the built-in infra lens.
- The infra design has the lens's **Resources and environments** and **Rollout and rollback** sections.
- Scale questions come from the infra lens's triggers (the queue is a new always-on resource), asked only if the repo can't answer.

## 10. Workspace infra lens wins [plan-verticals#R9.S2]

**Setup:** case 9 plus `.factree/lenses/infra.md` whose Design sections are only **Change window**.
**Expect:** the infra design has a **Change window** section and neither of the built-in lens's Design sections; the skill says it used the workspace lens.

## 11. Vertical with no lens file [plan-verticals#R1.S3]

**Setup:** a Flutter app (`pubspec.yaml`); an approved spec for a settings toggle.
**Expect:** a `mobile/` vertical whose design says at the top that it was written without a lens and follows the core process.

## 12. Code no lens covers, lens declined [plan-verticals#R1.S4] [plan-verticals#R10.S2]

**Setup:** a repo with shell scripts in `scripts/` and no workspace lenses; an approved spec that changes only `scripts/*.sh`. Decline the drafted lens.
**Expect:** no file in `.factree/lenses/`; a single `general/` vertical; `plan.md` lists `verticals: [general]`.

## 13. One project, two lenses [plan-verticals#R1.S5]

**Setup:** a Next.js app with `app/api/`; an approved spec adding one API route and one page.
**Expect:** the route work in `backend/tasks.md`, the page work in `frontend/tasks.md`; no task appears in both, and no task changes files from both.
## Link to the companion [companion-handoff#R1.S2]

**Setup:** the Factree UI running.
**Expect:** the design checkpoint and the plan approval request end with `View in Factree: http://localhost:<port>/#spec=<spec>&plan=<work>`.

## 14. Diagrams [plan-diagrams#R1.S1] [plan-diagrams#R1.S2] [plan-diagrams#R2.S1] [plan-diagrams#R3.S1] [plan-diagrams#R3.S2]

**Setup:** three approved specs: (a) a button calling a new endpoint that writes to the database; (b) a change inside one function; (c) an export job that goes queued → running → done or failed.
**Expect:**
- (a) the backend design's Flows has a `sequenceDiagram` with the button, endpoint and database; plan.md Order has a `flowchart` from the backend task to the frontend task.
- (b) Flows says "Not applicable."; with one vertical and two tasks, Order has no diagram.
- (c) the design has a `stateDiagram-v2` with exactly those four states.
- `validate-plan.sh` reports no mermaid warnings.

## 15. A lens for code no lens covers [plan-verticals#R10.S1] [plan-verticals#R10.S3] [plan-verticals#R10.S4] [plan-verticals#R11.S1]

**Setup:** the repo from case 12, with no workspace lenses.
**Expect:**
- At the design checkpoint the skill shows a drafted `tooling` lens and asks "Approve the tooling lens?" before writing anything [R10.S1].
- After approval: `.factree/lenses/tooling.md` has every contract section and a Detect section matching `scripts/*.sh`. Its first line says it was generated by /factree:plan, the date, the plan and the approver [R11.S1]. The plan has a `tooling/` vertical whose design has the lens's design sections (Command contract, Portability notes) [R10.S1].
- Plan a second change to `scripts/*.sh`: `detect.sh` reports `tooling`, and the skill uses it without drafting or asking [R10.S3].
- Plan a change only to a React app in the same repo: no lens is drafted [R10.S4].

## 16. One approval when nothing is new [decision-flow#R4.S1] [decision-flow#R4.S2] [decision-flow#R3.S3]

**Setup:** (a) an approved spec whose plan reuses only existing patterns and needs no lens; (b) one whose design needs a library the repo doesn't use.
**Expect:**
- (a) no design checkpoint; after the tasks, one brief lists Claude's calls and asks "Approve this plan?"; approval sets design_approved and approved in plan.md and logs plan.design_approved then plan.approved.
- (b) a design brief comes first, with the library as a numbered decision, before any tasks are written; the library is never listed as Claude's call.

## 17. Preferences [preferences#R1.S1] [preferences#R1.S2] [preferences#R2.S1] [preferences#R2.S2] [preferences#R2.S3] [preferences#R3.S1] [preferences#R3.S2] [preferences#R4.S1]

**Setup:** in turn: (a) no preferences file; (b) `approve_plans: nothing-new` and `review_budget: 200`, plus `approve_specs: always`; plan a change reusing only existing patterns; (c) same, but the design needs a new library; (d) same as (b), and say "keep tasks under 150 lines"; (e) a compact request under (b).
**Expect:**
- (a) plans are asked for approval as before.
- (b) one line says `approve_specs` isn't a known preference. The plan is approved without asking: "Plan approved by preference (approve_plans: nothing-new)." `plan.md` has `approved_by: preference: approve_plans`, `review_budget: 200`, no task over 200, and `plan.approved` has `"by":"preference: approve_plans"`.
- (c) the new library is a named decision and the plan is asked for approval.
- (d) `review_budget: 150`.
- (e) "Approve the spec and plan?" is still asked.


## Plan approved in the companion [companion-decisions#R11.S2]

**Setup:** the Factree UI running. Get to the plan approval and approve it in the companion instead of replying.
**Expect:** with nothing typed, Claude replies that the plan is approved and ready to build, says "build" starts it, and starts no build: no branch, worktree or task events.


## Nothing new, then built [factory-flow#R2.S1]

**Setup:** no `approve_plans` preference; an approved spec whose design adds nothing new.
**Expect:** the plan is recorded as approved by "flow: no open decisions" without asking, and Claude says "Building <work>." and starts the build in the same run.

## New pattern decided in the companion, then built [factory-flow#R2.S2]

**Setup:** the Factree UI running; a plan with a new pattern; approve the pattern in the companion.
**Expect:** with nothing typed, Claude starts building the plan.

## New pattern stops it [factory-flow#R4.S2]

**Setup:** an approved spec whose design needs a new pattern.
**Expect:** Claude stops at the design checkpoint and asks for the new pattern's approval; nothing is built.


## Decisive steps [planning#R1.S1]

**Setup:** an approved spec with a scenario "2 active and 1 deleted link → header and 2 rows".
**Expect:** the task proving it has a test step naming `excludes deleted links [link-report#R2.S1]` with the 2-active, 1-deleted setup and "header and 2 rows"; the validator reports no "steps name no test" warning.

## Review focus [planning#R2.S1]

**Setup:** a spec for a page listing a spec's decisions, with no scenario for a spec that has no file yet.
**Expect:** Review focus lists "a spec with no file yet", and Spec updates proposes it as a scenario.

## Global constraints [planning#R3.S1]

**Setup:** a spec saying exports start within 2 seconds for up to 100,000 rows.
**Expect:** Global constraints holds that sentence word for word.

## Setup folded in [planning#R4.S1]

**Setup:** work needing a new config entry used only by one endpoint.
**Expect:** the config entry is part of the endpoint's task, not a task of its own.

## Names match [planning#R5.S1]

**Setup:** a plan draft where T1 produces `clearLayers()` and T3 consumes `clearFullLayers()`.
**Expect:** the presented plan uses one name in both tasks.


## Workspace checklist asked [self-improving#R6.S2]

**Setup:** `.factree/checklists/plan.md` holding "- [ ] Does every view still work before the thing it shows exists?".
**Expect:** the next plan's Review focus considers views shown before their data exists.


## Plan steps logged [live-activity#R4.S1]

**Setup:** plan an approved spec.
**Expect:** the log has `stage.step` events for `link-report` with steps starting, reading the repo, designing, writing tasks and checking, in that order, the later ones with the work id.

## An amended plan is approved again [planning#R6.S1]

**Setup:** an approved plan being built; add a scenario to its spec, then ask for a task to prove it.
**Expect:** the task is added, `plan.md` gets a new `approved_at`, the log has a new `plan.approved` by `flow: no open decisions`, and the companion's line doesn't show Plan as stale.

## An amendment that needs a decision [planning#R6.S2]

**Setup:** as above, but the new task needs a library the repo doesn't use.
**Expect:** the library is asked as a decision; the plan is approved again only after the answer.

---

## Results

| Date | Plugin version | Case | Pass? | Notes |
|---|---|---|---|---|
