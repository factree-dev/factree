# /factree:verify test cases

Run each case in a repo with the plugin installed, then check the result. Rerun after changing the verify skill, and log results at the bottom.

Every case must also pass:
- No code, test, spec or plan changes (`git status` shows only the event log).
- Exactly one `spec.verified` event per run.

---

## 1. Two suites, one run each [verify#R1.S1]

**Setup:** this repo; run `/factree:verify build`.
**Expect:** `bash tests/run.sh` and the companion's Vitest suite each run once. Tests citing `build` scenarios from both are matched. The summary counts proved, failing and unverified, and every scenario that isn't proved is listed with what would prove it.


## Build check [verifying#R2.S2]

**Setup:** a project whose profile has a test command but no build command.
**Expect:** verify says "no build command found for <project>", writes no build line, and doesn't report the spec as failing for it.

## Citation check [verifying#R1.S1] [verifying#R1.S2]

**Setup:** two passing tests: one citing a scenario and asserting its THEN's values, one citing another scenario but only checking that the page renders.
**Expect:** the first scenario is proved; the second is unverified, "cited, doesn't check THEN".


## Lessons after verify [self-improving#R7.S1]

**Setup:** a workspace where `lessons.sh` prints 2 candidates while a build runs.
**Expect:** no lesson appears during the build; after verify's result, both are proposed in the terminal and appear as 2 cards on the spec's Decisions tab.

## Approve a lesson [self-improving#R8.S1]

**Setup:** the lesson `pref:approve_plans` proposed.
**Expect:** approving it (here or in the companion) adds `approve_plans: nothing-new` and a `<!-- lesson pref:approve_plans, from … -->` line to `.factree/preferences.md`, and Claude says so.

## Approved with no session open [self-improving#R8.S3]

**Setup:** approve a lesson in the companion with no Claude Code session open; then start `/factree:spec`.
**Expect:** before anything else, Claude writes the lesson to its file and says so in one line.

---

## Results

| Date | Plugin version | Case | Pass? | Notes |
|---|---|---|---|---|
