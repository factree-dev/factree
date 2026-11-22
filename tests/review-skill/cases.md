# /factree:review test cases

Run each case in a scratch repo with a GitHub remote you can push to, the plugin installed and `gh` signed in (except where a case says otherwise). Note results in the table at the bottom.

## Clean build [review#R1.S1]

**Setup:** a plan built on `factree/<work>` from `main`, branch review clean and the suite passing.
**Expect:** the branch is pushed, a pull request into `main` is opened, `review.opened` is logged with its number and link, and the link is shown.

## Something failing [review#R1.S2]

**Setup:** the branch's full test suite has 1 failing test.
**Expect:** nothing is pushed, no pull request; the failing test is named.

## Workspace not in the repo [review#R2.S2]

**Setup:** a spec with 2 requirements and 8 scenarios, in a workspace kept out of the repo.
**Expect:** the description holds them in a collapsed Spec section, and no link points to a `.factree/` file.

## Already open [review#R1.S3]

**Setup:** a pull request already open for the plan; a fix with the full suite passing.
**Expect:** the fix is pushed to it; no second pull request.

## Description [review#R2.S1]

**Setup:** a plan with 1 frontend task, 2 calls.
**Expect:** the description has Why, What changed (T1, frontend), the single paused-verify line, Where to look, Calls Claude made (both) and How to test.

## Sorting comments [review#R4.S1]

**Setup:** comments "this loop is off by one", "it should also export archived teams", and "use a Map here" where a Map is already used.
**Expect:** sorted and said as a code change, a behaviour change and one that doesn't hold.

## A code change [review#R5.S1] [review#R5.S2]

**Setup:** "this loop is off by one" on `src/sort.ts:12`; then a fix that breaks a scenario.
**Expect:** a fix task is added and built test-first (a failing test first), reviewed and the full suite run, then pushed with a reply naming the commit. The breaking fix isn't pushed, and the failure goes to the user.

## A behaviour change [review#R6.S1]

**Setup:** "it should also export archived teams".
**Expect:** `/factree:spec` runs with the comment as the requirement; the spec gains the scenario; plan and build follow; only then is the pull request updated.

## A reply that disagrees [review#R7.S1]

**Setup:** "use a Map here" where the code already uses one.
**Expect:** the drafted reply is a decision in the terminal and as a card in the companion; nothing is posted until the user says yes.

## No GitHub CLI [review#R9.S1]

**Setup:** a clean build on a machine without `gh`.
**Expect:** nothing is pushed; Claude says `brew install gh`, `gh auth login`, then `/factree:review <work>`.

## The repo's way [review#R10.S3]

**Setup:** an open pull request that conflicts with its base, in a repo whose GitHub settings allow only rebase merges; then again in a repo that allows merge commits, with `update_branch: merge` in preferences.
**Expect:** (1) rebases onto the base and pushes with `--force-with-lease`, saying the repo allows only rebase; (2) merges the base in and pushes without force.

## Asked once [review#R10.S4]

**Setup:** a repo allowing merge commits and rebase, with no profile note, no doc saying which and no `update_branch`; two conflicts, one after the other.
**Expect:** the first asks merge or rebase as one decision, recommending merge, and saves `update_branch`; the second isn't asked.

## Resolved and tested [review#R10.S5]

**Setup:** a conflict where the base and the branch each added a separate line at the same place.
**Expect:** both kept; the profile's build and full tests run before the push; one comment on the pull request says what conflicted, how it was resolved and which checks passed.

## The sides disagree [review#R10.S6]

**Setup:** a conflict where the base and the branch change the same limit to different numbers; separately, a resolution after which a test fails.
**Expect:** nothing pushed in either; the user gets both versions and a recommendation as one decision, or the failure.

## PR without verify [verify-paused#R3.S1]

**Setup:** an implemented plan with no `spec.verified` event.
**Expect:** the pull request is pushed and opened. Its description has no Verified section and no proved count; it has the single line "Verify is paused while it's redesigned; scenarios aren't marked proved." [R3.S1].
**Before the change:** with no verify the review stopped; a verify with `spec.verified` was required.

## Old tally not shown [verify-paused#R3.S2]

**Setup:** the spec has an old `spec.verified` event from before the pause.
**Expect:** the description doesn't quote its counts [R3.S2].
**Before the change:** the Proved line and the Verified section quoted them.

## Fix runs the full suite [verify-paused#R3.S3]

**Setup:** a code-change comment; separately, a conflict resolved by merge.
**Expect:** in both, the fix task is built, then the profile's full test suite runs before the push. Nothing runs `/factree:verify`. A failing suite means nothing is pushed and the failure goes to the user [R3.S3].
**Before the change:** each loop called `/factree:verify` before pushing.

## A branch fails alone [multi-repo#R5.S7]

**Setup:** `tests/fixtures/multi/make.sh <dir>` (bare remotes), a fake `gh` first on PATH that logs its calls and succeeds, a built plan with T1 in `backend` and T2 in `frontend`; T2's branch fails `frontend`'s suite on its own.
**Expect:** no push (the bare remotes gain no `factree/` branch), no `gh pr create` in the fake's log; the user is told T2 fails alone, with the failing test.
**Before the change:** review ran one suite on the integration branch and opened one pull request for the plan (O4).

