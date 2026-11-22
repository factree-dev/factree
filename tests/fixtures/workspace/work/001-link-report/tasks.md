---
work: 001-link-report
spec: link-report
design: design.md
scope: [R1, R2, R3, R4]
review_budget: 300          # max changed lines per task, excluding lockfiles and snapshots
status: approved
approved_by: John Doe
approved_at: 2026-11-15
branch:
created: 2026-11-15
---
# Tasks: Link reports for teams

Each task is one reviewable change: it ends with tests passing, is one commit, and fits a single review of up to 300 changed lines. Tasks build the feature in vertical slices, so the endpoint works from T1 onwards.

| Task | What | Proves | Depends on | Est. diff |
|---|---|---|---|---|
| T1 | Endpoint, admin guard and flag, header-only report | R1.S1, R1.S2, R2.S2 | — | ~130 |
| T2 | Active link rows with spec columns | R2.S1, R3.S1, R3.S2, R3.S3 | T1 | ~190 |
| T3 | Consistent snapshot and disconnect handling | R2.S3 | T2 | ~110 |
| T4 | Performance check at 100k rows | R4.S1 | T2 | ~120 |

T3 and T4 both depend only on T2, so they can be done in parallel.

## Coverage

| Scenario | Task |
|---|---|
| link-report#R1.S1 Member without admin role | T1 |
| link-report#R1.S2 Admin of a different team | T1 |
| link-report#R2.S1 Mixed team | T2 |
| link-report#R2.S2 Empty team | T1 |
| link-report#R2.S3 Link deleted during export | T3 |
| link-report#R3.S1 Header row | T2 |
| link-report#R3.S2 Link with no expiry | T2 |
| link-report#R3.S3 Values containing commas | T2 |
| link-report#R4.S1 Largest supported team | T4 |

---

### T1: Endpoint, admin guard and flag

**Proves:** link-report#R1.S1, link-report#R1.S2, link-report#R2.S2
**Depends on:** none
**Est. diff:** ~130 lines (route 10, handler 35, flag 5, tests 80)

**Files**
- Modify: `src/exports/routes.ts` (register route after line 18)
- Modify: `src/flags.ts` (add `team_link_report`, default off)
- Create: `src/exports/team-report.ts`
- Create: `test/exports/team-report.test.ts`

**Interfaces**
- Produces: `exportTeamReport(req, res): Promise<void>`; for now writes only the header row
- Produces: `report_COLUMNS` constant (in `src/exports/link-row.ts`, created here with just the constant)

**Steps**
- [ ] 1. Write failing tests in `test/exports/team-report.test.ts`, with the flag enabled in `beforeEach`:
  ```ts
  it("refuses members without admin role [link-report#R1.S1]")      // member of G → 403, empty body
  it("refuses admins of another team [link-report#R1.S2]")        // admin of H, requests G → 403
  it("returns only the header for an empty team [link-report#R2.S2]") // admin of empty G → 200,
      // body === "owner_name,owner_email,short_code,created_on,expires_on\n"
  ```
- [ ] 2. Run `npx vitest run test/exports/team-report.test.ts`. Expect 3 failures (404, route not found).
- [ ] 3. Add `report_COLUMNS` to `src/exports/link-row.ts`. Implement `exportTeamReport` to set `Content-Type: text/report` and `Content-Disposition: attachment; filename="team-<id>-link-report"`, then write the header. Register `GET /teams/:teamId/link-report` with `requireTeamAdmin` and the flag check, following the team settings route at `src/teams/routes.ts:22`.
- [ ] 4. Run the same command. Expect 3 passed.
- [ ] 5. Run `npm test`. Expect all passing.
- [ ] 6. Commit: `feat(exports): team report endpoint behind admin guard and flag [link-report#R1]`

---

### T2: Active link rows with spec columns

**Proves:** link-report#R2.S1, link-report#R3.S1, link-report#R3.S2, link-report#R3.S3
**Depends on:** T1 (the report route it extends)
**Est. diff:** ~190 lines (row mapper 30, streaming 45, tests 115)

