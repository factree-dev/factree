# Plan checklist

## Design
- [ ] There is one design and task list per vertical the change touches, and none for verticals it doesn't. Code no lens covers is in `general`.
- [ ] `plan.md` holds scope, verticals, review budget, order, coverage and status; vertical files don't repeat them.
- [ ] Every interface one vertical produces and another consumes is defined once, in the producer's design, and linked from the consumer's.
- [ ] Every significant choice appears under Patterns as Reused or New.
- [ ] Every reused pattern cites where this repo uses it (`path:line`) and says why it fits.
- [ ] Every new pattern says why existing patterns don't fit and what else was considered, and is marked for approval.
- [ ] Each loaded lens's Patterns to inventory were checked; areas the change touches are covered.
- [ ] Each loaded lens's Scale triggers were checked. Every assumption in Load and scale has a source (spec, repo path, or a named person).
- [ ] No question was asked that the repo could answer.
- [ ] The design decides how, never what. No behaviour is invented that the spec doesn't state.
- [ ] Every in-scope requirement maps to a component.
- [ ] Every in-scope failure scenario has a row in Error handling (or the lens's UI states).
- [ ] Every in-scope scenario has a row in Test strategy, using the lens's test mapping and the repo's real test setup.
- [ ] Each loaded lens's Design sections are present.
- [ ] Code no lens covers has a drafted lens awaiting approval (with Detect and the generated header), or is in `general` because the user declined one.
- [ ] Every flow through three or more components, or across verticals, is a sequence diagram; every lifecycle of three or more states is a state diagram; each mermaid block starts with its kind.
- [ ] Sections that don't apply say "Not applicable."
- [ ] Spec updates touch only Decisions and Code.

## Tasks
- [ ] Every in-scope scenario is proved by at least one task.
- [ ] Every task's estimated diff is within the review budget.
- [ ] Tasks are vertical slices; any foundation task says which tasks rely on it.
- [ ] Each task belongs to exactly one vertical.
- [ ] Tasks are numbered in build order across the whole plan, and each depends only on lower-numbered tasks.
- [ ] The Order in `plan.md` shows which tasks across verticals make up each slice.
- [ ] Each task ends with tests passing and a commit.
- [ ] Steps are test-first, each with a real command from the profile and the expected result.
- [ ] Test names carry their scenario IDs.
- [ ] Interfaces produced by one task match what later tasks consume, name for name.
- [ ] No code bodies where a signature and assertions would do. The plan is shorter than the code it describes.
- [ ] No task quietly adds new infrastructure (test tooling, libraries, services) that the design didn't approve as a new pattern.
- [ ] Summary tables and the coverage in `plan.md` match the task details.
- [ ] Every test step names its tests with their assertions and the spec's exact values; every code step gives the file and signature (planning R1).
- [ ] Review focus lists up to five untested failure modes, each routed to Spec updates or a named test, or says "None found" (planning R2).
- [ ] Global constraints copies the spec's plan-wide values word for word, or says "None." (planning R3).
- [ ] Setup, configuration and docs are folded into the task that needs them (planning R4).
- [ ] Names match across tasks; no step is empty or a code dump; the plan isn't longer than the code (planning R5).
