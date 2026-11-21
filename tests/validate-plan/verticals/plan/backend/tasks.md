---
work: 007-widget-export
vertical: backend
---
# Tasks: Widget export (backend)

### T1: Export endpoint

**Proves:** widget-export#R1.S1, widget-export#R2.S1
**Depends on:** none
**Est. diff:** ~100 lines

**Files**
- Create: `src/x.ts`

**Steps**
- [ ] 1. Write failing tests: `exports the widgets [widget-export#R2.S1]`
- [ ] 2. Commit

### T3: One export at a time

**Proves:** widget-export#R2.S3
**Depends on:** T2
**Est. diff:** ~100 lines

**Files**
- Create: `src/x.ts`

**Steps**
- [ ] 1. Write failing tests: `exports the widgets [widget-export#R2.S1]`
- [ ] 2. Commit
