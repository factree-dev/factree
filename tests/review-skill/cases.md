# /factree:review test cases

Run each case in a scratch repo with a GitHub remote you can push to, the plugin installed and `gh` signed in (except where a case says otherwise). Note results in the table at the bottom.

## Clean verify [review#R1.S1]

**Setup:** a plan built on `factree/<work>` from `main`, verified with nothing failing.
**Expect:** the branch is pushed, a pull request into `main` is opened, `review.opened` is logged with its number and link, and the link is shown.

## Something failing [review#R1.S2]

**Setup:** the latest verify has 1 failing scenario.
**Expect:** nothing is pushed, no pull request; the failing scenario is named.

## Workspace not in the repo [review#R2.S2]

**Setup:** a spec with 2 requirements and 8 scenarios, in a workspace kept out of the repo.
**Expect:** the description holds them in a collapsed Spec section, and no link points to a `.factree/` file.

## Already open [review#R1.S3]

**Setup:** a pull request already open for the plan; a fix verified clean.
**Expect:** the fix is pushed to it; no second pull request.

## Description [review#R2.S1]

**Setup:** a plan with 1 frontend task, verify "8 proved · 0 failing · 0 unverified", 2 calls.
**Expect:** the description has Why, What changed (T1, frontend), Verified (8 proved), Where to look, Calls Claude made (both) and How to test.

## Sorting comments [review#R4.S1]

**Setup:** comments "this loop is off by one", "it should also export archived teams", and "use a Map here" where a Map is already used.
**Expect:** sorted and said as a code change, a behaviour change and one that doesn't hold.

## A code change [review#R5.S1] [review#R5.S2]

**Setup:** "this loop is off by one" on `src/sort.ts:12`; then a fix that breaks a scenario.
**Expect:** a fix task is added and built test-first (a failing test first), reviewed and verified, then pushed with a reply naming the commit. The breaking fix isn't pushed, and the failure goes to the user.

## A behaviour change [review#R6.S1]

**Setup:** "it should also export archived teams".
**Expect:** `/factree:spec` runs with the comment as the requirement; the spec gains the scenario; plan, build and verify follow; only then is the pull request updated.

## A reply that disagrees [review#R7.S1]

**Setup:** "use a Map here" where the code already uses one.
**Expect:** the drafted reply is a decision in the terminal and as a card in the companion; nothing is posted until the user says yes.

## No GitHub CLI [review#R9.S1]

**Setup:** a clean verify on a machine without `gh`.
**Expect:** nothing is pushed; Claude says `brew install gh`, `gh auth login`, then `/factree:review <work>`.

## The repo's way [review#R10.S3]

**Setup:** an open pull request that conflicts with its base, in a repo whose GitHub settings allow only rebase merges; then again in a repo that allows merge commits, with `update_branch: merge` in preferences.
**Expect:** (1) rebases onto the base and pushes with `--force-with-lease`, saying the repo allows only rebase; (2) merges the base in and pushes without force.

## Asked once [review#R10.S4]

**Setup:** a repo allowing merge commits and rebase, with no profile note, no doc saying which and no `update_branch`; two conflicts, one after the other.
**Expect:** the first asks merge or rebase as one decision, recommending merge, and saves `update_branch`; the second isn't asked.

## Resolved and proved [review#R10.S5]

**Setup:** a conflict where the base and the branch each added a separate line at the same place.
**Expect:** both kept; the profile's build and tests and verify run before the push; one comment on the pull request says what conflicted, how it was resolved and which checks passed.

## The sides disagree [review#R10.S6]

**Setup:** a conflict where the base and the branch change the same limit to different numbers; separately, a resolution after which a test fails.
**Expect:** nothing pushed in either; the user gets both versions and a recommendation as one decision, or the failure.

---

## Results

| Date | Plugin version | Case | Pass? | Notes |
|---|---|---|---|---|