**Files**
- Modify: `src/exports/link-row.ts`
- Modify: `src/exports/team-report.ts`
- Create: `test/exports/link-row.test.ts`
- Modify: `test/exports/team-report.test.ts`

**Interfaces**
- Consumes: `report_COLUMNS`, `exportTeamReport` from T1
- Produces: `toReportRow(c: LinkWithOwner): Record<Column, string>`

**Steps**
- [ ] 1. Write failing unit tests in `test/exports/link-row.test.ts`:
  ```ts
  it("maps columns in spec order [link-report#R3.S1]")       // keys equal report_COLUMNS
  it("formats created date, blank expiry [link-report#R3.S2]") // created 2026-03-01, no expiry
      // → created_on "2026-03-01", expires_on ""
  ```
  and a failing route test in `team-report.test.ts`:
  ```ts
  it("exports one row per active link [link-report#R2.S1]") // 2 active + 1 deleted → 3 lines
  it("quotes values containing commas [link-report#R3.S3]")      // name "Smith, Jane"
      // → line contains "\"Smith, Jane\"" and parses to 5 fields
  ```
- [ ] 2. Run `npx vitest run test/exports`. Expect 4 new failures.
- [ ] 3. Implement `toReportRow` (dates as `YYYY-MM-DD` in UTC, per spec D2). In `exportTeamReport`, stream `Link.active().forTeam(teamId)` from a cursor in batches of 1,000 through `csv-stringify` with `pipeline()`, following `src/reports/audit-export.ts:40-78`.
- [ ] 4. Run `npx vitest run test/exports`. Expect all passing.
- [ ] 5. Run `npm test`. Expect all passing.
- [ ] 6. Commit: `feat(exports): stream active links as report rows [link-report#R2 #R3]`

---

### T3: Consistent snapshot and disconnect handling

**Proves:** link-report#R2.S3
**Depends on:** T2 (the row mapper it reuses)
**Est. diff:** ~110 lines (handler 30, tests 80)

**Files**
- Modify: `src/exports/team-report.ts`
- Modify: `test/exports/team-report.test.ts`

**Interfaces**
- Consumes: `exportTeamReport` from T2
- Produces: no new interfaces

**Steps**
- [ ] 1. Write failing tests:
  ```ts
  it("ignores revocations after the export starts [link-report#R2.S3]")
      // 3 active; delete one after the first batch (test hook onBatch) → 3 data rows, all complete
  it("releases the cursor when the client disconnects")
      // abort request mid-stream → cursor destroyed, transaction rolled back (spy on knex trx)
  ```
- [ ] 2. Run `npx vitest run test/exports/team-report.test.ts`. Expect 2 failures.
- [ ] 3. Wrap the stream in `db.transaction({ isolationLevel: "repeatable read", readOnly: true })`. On `pipeline()` rejection, destroy the cursor and roll back. If the error happens after headers are sent, destroy the socket rather than ending the response normally.
- [ ] 4. Run the same command. Expect all passing.
- [ ] 5. Run `npm test`. Expect all passing.
- [ ] 6. Commit: `feat(exports): consistent snapshot for team report exports [link-report#R2.S3]`

---

### T4: Performance check at 100k rows

**Proves:** link-report#R4.S1
**Depends on:** T2 (the row mapper it reuses)
**Est. diff:** ~120 lines (perf test 90, seed helper 30)

**Files**
- Create: `test/perf/team-report.perf.ts`
- Modify: `test/perf/helpers/seed.ts` (add `seedLinks(teamId, n)`, batch inserts of 5,000)

**Interfaces**
- Consumes: the endpoint from T2

**Steps**
- [ ] 1. Write the test, following `test/perf/audit-export.perf.ts`:
  ```ts
  it("starts within 2s and exports 100k rows [link-report#R4.S1]")
      // seed 100,000 active links; time to first byte < 2000 ms; 100,001 lines total
  ```
- [ ] 2. Run `npm run test:perf -- team-report`. Expect it to pass if T2 streams correctly. If time to first byte exceeds 2s, stop and report the measurement rather than tuning blindly.
- [ ] 3. Record the measured time to first byte and total duration in the commit message.
- [ ] 4. Commit: `test(perf): team report export at 100k rows [link-report#R4.S1]`
