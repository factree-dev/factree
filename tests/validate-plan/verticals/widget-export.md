---
id: widget-export
title: Widget export
status: approved
owner: test
sources:
  - fixture
approved_by: Test
approved_at: 2026-11-16
retired: []
created: 2026-11-16
updated: 2026-11-16
---
# Widget export

## Purpose
Fixture spec for validating plans split by vertical.

## Scope
**In:** exporting widgets. **Out:** everything else.

## Requirements

### Requirement: R1 Export button
The widget page SHALL offer an export button to admins.

#### Scenario: S1 Admin sees the button
- **GIVEN** an admin
- **WHEN** an admin opens the widget page
- **THEN** the export button is shown

### Requirement: R2 Export file
The export service SHALL return one report row per widget.

#### Scenario: S1 Two widgets
- **GIVEN** 2 widgets
- **WHEN** an admin exports
- **THEN** the file has 2 data rows

#### Scenario: S2 No widgets
- **GIVEN** no widgets
- **WHEN** an admin exports
- **THEN** the file has only the header row

#### Scenario: S3 Export already running
- **GIVEN** an export by the same admin is running
- **WHEN** the admin starts another
- **THEN** the second is refused

## Code
Not built yet.

## Decisions
None yet.

## Open questions
None yet.
