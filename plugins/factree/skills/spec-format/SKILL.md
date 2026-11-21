---
name: spec-format
description: The Factree spec file format. Use whenever reading, writing or editing files in .factree/specs/, citing requirement or scenario IDs in tests or commits, or answering questions about what a Factree spec contains.
user-invocable: false
---

# Factree spec format

A spec is where a requirement meets the code. It states how one capability behaves, in a form someone who has never seen the code could check, and records where that behaviour lives, why it is built that way, and what is still unknown.

The requirement that prompted it (a ticket, a Confluence page, a list in chat) stays where it lives. The spec links to it.

## Where specs live

Everything lives in one **workspace** folder, found by the plugin's `scripts/root.sh`: `$FACTREE_HOME` if set (a central place), else the nearest `.factree/` in the current folder or any parent (so one workspace can serve several repos beneath it), else `<repo root>/.factree`.

```
.factree/                   # the workspace; excluded from git via .git/info/exclude when inside a repo
  specs/<capability>.md     # one file per capability
  work/<NNN-slug>/          # plans: design.md and tasks.md (/factree:plan)
  profiles/<project>.md     # cached picture of how each project is built
  lenses/                   # optional overrides of the plugin's built-in lenses
  events.jsonl              # append-only activity log, written by scripts/event.sh
  sessions/<id>.json        # live state of each Claude Code session, written by the plugin's hooks
  ui.json                   # where the Factree UI is running, if it is
```

When a workspace serves several repos, every path in a spec starts with the repo folder (`api/src/exports/routes.ts`).

A **capability** is a coherent behaviour a user or caller would name: "report export", "link revocation", "SSO sign-in". Not a page, an endpoint or a file. If a spec grows past about 10 requirements, it is probably two capabilities.

The file name is the capability id in kebab-case: `link-report.md`.

## File structure

Sections appear in this order. `Observations` and `Sketch` are optional; every other section is required, even if it only says "None yet."

```markdown
---
id: link-report                      # must match the file name
title: Link reports for teams
status: draft                       # draft | approved | live
owner: john
sources:                            # where the requirements came from
  - https://example.atlassian.net/wiki/spaces/PROD/pages/123
  - JIRA-482
approved_by:                        # set on approval
approved_at:
retired: []                         # IDs that were removed and must never be reused
created: 2026-11-15
updated: 2026-11-15
---
# Link reports for teams

## Purpose
## Scope
## Observations
## Requirements
## Sketch
## Code
## Decisions
## Open questions
```

### Purpose
One to three sentences: what the capability is for and who it serves. This is the lasting reason, not the latest ticket.

### Scope
Three lines, `**In:**`, `**Out:**` and `**Anti-goals:**`. Out-of-scope items are as important as in-scope ones. Anti-goals say what would make the work a failure even if it technically works ("an export that silently drops rows"); the validator warns when they're missing.

### Observations
What the code does **today** in the area this spec covers, found by reading it. Use this when a spec is written for code that already exists. Each line has an ID and a file reference:

```markdown
- O1 Exports already exist for single links only, via `GET /links/:id/export` (`src/exports/routes.ts:18`)
- O2 Deleted links are kept, marked with `deleted_at`; most queries filter them with `active()` (`src/models/link.ts:44`)
```

Observations are facts, not intentions. If observed behaviour must be kept and matters, promote it to a requirement with `Source: O2`.

### Requirements
OpenSpec's format, with IDs in the names:

```markdown
### Requirement: R2 Export contents
The export service SHALL include one row per active link in the selected team.
Source: JIRA-482
Blocked by: Q2

#### Scenario: S1 Mixed team
- **GIVEN** a team with 2 active and 1 deleted link
- **WHEN** an admin exports the team
- **THEN** the report has a header row and 2 data rows

#### Scenario: S2 Empty team
- **GIVEN** a team with no links
- **WHEN** an admin exports the team
- **THEN** the report has only the header row
- **AND** the download still succeeds
```

Rules:
- The heading is `### Requirement: R<n> <Name>`. The first line under it is the requirement statement, one behaviour, containing SHALL or MUST (SHOULD or MAY only when genuinely optional).
- `Source:` (optional) points to the requirement's origin: an item in `sources`, a section of it, or an observation (`O2`). `Blocked by:` (optional) lists open questions that must be answered before this requirement can be built.
- Every requirement has at least one scenario. Scenarios cover failure and edge cases, not only the happy path.
- The heading is `#### Scenario: S<n> <Name>`, where the name says which case it covers. Steps are bullets starting `**GIVEN**`, `**WHEN**`, `**THEN**`, with `**AND**` for extra steps. WHEN and THEN are required; GIVEN is required unless there is genuinely no precondition.
- No implementation detail in requirements or scenarios: no table names, libraries or function names. Those go in Code or Decisions.

