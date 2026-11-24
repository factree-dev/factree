# Factree

A Claude Code plugin for spec-driven development:
- `/factree:spec`: any requirement (ticket, Confluence page, task, list, conversation) → a spec grounded in the code.
- `/factree:plan`: an approved spec → `plan.md` (scope, order, coverage, status) plus, per vertical it touches, `<vertical>/design.md` (how, from the repo's own patterns) and `<vertical>/tasks.md` (work sized for one code review each).
- `/factree:build`: an approved plan → code, task by task test-first, in parallel by dependencies, each in a git worktree on its own task branch `factree/<work>-T<n>` (per repo), merged into the integration branch `factree/<work>`, marked done with evidence; never pushes.
- `/factree:review`: after the build, push the task branches and open one GitHub pull request per task (via `gh`, in its repo, stacked and linked in merge order, all or none), follow each in the background, keep stacks clean after merges, and fix review comments as commits on the task's branch, or via the spec for behaviour changes; never merges, never pushes `factree/<work>`.
- `/factree:ui`: a local page that follows specs and plans live through every stage, where the user can also make the decisions Claude waits on. Skills link to it with `scripts/link.sh`.
- The stages hand on to each other (factory-flow): a spec or plan with nothing open is approved by the flow, then planned, built and sent for review as a pull request, stopping only for open decisions; `flow: step` in preferences brings back approval stops.

## The model

- **Requirement → spec, always.** The requirement stays where it lives and is linked from the spec's `sources`.
- **A spec is where a requirement meets the code.** One living file per capability: Purpose, Scope, Observations, Requirements (OpenSpec format with IDs), Code, Decisions, Open questions.
- **A plan decides how, never what.** Every reused pattern cites where the repo uses it; every new pattern needs explicit approval. Scale questions only when a lens trigger applies and the repo can't answer. Behaviour gaps go back to the spec.
- **Tasks are sized to review capacity** (`review_budget`, default 300 changed lines), vertical slices, test-first, each proving named scenarios (`link-report#R2.S1`).
- **One process, many kinds of code.** Vertical knowledge lives in lenses (`plugins/factree/lenses/`), chosen by `detect.sh`. Repo overrides in `<workspace>/lenses/` win over built-ins.
- **Workspace lookup like git:** `$FACTREE_HOME`, else nearest `.factree/` up the tree (one workspace can serve several repos), else `<repo>/.factree`. Holds `specs/`, `work/`, `profiles/`, `lenses/`, `repos.md` (the repos it serves), `events.jsonl`.

Canonical spec format: `plugins/factree/skills/spec-format/SKILL.md`.

## Layout

- `.claude-plugin/marketplace.json` — makes this repo installable as a plugin marketplace
- `plugins/factree/skills/spec/` — spec skill, template, checklist, builder check, `scripts/validate.sh`
- `plugins/factree/skills/plan/` — plan skill, design and tasks templates, checklist, review prompt, `scripts/validate-plan.sh`
- `plugins/factree/skills/build/` — build skill and the task subagent prompt
- `plugins/factree/paused/verify/` — verify, paused while it's redesigned: not a skill, so no `/factree:verify` and no step in the flow. Its files wait here; `scripts/verify-record.sh` stays
- `plugins/factree/skills/review/` — review skill (pull request, comments, loops)
- `plugins/factree/skills/spec-format/` — the spec format (loaded by Claude, not invoked)
- `plugins/factree/scripts/` — shared: `root.sh` (workspace lookup), `detect.sh` (stack and lenses), `event.sh` (activity log, tagged with the Claude Code session), `link.sh` (link to the running UI), `task-done.sh` (mark a built task done), `verify-record.sh` (scenario statuses from test results), `wait-decision.sh` (background wait for a companion decision), `decisions-since.sh` (companion decision lines, delivered once per session), `lessons.sh` (lessons the factory could learn), `wait-review.sh` (follow a pull request with `gh`), `repos.sh` (the workspace's repo list, and which repo holds a path), `plan-repos.sh` (each task's repo), `pr-plan.sh` (a plan's pull requests in merge order)
- `plugins/factree/lenses/` — `README.md` (lens contract), `backend.md`, `frontend.md`, `infra.md`
- `plugins/factree/shared/profile.md` — repo profile format and refresh rules
- `plugins/factree/scripts/session-hook.sh` — hook for SessionStart, UserPromptSubmit, Stop, Notification, SessionEnd; writes `<workspace>/sessions/<id>.json`
- `plugins/factree/scripts/ui.sh` + `skills/ui/` — start or stop the UI; `plugins/factree/ui/` is the BUILT UI (server.js + public/), committed so the plugin needs no install
- `apps/companion/` — UI source: React 19 + TypeScript + Vite in `src/`, zero-dependency Node server in `server/` (spec parser, workspace reader, JSON API, server-sent events), shared types in `shared/`, Vitest tests in `test/`
- `examples/.factree/` — the URL shortener the README and its recording show (`npm run demo`); nothing else reads it
- `tests/fixtures/workspace/` — the workspace the tests and `npm run dev` use: the link-report spec, plans (`002-link-report` split by vertical, `001-link-report` in the old layout) and event log
- `tests/run.sh` — all script tests; `tests/*-skill/cases.md` — manual skill test cases

## Conventions

- Scripts are bash plus POSIX awk only, so they run on macOS's BSD awk and Linux mawk/gawk. No jq, Python or Node. Don't use awk built-in names (RS, FS, NR…) as variables, and test array membership with `in` (a plain lookup creates the element).
- Every change under `plugins/factree/` bumps the version in `plugin.json` and the README badge together: patch for fixes, minor for new behaviour (CI checks it).
- Run `bash tests/run.sh` after changing any script. Rerun the relevant skill cases after changing a skill or lens.
- The example and the test fixture's spec and plans must validate with 0 errors and 0 warnings.
- New lenses follow the contract in `plugins/factree/lenses/README.md` exactly.
- The UI only reads the workspace (apart from `ui.json`), except decisions made through its decision endpoint: answers, spec and plan approvals, and change requests, recorded via `event.sh` as made by the user via the companion. Conversations stay in Claude Code, and the session hook passes companion decisions to Claude on the next prompt.
- The UI server must stay dependency-free (Node built-ins only); it is bundled into one file. After changing `apps/companion`, run `npm run typecheck && npm test && npm run build` and commit `plugins/factree/ui/`.
- Live state comes from events (`spec.step`, `question.asked`, `question.answered`, …) logged by the skills and from session files written by the hook. If a skill changes what it does, keep its event logging in step.