## A repo can't be reached [multi-repo#R5.S8]

**Setup:** the same fixture; the fake `gh repo view -R <owner>/infra` exits 1, "not found"; the plan has tasks in `backend` and `infra`.
**Expect:** nothing pushed anywhere, including `backend`; no pull request; the user is told `infra` can't be reached and why. A second run where every `gh repo view` passes but the second `gh pr create` fails: the first pull request is closed, the pushed branches are deleted from the bare remotes, and the failure is reported.
**Before the change:** one push and one `gh pr create` in the current folder; no per-repo check and no undo.

## Not before the branch review [multi-repo#R5.S9]

**Setup:** the same fixture; the build ended with a must-fix still open in the branch review.
**Expect:** no push, no pull request; the user is told the must-fix is open.
**Before the change:** only "the plan is implemented" was checked.

## Linked in merge order [multi-repo#R6.S1]

**Setup:** the same fixture; T1 in `backend` (base `main`), T2 in `frontend` (base `develop`) depending on T1; fake `gh` numbers pull requests per repo (backend #12, frontend #45).
**Expect:** `gh pr create -R <owner>/backend --head factree/<work>-T1 --base main` runs before `-R <owner>/frontend --head factree/<work>-T2 --base develop`; `factree/<work>` is never pushed. #45's description lists backend#12 (T1) first and frontend#45 (T2, after backend#12) second, and says backend#12 merges first; #12's lists both too. Two `review.opened` events carry `repo`, `tasks`, `base` and `after` (`["backend#12"]` on the second); one `wait-review.sh <work> <repo> <pr>` starts per pull request.
**Before the change:** one pull request with no list of others and one `review.opened` without `repo`.

## A single-repo plan [multi-repo#R5.S5]

**Setup:** the fixture's `backend` as a one-repo workspace, a fake `gh` first on PATH, a built plan of 3 independent tasks.
**Expect:** 3 `gh pr create` calls, one per task, each `--head factree/<work>-T<n>` on the repo's base; `factree/<work>` is not pushed.
**Before the change:** one pull request from `factree/<work>` for the whole plan.

## After a squash merge [multi-repo#R7.S1]

**Setup:** `tests/fixtures/multi/make.sh <dir>`, a fake `gh` first on PATH that logs its calls; backend T1 and T3 (T3 after T1) pushed as `factree/<work>-T1` and `-T3`, T3 based on T1, both pull requests open; squash-merge T1 into `main` in the bare remote (`git merge --squash` in a clone, then push).
**Expect:** the skill rebases T3 with `git rebase --onto origin/main <old T1 tip> factree/<work>-T3`; T3's branch has none of T1's original commits; it pushes with `--force-with-lease=factree/<work>-T3:<last pushed sha>`; the log shows `gh pr edit <n> -R <owner>/backend --base main`; a `review.restacked` event; `factree/<work>` is not pushed or rebased.
**Before the change:** nothing happened on a merge; T3 kept T1's commits on a base that no longer had them.

## Someone else pushed [multi-repo#R7.S2]

**Setup:** the same fixture, before the restack: another clone pushes a commit to `factree/<work>-T3` in the bare remote.
**Expect:** the lease push is refused; the remote keeps the other person's commit; no `gh pr edit` runs; the user is told and asked what to do.
**Before the change:** no lease was named, so a plain `--force-with-lease` after a fetch could overwrite the commit.

## Comment fixed on the task branch [multi-repo#R8.S1]

**Setup:** the same fixture with T1 in `backend` and T2 in `frontend`, both pull requests open (backend #12, frontend #45); a code-change comment on frontend #45.
**Expect:** a failing test, then one new commit on `factree/<work>-T2` in `frontend`; a fresh `Review <work> T2` reviewer; `frontend`'s full suite runs (not `backend`'s); the fix is also merged into `factree/<work>`; `factree/<work>-T2` is pushed to the frontend remote and the reply is posted on #45 (`-R <owner>/frontend`) with `review.reply` carrying `repo`. A comment on a backend pull request with the same number goes to backend's task.
**Before the change:** the comment became a new task on the plan branch (O4), run through build and pushed as `factree/<work>`.

## Fix under a stack [multi-repo#R8.S2]

**Setup:** the same fixture, backend T1 and T3 stacked (T3 after T1); a code-change comment on T1's pull request.
**Expect:** the fix is a commit on `factree/<work>-T1`, pushed; then T3 is rebased with `git rebase --onto origin/factree/<work>-T1 <old T1 tip> factree/<work>-T3` and pushed with `--force-with-lease=factree/<work>-T3:<last pushed sha>`, so T3 shows only its own change on top of the fix; if someone else pushed to T3, the push is refused and the user is asked.
**Before the change:** T3 stayed on T1's old commits.

---

## Results

| Date | Plugin version | Case | Pass? | Notes |
|---|---|---|---|---|
| 2026-11-22 | 0.17.0 | Comment fixed on the task branch [multi-repo#R8.S1] | Fail | Failing run: the skill added a fix task on the plan branch and pushed `factree/<work>` (O4). |
