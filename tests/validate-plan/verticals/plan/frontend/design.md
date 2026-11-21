---
work: 007-widget-export
vertical: frontend
---
# Design: Widget export (frontend)

## Patterns

### Reused
- **P2 Tests:** route tests as in `test/routes.test.ts:10`. Fits because the scenarios are request-level.

### New
None.

## Approach
Fixture.

## Load and scale
Not applicable.

## Components

| Component | Change | Responsibility | Serves |
|---|---|---|---|
| `src/frontend/widgets.ts` | New | Fixture | R1, R2 |

## Interfaces
Not applicable.

## Data
Not applicable.

## Flows
Not applicable.

## Error handling
Not applicable.

## Test strategy
Not applicable.

## Risks and rollout
None.