### Sketch
Optional. For anything the user will look at (a page, a screen, a layout, a flow of steps): a text sketch of it in one fenced code block, exactly as it should read. The companion shows it on a Sketch tab. Leave the section out when there's nothing to look at.

```
Team: Finance admins          [ Download report ]
─────────────────────────────────────────────
Name          Email               Expires
```


**A flow** (spec-flow): when the spec has screens or states, or otherwise warrants one, the Sketch is a `flow` block instead: one line per step, the first line starting the main path, each naming in brackets the scenarios that prove it. A line with no scenario is a gap. The validator reports a line without `->` and any cited scenario the spec doesn't have. The companion draws it in a Flow tab.

```flow
Team page -> Exporting : export [R2.S1, R2.S2]
Exporting -> File : rows [R2.S1]
Exporting -> File : no rows [R2.S2]
Exporting -> Busy : export again [R4.S1]
File -> Team page : back
```

### Code
Where the behaviour lives, kept short enough to scan: entry points, key modules, important interfaces, with paths. Write "Not built yet." for new capabilities. Update it when code moves.

### Decisions
```markdown
- D1 Stream rows from a database cursor, because teams reach 100k links. (2026-11-15, John Doe)
- D2 Exclude deleted links, because the export feeds BI of current holders. Resolves Q1. (2026-11-15, Priya)
- D3 ~~Generate exports synchronously~~ Superseded by D4. (2026-11-12, John Doe)
```
- Each decision says what was decided, **because** why, and who decided it and when.
- A decision is recorded only when a person made it. Claude may propose; a proposal goes in Open questions until someone agrees.
- Decisions are never deleted. A replaced decision is struck through and marked `Superseded by D<n>`.

### Open questions
```markdown
- Q2 Should exports respect field-level permissions? Owner: Priya. Blocks: R5.
- Q3 Do we need an audit log entry per export? Owner: John Doe.
```
- Each question has an owner. `Blocks:` lists the requirements it blocks, mirrored by `Blocked by:` on those requirements.
- When answered, the question is **deleted** and the answer becomes a decision (`Resolves Q<n>`), a requirement change, or both. The list only ever holds what is genuinely open.

## IDs

| Prefix | Scope | Example reference |
|---|---|---|
| `R<n>` | Requirement, unique in the spec | `link-report#R2` |
| `S<n>` | Scenario, unique within its requirement | `link-report#R2.S1` |
| `O<n>` | Observation | `link-report#O2` |
| `D<n>` | Decision | `link-report#D1` |
| `Q<n>` | Open question | `link-report#Q2` |

- IDs are never renumbered or reused. Removing a requirement deletes it and adds its ID to `retired` in the front matter. New items take the next unused number.
- Tests cite the scenario they prove in their name or description: `it("excludes deleted links [link-report#R2.S1]")`.

## Status

| Status | Meaning | Set by |
|---|---|---|
| `draft` | Being written or changed | `/factree:spec` |
| `approved` | A person agreed this is what to build | `/factree:spec`, on explicit approval |
| `live` | Built and merged | Later build/ship steps |

Changing an `approved` or `live` spec's Purpose, Scope or Requirements moves it back to `draft` until it is approved again. Adding decisions, resolving or adding open questions that block nothing, and updating Code or Observations don't change behaviour, so the status stays. Update `updated` on every edit.

## Editing an existing spec

- Change behaviour by editing the requirement in place and adjusting its scenarios. Keep its ID.
- Adding a case to existing behaviour means adding a scenario, not a requirement.
- A bug that revealed an uncovered case adds a scenario for that case.
- Never delete a decision; supersede it.
- After editing, say what changed by ID: added R6, changed R2 (new scenario S3), retired R4, resolved Q1 as D5.

## Events

Every meaningful change is appended to `events.jsonl` in the workspace by the plugin's `scripts/event.sh`, so progress can be tracked and shown later without anyone updating status by hand. Spec types: `spec.created`, `spec.updated`, `spec.approved`, `spec.step` (progress while a spec is being written), `question.asked` and `question.answered` (questions in the conversation), `question.opened` and `question.resolved` (Open questions in the file), `decision.recorded`. Plan types: `plan.created`, `plan.design_approved`, `plan.approved`.
