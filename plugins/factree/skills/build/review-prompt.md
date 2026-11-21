# Task review prompt

Fill in `<…>` and give this to one fresh reviewer per task, after the build has measured the task and rerun its tests, before it merges (building R3). Name its model (building R6).

---

You are reviewing one task of an approved plan before it merges. You haven't seen the work being done; judge only what's in front of you.

- **Task:** `<workspace>/work/<work>/<vertical>/tasks.md`, `<T<n>: title>`: what it was asked to do, its Files, Interfaces and Steps.
- **Scenarios it proves:** in `<workspace>/specs/<spec>.md`: `<spec>#R<n>.S<n>`, …
- **Design:** `<workspace>/work/<work>/<vertical>/design.md`: the patterns it must follow, each with the repo path that shows it.
- **Global constraints:** `<copied from plan.md>`
- **Diff:** `<diff file>` (commits, stat and full diff with context). Read it once; open other files only to check a risk you can name, and say which.
- **Implementer's report:** `<report>`. Treat it as claims to check against the diff, including any reason it gives for a choice.

Don't change anything, don't run the whole suite again (the build already did), and don't start other agents.

Give two verdicts.

**Spec:** does the diff do what the task asks, nothing missing and nothing extra?
- Each scenario it proves has a test that checks the scenario's THEN, with the spec's values.
- Nothing a user or caller could notice was added beyond the task (an option, a field, a message no scenario asks for).
- Don't ask for behaviour the spec and its sources don't ask for. If you do suggest it, set `beyond_sources: true` (see below).
- Global constraints hold.

**Quality:** is it built the way this repo builds things?
- It follows the design's cited patterns rather than a new way of its own.
- Tests check behaviour, not mocks: a test that only asserts a mock was called fails this.
- Names match the task's Interfaces; no dead code, no leftover debugging, nothing the task didn't need.

Report, in exactly this shape:

```
spec: pass | fail
quality: pass | fail
findings:
- [spec|quality] <file:line> <what's wrong, and what would fix it> | asked for: <the spec or source line that asks for it, quoted, or "none"> | beyond_sources: true|false
```

For every finding, say whether the spec or its sources ask for what it wants, quoting the line. If none does, set `beyond_sources: true`: the build records it as a suggestion and builds nothing. A security risk beyond the sources is still reported, marked `security`.

A verdict fails only for something you can point to in the diff. Minor style preferences go under findings marked `(minor)` and don't fail a verdict.

---

## Branch

Use this section instead of the task review when every task has merged (building R9). Give the reviewer the branch diff file (from the merge base with the plan's base branch), the path of a checkout of the branch outside the repo, the profile's test and start commands, the lenses' gap checks and scale triggers, `plan.md` and the spec.

You are reviewing a whole branch before it's verified and goes to human reviewers. Each task was already reviewed alone; look for what only shows across the whole branch:
- **The spec, end to end:** every in-scope scenario is delivered, and nothing a user or caller could notice was added beyond them.
- **Consistency across tasks:** the same thing named or done two ways, duplicated logic, an interface one task produces and another uses differently.
- **Risk areas:** what the plan's lenses say to watch (security, performance, concurrency, migrations).
- **Tests:** each scenario's test checks its outcome; nothing only checks that code runs.
- **Beyond the sources:** each finding says whether the spec or its sources ask for what it wants, quoting the line. If none does, set `beyond_sources: true`, whatever the severity. A defect in what the spec or its sources do ask for (a crash-safety ticket and a double write) is not beyond them.
- **Deferred findings:** the minor findings from the task reviews, listed in `plan.md` or given to you; say which must be fixed now.

**Probe the code, don't only read it.** For each gap check or scale trigger in the lenses that the branch touches, write throwaway probes in a scratch folder outside the repo and run them against the checkout. Start the service with the start command if it runs; if it can't (a database or secret you don't have), call its functions and modules directly. Stop everything a probe starts, and leave nothing in the repo or the checkout. If the branch touches no gap check or trigger, write no probes.
- Report a finding only with evidence: the probe's `command → observed, expected`, or an exact `file:line` trace. A suspicion a probe disproves is not a finding.
- If a probe shows a defect the base branch already had, report it as **minor**, marked "pre-existing".
- List each risk area you couldn't probe as `not probed: <area> (<reason>)`.

Give each finding a severity:
- **must fix:** wrong behaviour, a scenario not delivered, a security or data-loss risk, a broken interface between tasks;
- **should fix:** inconsistency or a gap a reviewer would ask about, a weak test for a scenario;
- **minor:** everything else. Nitpicks and style preferences are always minor.

Report:

```
verdict: ready | fix first
findings:
- [must|should|minor] <file:line> <what's wrong, and what would fix it> | evidence: <command → observed, expected | file:line> | asked for: <quoted line, or "none"> | beyond_sources: true|false
not probed: <area> (<reason>)
```
