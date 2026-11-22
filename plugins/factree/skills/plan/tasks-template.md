---
work: <NNN-slug>
vertical: <vertical>
---
# Tasks: <spec title> (<vertical>)

Each task is one reviewable change: it ends with tests passing, is one commit, and fits a single review of up to <budget> changed lines. Task numbers run across the whole plan, in build order; coverage and order are in ../plan.md.

| Task | What | Proves | Depends on | Est. diff |
|---|---|---|---|---|
| T1 | <title> | R1.S1, R1.S2 | — | ~<n> |

---

### T1: <title>

**Proves:** <spec>#R1.S1, <spec>#R1.S2
**Depends on:** none  <!-- or: T1 (<why: the interface or lines it needs>), T2 (<why>) -->
**Est. diff:** ~<n> lines (<breakdown>)

**Files**
- Create: `<path>`
- Modify: `<path>` (<where>)

**Interfaces**
- Consumes: <from earlier tasks, with signatures>
- Produces: <for later tasks, with signatures>

**Steps**
- [ ] 1. Write failing tests in `<test path>`:
  ```
  it("<behaviour> [<spec>#R1.S1]")   // <key assertion>
  ```
- [ ] 2. Run `<command>`. Expect <n> failures (<why>).
- [ ] 3. Implement <signature> in `<path>`, following `<pattern path>`.
- [ ] 4. Run `<command>`. Expect <n> passed.
- [ ] 5. Run `<full test command>`. Expect all passing.
- [ ] 6. Commit: `<message> [<spec>#R1]`
