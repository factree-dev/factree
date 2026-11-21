---
work: 002-link-report
vertical: frontend
---
# Design: Link reports for teams (frontend)

## Patterns

### Reused
- **P3 File downloads:** the `useDownload` hook fetches with the session, saves the blob and exposes the error status (`web/src/hooks/useDownload.ts:8`, used by `web/src/reports/AuditExportButton.tsx:14`). Fits R5.S1, and it gives the 429 status R5.S2 needs.
- **P4 Inline messages:** `InlineAlert` beside the control that caused it (`web/src/ui/InlineAlert.tsx:5`, used on `web/src/teams/TeamSettings.tsx:40`). Fits R5.S2's message.
- **P5 Component tests:** Testing Library with mocked fetch, as in `web/src/reports/AuditExportButton.test.tsx`. Fits because R5 is component behaviour.

### New
None.

## Approach
Add an `ExportButton` to the team page header, visible to team admins. It downloads with `useDownload`. On a 429 it shows the R5 message in an `InlineAlert`.

**Alternatives considered**
- **Disable the button while an export runs.** Rejected: the running export may have started in another tab, so the page can't know. The server's 429 is the source of truth.

## Load and scale
Not applicable.

## Components

| Component | Change | Responsibility | Serves |
|---|---|---|---|
| `web/src/teams/ExportButton.tsx` | New | Button, download, 429 message | R5 |
| `web/src/teams/TeamHeader.tsx` | Modify | Render `ExportButton` for admins | R5 |

## Interfaces
`<ExportButton teamId={string} />`.

### API contract consumed
`GET /teams/:teamId/link-report`, including its 429 response: defined in [backend/design.md](../backend/design.md#api-contract), not repeated here.

## Data
Not applicable.

## Flows
Click → `useDownload` → 200 saves the file; 429 shows the message.

## Error handling

| Scenario | Handling |
|---|---|
| R5.S2 Export already running | `InlineAlert` "An export is already running. Try again when it finishes."; no download |
| Any other error | Existing `useDownload` error toast |

## Test strategy

| Scenario | Test type | File |
|---|---|---|
| R5.S1, R5.S2 | Component test, fetch mocked with 200 and 429 | `web/src/teams/ExportButton.test.tsx` |

## Component tree
`TeamHeader` → `ExportButton` → `InlineAlert` (only on 429).

## UI states

| Scenario | Loading | Error | Success |
|---|---|---|---|
| R5.S1 | Button shows a spinner and is disabled | Toast | File saved |
| R5.S2 | Same | Inline message | — |

## Accessibility
The button is a real `<button>`; the inline message is `role="status"`, so screen readers announce it.

## Risks and rollout
Rendered only when the `team_link_report` flag is on, matching the endpoint.
