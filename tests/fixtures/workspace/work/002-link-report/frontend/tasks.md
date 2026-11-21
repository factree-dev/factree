---
work: 002-link-report
vertical: frontend
---
# Tasks: Link reports for teams (frontend)

Each task is one reviewable change: it ends with tests passing, is one commit, and fits a single review of up to 300 changed lines. Task numbers run across the whole plan, in build order; coverage and order are in ../plan.md.

| Task | What | Proves | Depends on | Est. diff |
|---|---|---|---|---|
| T2 | Download report button with the "already running" message | R5.S1, R5.S2 | T1 | ~180 |

---

### T2: Download report button

**Proves:** link-report#R5.S1, link-report#R5.S2
**Depends on:** T1 (the 429 contract)
**Est. diff:** ~180 lines (component 60, header 5, tests 115)

**Files**
- Create: `web/src/teams/ExportButton.tsx`
- Modify: `web/src/teams/TeamHeader.tsx` (admin actions)
- Create: `web/src/teams/ExportButton.test.tsx`

**Interfaces**
- Consumes: the 429 `{"error":"export_running"}` response from T1 (backend/design.md)
- Produces: `<ExportButton teamId={string} />`

**Steps**
- [ ] 1. Write failing tests:
  ```tsx
  it("downloads the export [link-report#R5.S1]")             // fetch 200 → saveBlob called with team-<id>-link-report
  it("says an export is already running [link-report#R5.S2]") // fetch 429 → role=status text matches R5, saveBlob not called
  ```
- [ ] 2. Run `npx vitest run web/src/teams/ExportButton.test.tsx`. Expect 2 failures (module not found).
- [ ] 3. Implement `ExportButton` with `useDownload` (`web/src/hooks/useDownload.ts:8`) and `InlineAlert`, following `web/src/reports/AuditExportButton.tsx`. Render it in `TeamHeader` for admins.
- [ ] 4. Run the same command. Expect 2 passed.
- [ ] 5. Run `npm test`. Expect all passing.
- [ ] 6. Commit: `feat(teams): Download report button [link-report#R5]`
