# Repo profile

A profile is a cached picture of how one project is built: its stack, its commands and its patterns, each with file references. Skills build it once and reuse it, so every run sees the repo the same way and recon isn't repeated from scratch.

## Where

`<workspace>/profiles/<project>.md`, where `<workspace>` is the folder printed by `scripts/root.sh` and `<project>` is the project's directory name (the repo name, or `<repo>-<package>` for a package inside a monorepo).

## When to build or refresh

- **Missing:** build it before designing anything.
- **Older than 30 days**, or the project's manifests changed since `updated`: refresh it.
- **The user asks**, or a cited file no longer exists: refresh the affected entries.
- Before relying on an entry, check its cited file still exists. If it doesn't, fix that entry.

The user may edit the profile by hand. Keep their edits when refreshing, and mark entries they added with `(by <name>)` so they aren't overwritten.

## How to build it

1. Run `scripts/detect.sh` on the project and copy its stack and commands.
2. For each loaded lens, go through **Patterns to inventory**. For each area, find two or three real examples by reading the code. Record what the pattern is and where it's used. Skip areas the project doesn't have and say so.
3. Note scale signals the lens cares about: large tables, existing indexes, pagination, virtualisation, perf tests, bundle budgets.
4. Note conventions from `CLAUDE.md` files and any architecture docs or ADRs.

## Format

```markdown
---
project: api
path: api                      # relative to the workspace's parent folder
lenses: [backend]
updated: 2026-11-15
---
# api

## Stack
Express 4, Knex, PostgreSQL, Vitest, Supertest

## Commands
- test: `npm test`
- perf: `npm run test:perf`

## Patterns
- **Auth:** `requireTeamAdmin` middleware for team-scoped routes (`src/teams/routes.ts:22`, `src/exports/routes.ts:18`)
- **Streaming responses:** cursor + csv-stringify + pipeline (`src/reports/audit-export.ts:40`)
- **Feature flags:** registered in `src/flags.ts`, checked with `isEnabled()` in routes (`src/flags.ts:31`)
- **Background work:** none; long work runs inline in requests

## Scale signals
- `links` ~12M rows (`docs/ops/table-sizes.md`); index on (team_id, deleted_at)

## Conventions
- Migrations are additive only; destructive changes go in a follow-up release (root `CLAUDE.md`)
```
