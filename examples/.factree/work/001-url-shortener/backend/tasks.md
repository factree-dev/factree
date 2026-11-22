---
work: 001-url-shortener
vertical: backend
---
# Tasks: Short links (backend)

Each task is one reviewable change: it ends with tests passing, is one commit, and fits a single review of up to 300 changed lines. Task numbers run across the whole plan, in build order; coverage and order are in ../plan.md.

| Task | What | Proves | Depends on | Est. diff |
|---|---|---|---|---|
| T1 | Shorten and redirect | R1.S1, R1.S2, R1.S3, R2.S1, R2.S2, R4.S1 | — | ~220 |
| T2 | Count opens | R3.S1 | T1 | ~80 |

---

### T1: Shorten and redirect

**Proves:** url-shortener#R1.S1, url-shortener#R1.S2, url-shortener#R1.S3, url-shortener#R2.S1, url-shortener#R2.S2, url-shortener#R4.S1
**Depends on:** none
**Est. diff:** ~220 lines (migration 15, code 20, routes 70, tests 115)

**Files**
- Create: `api/migrations/007_links.sql`, `api/src/links/code.ts`, `api/src/links/routes.ts`, `api/test/links.test.ts`
- Modify: `api/src/routes/index.ts` (register the links routes)

**Interfaces**
- Produces: the `POST /links` and `GET /:code` contract in backend/design.md

**Steps**
- [ ] 1. Write failing tests:
  ```ts
  it("shortens a valid link [url-shortener#R1.S1]")
  it("refuses something that isn't a link [url-shortener#R1.S2]")
  it("returns the same short link twice [url-shortener#R1.S3]")
  it("redirects a known code [url-shortener#R2.S1]")
  it("shows not found for an unknown code [url-shortener#R2.S2]")
  it("makes codes that can't be guessed [url-shortener#R4.S1]")
  ```
- [ ] 2. Run `npx vitest run api/test/links.test.ts`. Expect 6 failures.
- [ ] 3. Add the migration, `randomCode()` and the routes, following `api/src/routes/members.ts:22`.
- [ ] 4. Run the same command. Expect 6 passed.
- [ ] 5. Run `npm test`. Expect all passing.
- [ ] 6. Commit: `feat(links): shorten and redirect [url-shortener#R1, R2, R4]`

---

### T2: Count opens

**Proves:** url-shortener#R3.S1
**Depends on:** T1 (the link model it reads)
**Est. diff:** ~80 lines

**Files**
- Modify: `api/src/links/routes.ts` (count in `GET /:code`; add `GET /links`)
- Create: `api/test/link-opens.test.ts`

**Steps**
- [ ] 1. Write a failing test: `it("counts every open [url-shortener#R3.S1]")`: open a link 3 times, `GET /links` shows `opens: 3`.
- [ ] 2. Run `npx vitest run api/test/link-opens.test.ts`. Expect 1 failure.
- [ ] 3. Count in the redirect's update; add `GET /links`.
- [ ] 4. Run `npm test`. Expect all passing.
- [ ] 5. Commit: `feat(links): count opens [url-shortener#R3]`
