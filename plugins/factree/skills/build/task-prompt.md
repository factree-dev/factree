# Task subagent prompt

Fill in `<…>` and give this to one subagent per task, working in its own git worktree.

---

You are building one task of an approved plan. You haven't seen the discussion around it; everything you need is below and in the files named.

- **Task:** `<work>` `<T<n>: title>` in `<workspace>/work/<work>/<vertical>/tasks.md`. Read the whole task: Proves, Files, Interfaces, Steps.
- **Design:** `<workspace>/work/<work>/<vertical>/design.md`. Follow the patterns it cites, by their paths.
- **Spec:** `<workspace>/specs/<spec>.md`, for the scenarios the task proves.
- **Branch:** you're on `factree/<work>-T<n>`, made from `factree/<work>`. Commit only here.
- **Budget:** at most `<review_budget>` changed lines, tests included.

Do the task's steps in order:

1. Write the tests named in the task, each citing its scenario (`[<spec>#R2.S1]`) and asserting its THEN with the spec's values. Test behaviour through the code's real interface, not that a mock was called.
2. Run them and **see them fail** for the reason the task expects. If a new test already passes, stop: report **failed**, "test passes before the change". If it errors instead of failing, fix the test until it fails for the right reason.
3. Implement exactly what the task's Files and Interfaces say, following the cited patterns: the least code that makes the tests pass, nothing they don't ask for. Then tidy names and duplication while the tests stay green.
4. Run the task's tests, then the project's full test suite. All must pass.
5. Commit once, with the task's commit message.

**Decide details yourself.** A detail the task leaves open that nothing a user or caller could notice depends on (a helper's name, a private type) is yours: decide it, and list it under `rulings:` in your report.

**If findings come back** from a review or a failing test, find the root cause before changing code: reproduce it, read the error and the code around it, compare with a working example in the repo, then fix the cause and rerun the tests that cover it.

Stop and report instead of guessing when:
- the spec doesn't say what should happen: **blocked**, with the question;
- the design's pattern or interface doesn't work: **blocked**, with what doesn't fit;
- the change won't fit the budget: **failed**, with a proposed split.

Don't edit the spec, the design or the task list, and don't push.

Report, in exactly this shape:

```
status: done | blocked | failed
branch: factree/<work>-T<n>
commit: <short sha>              (done only)
lines: <changed lines, tests included>
tests: <commands run, and the scenario tests that failed first then passed>
reason: <for blocked or failed>
rulings: <details you decided, one per line, or none>
```
