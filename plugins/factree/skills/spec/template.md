---
id: <capability-id>
title: <Capability name>
status: draft
owner: <name>
sources:
  - <URL, ticket id, file path, or "conversation YYYY-MM-DD">
approved_by:
approved_at:
retired: []
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---
# <Capability name>

## Purpose
<One to three sentences: what this capability is for and who it serves.>

## Scope
**In:** <what this spec covers>
**Out:** <what it explicitly does not cover>
**Anti-goals:** <what would make this a failure even if it technically works>

## Observations
<!-- Only when the capability touches existing code. Delete this section otherwise. -->
- O1 <what the code does today> (`path/to/file.ts:LINE`)

## Requirements

### Requirement: R1 <Name>
The <subject> SHALL <one observable behaviour>.
Source: <item from sources, a section of it, or O<n>>

#### Scenario: S1 <Case name>
- **GIVEN** <specific starting state>
- **WHEN** <specific action or event>
- **THEN** <specific observable outcome>

#### Scenario: S2 <Failure or edge case name>
- **GIVEN** <specific starting state>
- **WHEN** <specific action or event>
- **THEN** <specific observable outcome>

<!-- Sketch: only when the user will look at the result (a page, a screen, a flow). Delete otherwise.
     For screens or states, a flow block: one line per step, "From -> To : action [R1.S1]" (spec-flow). -->
## Sketch
```
<what they will see>
```

## Code
<Entry points and key modules with paths, or "Not built yet.">

## Decisions
<!-- - D1 <what was decided>, because <why>. (<YYYY-MM-DD>, <who>) -->
None yet.

## Open questions
<!-- - Q1 <question>? Owner: <name>. Blocks: R<n>. -->
None yet.
