---
work: 001-url-shortener
vertical: frontend
---
# Tasks: Short links (frontend)

Each task is one reviewable change: it ends with tests passing, is one commit, and fits a single review of up to 300 changed lines. Task numbers run across the whole plan, in build order; coverage and order are in ../plan.md.

| Task | What | Proves | Depends on | Est. diff |
|---|---|---|---|---|
| T3 | Links page | R5.S1, R5.S2 | T1 | ~150 |

---

### T3: Links page

**Proves:** url-shortener#R5.S1, url-shortener#R5.S2
**Depends on:** T1 (the API it calls)
**Est. diff:** ~150 lines (page 70, route 3, tests 75)

**Files**
- Create: `web/src/links/LinksPage.tsx`, `web/src/links/LinksPage.test.tsx`
- Modify: `web/src/routes.tsx`

**Steps**
- [ ] 1. Write failing tests:
  ```ts
  it("shortens a pasted link and shows it [url-shortener#R5.S1]")
  it("copies the short link [url-shortener#R5.S2]")
  ```
- [ ] 2. Run `npx vitest run web/src/links`. Expect 2 failures.
- [ ] 3. Build `LinksPage` with `useSubmit` (`web/src/members/InviteForm.tsx:18`) and `CopyButton`; add the route.
- [ ] 4. Run `npm test`. Expect all passing.
- [ ] 5. Commit: `feat(links): links page [url-shortener#R5]`
