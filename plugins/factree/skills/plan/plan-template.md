---
work: <NNN-slug>
spec: <spec-id>
spec_updated: <the spec's `updated` date when this plan was made>
scope: [R1, R2]
verticals: [backend, frontend]   # in build order of each vertical's first task
review_budget: 300          # max changed lines per task, tests included, excluding lockfiles and generated files
status: draft               # draft | design-approved | approved
design_approved_by:
design_approved_at:
approved_by:
approved_at:
branch:
created: <YYYY-MM-DD>
---
# Plan: <spec title>

## Context
<Which spec and requirements this implements, what exists today, and the spec decisions that constrain the design.>

## Verticals
- **<vertical>:** <what this vertical builds> ([design](<vertical>/design.md), [tasks](<vertical>/tasks.md); T1, T3)

## Order
Tasks are numbered in build order across the plan. Each slice is the tasks, across verticals, that together deliver one behaviour.

```mermaid
flowchart LR
  T1["T1 · <vertical><br/><title>"] --> T2["T2 · <vertical><br/><title>"]
```

1. **<behaviour> (R1):** T1 (<vertical>), T2 (<vertical>)

## Coverage

| Scenario | Task |
|---|---|
| <spec>#R1.S1 <name> | T1 (<vertical>) |

## Global constraints
<Values every task must respect, copied word for word from the spec, one per line; or "None.">

## Review focus
- <an input or failure mode the spec implies but no scenario tests>: <proposed as R<n>.S<n> under Spec updates | test `<name>` added to T<n>>
<or "None found.">

## Spec updates
<Decisions added to the spec and Code section changes, or "None.">
