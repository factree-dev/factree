# Spec checklist

## Part 1: Gaps to look for (step 6)

Go through each area and ask whether the requirement, the code or an existing spec answers it. Note a gap only if the answer would change what gets built or how it's tested. Skip areas that don't apply.

**Who and why**
- Who uses this, and are there different roles with different rights?
- Why do they want it? What does success look like to them?
- What is explicitly out of scope?

**Inputs and data**
- What exactly goes in and comes out? Formats, fields, order, units, time zones, encodings.
- What entities are involved, and which states can they be in (active, expired, deleted, pending)? Which states are included?
- How much data, at the realistic maximum? What happens at the limit and just past it?

**Permissions and privacy**
- Who may do this, and what happens when someone who may not tries?
- Does it expose data a user couldn't otherwise see? Personal data, other tenants' data, restricted fields?
- Does it need an audit trail?

**States and flow**
- What does the user see while it's happening, when it succeeds, when it's empty?
- Can it be started twice? What happens on the second click, or two people at once?
- Can it be cancelled or undone?

**Failure**
- What happens when input is invalid, missing or malformed?
- What happens when something it depends on is slow, down or returns an error?
- What happens when the underlying data changes midway?

**Integration**
- Does it call or get called by other services, APIs or jobs? What's the contract?
- Does it change any existing behaviour that something else relies on?

**Operations**
- Performance targets that matter to a user: latency, throughput, time to first result.
- Limits: rate limits, size limits, retention.
- Does anyone need to be notified, and how?

**Words to quantify**
- Any of: fast, quick, large, small, many, few, scalable, robust, secure, simple, intuitive, user-friendly, gracefully, appropriate, reasonable, etc., soon, real-time, minimal.

## Part 2: Quality checks before showing the spec (step 10)

**Requirements**
- [ ] Each requirement is one behaviour with one SHALL or MUST. No "and also".
- [ ] Each requirement is observable from outside the code.
- [ ] No implementation detail (tables, libraries, function names) in any requirement or scenario.
- [ ] No unquantified adjectives from the list above.
- [ ] Each requirement has a `Source:`, or is clearly a technical necessity.

**Scenarios**
- [ ] Every requirement has at least one scenario.
- [ ] Scenarios use specific values, not "some" or "valid input".
- [ ] Failure and edge cases are covered, not just the happy path: empty, limit, permission denied, dependency failure, concurrent action where relevant.
- [ ] Each scenario name says which case it covers.
- [ ] The case the user would be most upset to see broken has a scenario.

**Coverage**
- [ ] Every item in the source is covered by a requirement, listed under Scope → Out, or raised as an open question.
- [ ] Nothing in the spec lacks a basis in the source, the code or the conversation.

**What the user will see and what must not happen**
- [ ] Scope has an Anti-goals line, in the user's words or listed as your call.
- [ ] Anything the user will look at has a Sketch section, and the summary showed it.
- [ ] A standard spec was played back part by part before it was written.

**Decisions and questions**
- [ ] Every decision says what, because why, who and when, and a person made it.
- [ ] Every open question has an owner. Blocking questions are mirrored by `Blocked by:` on the requirements.
- [ ] No answered question is still listed.

**Edits to an existing spec**
- [ ] No existing ID was renumbered or reused. Removed IDs are in `retired`.
- [ ] Superseded decisions are struck through, not deleted.
- [ ] Only what this requirement touches has changed.
- [ ] `status` is `draft` and `updated` is today.
