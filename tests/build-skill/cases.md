# /factree:build test cases

Run each case in a scratch repo with the plugin installed and an approved plan, play the user, then check the result. Rerun after changing the build skill or its task prompt, and log results at the bottom.

Every case must also pass:
- Nothing is pushed; only `factree/<work>` and `factree/<work>-T<n>` branches are created.
- The spec and the plan's design and tasks are unchanged, except steps ticked by `task-done.sh`.
- Every `task.done` came from `task-done.sh`.

---

## 1. Waves [build#R1.S1] [build#R1.S2] [build#R3.S1]

**Setup:** a plan where T1 and T2 depend on nothing, T3 depends on T1, and T4 on T2 and T3; separately, a plan with five independent tasks.
**Expect:** T1 and T2 start together in their own worktrees on `factree/<work>-T1` and `-T2`; T3 starts only after T1 is merged; T4 only after T2 and T3. With five independent tasks, three start and the fourth waits for one to land. Each finished task is merged into `factree/<work>`, one at a time.

## 2. Plan not approved [build#R1.S3]

**Setup:** a plan with `status: draft`.
**Expect:** nothing is built; the skill says to approve it with /factree:plan first.

## 3. Test-first [build#R2.S1] [build#R2.S2]

**Setup:** (a) a task proving R5.S1; (b) a task whose new test already passes.
**Expect:** (a) the report shows the R5.S1 test failing first then passing, and the commit ends with `[<spec>#R5]`; (b) the task is failed: "test passes before the change".

## 4. Never pushed [build#R3.S2]

**Setup:** a repo with a remote; build a plan to the end.
**Expect:** `git ls-remote` shows no `factree/` branches.

## 5. Red after merging [build#R4.S2]

**Setup:** two tasks that each pass alone but break the suite together.
**Expect:** the second merge is undone, that task is failed with the failing tests, and its dependents don't start.

## 6. Problems [build#R5.S1] [build#R5.S2] [build#R5.S3]

**Setup:** review_budget 300 and a task that reaches 410 lines; a task needing behaviour the spec doesn't define; two parallel tasks editing the same lines.
**Expect:** the big task isn't merged, is failed with a proposed split, and an independent task still lands; the spec-gap task is blocked naming the question for /factree:spec; the second conflicting task isn't merged and is failed with the files.

## 7. Resume [build#R7.S1]

**Setup:** a build where T1 is done and T2 failed; split T2 in the plan with /factree:plan.
**Expect:** rerunning /factree:build skips T1 and builds the new tasks.


## Built, then verified [factory-flow#R3.S1] [factory-flow#R4.S3]

**Setup:** an approved plan whose tasks all pass.
**Expect:** after the last task merges, Claude says "Verifying <spec>.", runs verify, and ends with "<spec>: N proved · 0 failing · 0 unverified" and that `factree/<work>` is ready for review. Nothing is pushed, no pull request is opened, nothing is merged into main.

## A failed task stops it [factory-flow#R3.S2]

**Setup:** a plan where one task exceeds its review budget.
**Expect:** the other tasks finish, then Claude stops before verify and reports the failed task.


## Evidence with every claim [verifying#R3.S1] [verifying#R3.S2]

**Setup:** a build whose last task merges with the full suite green; then one with a single failing test.
**Expect:** the first closing message quotes the suite's command and its result (e.g. "npm test: 206 passed"); the second names the failing test and never says "done".


## Dependencies installed [building#R1.S1]

**Setup:** a Node project whose `node_modules` isn't committed; an approved plan.
**Expect:** each task's worktree runs the project's install command before its subagent starts.

## Red baseline [building#R1.S2]

**Setup:** the plan branch already has one failing test.
**Expect:** the build stops before any task, naming that test as already failing on `factree/<work>`.

## Shared file [building#R2.S1]

**Setup:** T2 and T3 both depend only on T1 and both modify `src/App.tsx`.
**Expect:** after T1, T2 and T3 run one after the other, and the build says why in one line.

## Model per job [building#R6.S1]

**Setup:** a one-file task whose steps give its tests and signatures.
**Expect:** its implementer is dispatched on the cheapest model, named in the dispatch.

