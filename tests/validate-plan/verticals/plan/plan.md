---
work: 007-widget-export
spec: widget-export
spec_updated: 2026-11-16
scope: [R1, R2]
verticals: [backend, frontend]
review_budget: 300
status: approved
design_approved_by: Test
design_approved_at: 2026-11-16
approved_by: Test
approved_at: 2026-11-16
branch:
created: 2026-11-16
---
# Plan: Widget export

## Context
Fixture plan with two verticals.

## Verticals
- **backend:** export endpoint (T1, T3)
- **frontend:** export button (T2)

## Order
1. Slice R2 basics: T1 (backend)
2. Slice R1: T2 (frontend), after T1
3. Slice R2.S3: T3 (backend), after T2

## Coverage

| Scenario | Task |
|---|---|
| widget-export#R1.S1 Admin sees the button | T1 (backend), T2 (frontend) |
| widget-export#R2.S1 Two widgets | T1 (backend) |
| widget-export#R2.S2 No widgets | T2 (frontend) |
| widget-export#R2.S3 Export already running | T3 (backend) |

## Spec updates
None.
