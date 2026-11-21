---
id: demo
title: Demo
status: approved
owner: test
sources:
  - fixture
approved_by: Test
approved_at: 2026-11-01
retired: []
created: 2026-11-01
updated: 2026-11-01
---
# Demo

## Purpose
Fixture for verify-record.sh.

## Scope
**In:** everything. **Out:** nothing.

## Requirements

### Requirement: R1 Tested
The demo SHALL be tested.

#### Scenario: S1 Passing test
- **WHEN** it runs
- **THEN** it passes

#### Scenario: S2 One failure among passes
- **WHEN** it runs
- **THEN** one of two tests fails

### Requirement: R2 Untested
The demo SHALL have untested parts.

#### Scenario: S1 No test at all
- **WHEN** nothing cites it
- **THEN** it is unverified

#### Scenario: S2 Manual case not run
- **WHEN** its case ran only before the build
- **THEN** it is unverified

#### Scenario: S3 Manual case run and passed
- **WHEN** its case passed after the build
- **THEN** it is proved

## Code
None.

## Decisions
None yet.

## Open questions
None yet.
