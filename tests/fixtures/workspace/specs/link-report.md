---
id: link-report
title: Link reports for teams
status: approved
owner: priya
sources:
  - JIRA-482
  - JIRA-517
  - https://example.atlassian.net/wiki/spaces/PROD/pages/123/Link+exports
approved_by: John Doe
approved_at: 2026-11-15
retired: []
created: 2026-11-15
updated: 2026-11-16
---
# Link reports for teams

## Purpose
Team admins load link data into their own BI tools without asking support for a data dump.

## Scope
**In:** On-demand report export of one team's links by a team admin.
**Out:** Scheduled or emailed exports, formats other than report, exports across several teams.
**Anti-goals:** an export that silently drops or duplicates rows; an export a non-admin can start.

## Observations
- O1 Single-link export already exists at `GET /links/:id/export`, admin-only (`src/exports/routes.ts:18`)
- O2 Deleted links are kept, marked with `deleted_at`; list queries filter them through `Link.active()` (`src/models/link.ts:44`)
- O3 Admin checks use the `requireTeamAdmin` middleware, which returns 403 with an empty body (`src/auth/middleware.ts:61`)

## Requirements

### Requirement: R1 Admin-only access
The export service SHALL refuse team export requests from users who are not admins of that team.
Source: JIRA-482, O3

#### Scenario: S1 Member without admin role
- **GIVEN** a signed-in member of team G without the admin role
- **WHEN** they request an export of team G
- **THEN** the response is 403
- **AND** no file is produced

#### Scenario: S2 Admin of a different team
- **GIVEN** a signed-in admin of team H who is not an admin of team G
- **WHEN** they request an export of team G
- **THEN** the response is 403

### Requirement: R2 Export contents
The export service SHALL include exactly one row per active link in the selected team.
Source: JIRA-482

#### Scenario: S1 Mixed team
- **GIVEN** team G has 2 active links and 1 deleted link
- **WHEN** an admin of G exports the team
- **THEN** the report has a header row and 2 data rows

#### Scenario: S2 Empty team
- **GIVEN** team G has no links
- **WHEN** an admin of G exports the team
- **THEN** the report has only the header row
- **AND** the response is 200

#### Scenario: S3 Link deleted during export
- **GIVEN** team G has 3 active links
- **WHEN** one is deleted after the export has started
- **THEN** the report contains either 2 or 3 data rows, never a partial row

### Requirement: R3 Columns
The export service SHALL output these columns in this order: owner name, owner email, short code, created date, expiry date.
Source: JIRA-482

#### Scenario: S1 Header row
- **GIVEN** any team with at least one active link
- **WHEN** an admin exports the team
- **THEN** the header row is `owner_name,owner_email,short_code,created_on,expires_on`

#### Scenario: S2 Link with no expiry
- **GIVEN** a link created on 2026-03-01 with no expiry date
- **WHEN** an admin exports its team
- **THEN** its row has `2026-03-01` for created_on and an empty expires_on cell

#### Scenario: S3 Values containing commas
- **GIVEN** a owner named `Smith, Jane`
- **WHEN** an admin exports the team
- **THEN** the name is quoted as `"Smith, Jane"` and the row still has 5 columns

### Requirement: R4 Team size
The export service SHALL begin sending the file within 2 seconds for teams of up to 100,000 active links.
Source: https://example.atlassian.net/wiki/spaces/PROD/pages/123/Link+exports

#### Scenario: S1 Largest supported team
- **GIVEN** team G has 100,000 active links
- **WHEN** an admin of G exports the team
- **THEN** the first byte arrives within 2 seconds
- **AND** the file contains 100,000 data rows

### Requirement: R5 Export button
The team page SHALL show team admins an "Download report" button that downloads the team export, or says "An export is already running. Try again when it finishes." when the export service refuses one.
Source: JIRA-517

#### Scenario: S1 Admin downloads
- **GIVEN** an admin of team G on G's page
- **WHEN** they click "Download report"
- **THEN** the browser downloads the team export

#### Scenario: S2 Export already running
- **GIVEN** an admin of G whose previous export of G is still running
- **WHEN** they click "Download report"
- **THEN** the page says "An export is already running. Try again when it finishes."
- **AND** nothing is downloaded

### Requirement: R6 One export at a time
The export service SHALL refuse a team export with status 429 while the same admin already has an export running.
Source: JIRA-517

#### Scenario: S1 Second export while the first runs
- **GIVEN** an admin whose export of team G started 3 seconds ago and is still sending
- **WHEN** they request another export of any team
- **THEN** the response is 429 and no file is sent

#### Scenario: S2 Export after the first finishes
- **GIVEN** an admin whose last export finished 1 second ago
- **WHEN** they request an export of G
- **THEN** the export starts as usual

## Code
Planned in work 001-link-report, not built yet:
- Route: `GET /teams/:teamId/link-report` in `src/exports/routes.ts`
- Handler: `exportTeamReport()` in `src/exports/team-report.ts`
- Row mapping: `toReportRow()` in `src/exports/link-row.ts`
Planned in work 002-link-report, not built yet:
- Export limit: `exportLimit` middleware in `src/exports/limit.ts`
- Button: `ExportButton` in `web/src/teams/ExportButton.tsx`

## Decisions
- D1 Exclude deleted links, because the export feeds BI dashboards of current holders. Resolves Q1. (2026-11-15, Priya)
- D2 Dates are ISO 8601 (YYYY-MM-DD) in UTC, because every BI tool admins mentioned parses that format. (2026-11-15, Claude, delegated by John Doe)
- D3 Stream rows rather than building the file in memory, because teams reach 100,000 links. (2026-11-15, John Doe)
- D4 Read each export inside a repeatable-read snapshot, because R2.S3 requires a consistent file even if links are deleted mid-export. (2026-11-15, John Doe)

## Open questions
- Q2 Should exports leave out fields the admin cannot see under field-level permissions? Owner: Priya.