## Own numbers [building#R7.S1]

**Setup:** a subagent that reports 180 changed lines for a diff of 340.
**Expect:** the build counts 340, over the 300 budget, and doesn't merge.


## Review before merge [building#R3.S1] [building#R3.S2] [building#R3.S3]

**Setup:** three tasks: one that proves its scenarios with the cited pattern; one that also adds an unasked sort option; one that fetches data its own way where the design cites `useWorkspace`.
**Expect:** the first passes both verdicts and merges; the second fails the spec verdict ("adds behaviour the task doesn't ask for"); the third fails the quality verdict naming the pattern. Neither of the last two merges as is.

## Fix loop [building#R4.S1] [building#R4.S2]

**Setup:** a task whose review finds a missing empty-state test; then a task that can't be made to pass.
**Expect:** the first merges after round 2's re-review with nothing reaching the user; the second is failed to the user after round 4 with each round's findings.

## Rulings on details [building#R5.S1] [building#R5.S2]

**Setup:** a task that doesn't name an internal helper; another that meets an empty team the spec doesn't cover.
**Expect:** the first names the helper and the build logs a call; the second blocks with the question for the spec.

## Behaviour, not mocks [building#R8.S1]

**Setup:** a task whose test only asserts that a mock was called.
**Expect:** the quality verdict fails it as not checking behaviour.


## Review recorded [self-improving#R2.S1] [self-improving#R2.S2]

**Setup:** a task whose quality verdict fails for fetching data instead of using `useWorkspace`, fixed in round 1.
**Expect:** a `task.reviewed` with spec pass, quality fail and the finding with pattern `apps/companion/src/api.ts`; then a `task.reviewed` with round 1 and its root cause.


## Clean branch [building#R9.S1]

**Setup:** a plan whose 3 tasks merge with no must- or should-fix issues across the branch.
**Expect:** after the last task, a whole-branch review runs on the most capable model; the closing message lists 1 minor finding and the build's calls, and the run goes on to verify.

## One must-fix [building#R9.S2]

**Setup:** two tasks that call the same helper with different argument orders.
**Expect:** the branch review reports it as must fix; one fix round corrects it, the re-review passes, and the run goes on to verify.

## Still open [building#R9.S3]

**Setup:** a must-fix finding the fix round doesn't resolve.
**Expect:** the build stops before verify with `task.failed` for `branch`, and the finding goes to the user.


## Branch review probes [factory-quality#R1.S1] [factory-quality#R1.S2] [factory-quality#R1.S3] [factory-quality#R1.S4] [factory-quality#R1.S5] [factory-quality#R1.S6]

**Setup:** fixtures in `.factree/ab/short-43/`: (a) the A/B Factree branch at `9b76133`, before its review fixes (`r2-with-factree.git`); (b) the plain round 2 result (`starter2.git` plus its SHORT-43 commit), whose rate limit holds; (c) a branch on (a) changing only `README.md`; (d) (a) with `dataFile` replaced by a store that needs a database URL the checkout lacks; (e) a branch on `starter2` whose base already lets `/links/:code` 404 vary by case. Run the whole-branch review on each.
**Expect:**
- (a) a must-fix with a probe that deletes the link during a slow PATCH body: observed 500, expected 404 [R1.S1].
- (b) no rate-limit finding when 15 concurrent creates give 10 [R1.S2].
- Probes and checkout are outside the repo; `git status` of the plan worktree is unchanged [R1.S3].
- (c) no probes [R1.S4].
- (d) module-level probes, and a "not probed: <area> (<reason>)" line [R1.S5].
- (e) the base defect is a minor marked "pre-existing" [R1.S6].
**Before the change:** on (a) the reviewer read only the diff, gave no probe evidence and missed the PATCH-vs-DELETE race.

## Self-review and verify logged [live-activity#R4.S2]

**Setup:** a build whose tasks all merge.
**Expect:** a `stage.step` with stage `self-review` before the whole-branch review result, then one with stage `verify` before `spec.verified`.

---

## Results

| Date | Plugin version | Case | Pass? | Notes |
|---|---|---|---|---|
