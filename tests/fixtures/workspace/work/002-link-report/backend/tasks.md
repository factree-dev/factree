---
work: 002-link-report
vertical: backend
---
# Tasks: Link reports for teams (backend)

Each task is one reviewable change: it ends with tests passing, is one commit, and fits a single review of up to 300 changed lines. Task numbers run across the whole plan, in build order; coverage and order are in ../plan.md.

| Task | What | Proves | Depends on | Est. diff |
|---|---|---|---|---|
| T1 | One export at a time per admin | R6.S1, R6.S2 | — | ~140 |

---

### T1: One export at a time per admin

**Proves:** link-report#R6.S1, link-report#R6.S2
**Depends on:** none
**Est. diff:** ~140 lines (middleware 35, route 3, tests 100)

**Files**
- Create: `src/exports/limit.ts`
- Modify: `src/exports/routes.ts` (team export route)
- Create: `test/exports/export-limit.test.ts`

**Interfaces**
- Produces: `exportLimit(req, res, next): Promise<void>`; the 429 contract in backend/design.md

**Steps**
- [ ] 1. Write failing tests:
  ```ts
  it("refuses a second export while one runs [link-report#R6.S1]")   // hold the first stream open → second gets 429 {"error":"export_running"}
  it("allows an export after the first finishes [link-report#R6.S2]") // first completes → second gets 200
  ```
- [ ] 2. Run `npx vitest run test/exports/export-limit.test.ts`. Expect 1 failure (second request gets 200).
- [ ] 3. Implement `exportLimit` following `src/middleware/rate-limit.ts:12`; add it to the route before `exportTeamReport`.
- [ ] 4. Run the same command. Expect 2 passed.
- [ ] 5. Run `npm test`. Expect all passing.
- [ ] 6. Commit: `feat(exports): one export at a time per admin [link-report#R6]`
