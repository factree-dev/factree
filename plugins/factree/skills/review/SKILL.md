---
name: review
description: Send built Factree work out for human review — push the plan branch, open or update a GitHub pull request that says what was built, follow it in the background, and loop each review comment back through build (or the spec) before pushing. Use after a build (the flow does this on its own) or to pick up review comments. Never merges.
argument-hint: "<work id, e.g. 012-review>"
---

# Review

Take built work out to people. Factree opens the pull request, tells reviewers what was built and where to look, and turns their comments into more factory work: a code change goes back through build, a behaviour change through the spec first. Only code whose tests pass reaches the pull request, and merging stays with the reviewers and the user.

Input: $ARGUMENTS

Paths below: `<plugin>` is two levels up from this skill's base directory. Shared scripts are in `<plugin>/scripts/`.

<HARD-GATE>
Push only the plan branch, `factree/<work>`, and only code whose full test suite passes. Never merge, close or approve a pull request, and never push to any other branch. Never post a reply that disagrees with a reviewer without the user's yes.
</HARD-GATE>

## Process

**The flow runs on its own** (factory-flow): build hands on to this skill once the plan is implemented with no must-fix open. Say "Opening the pull request for <work>." and carry on; stop only for an open decision (a reply that disagrees with a reviewer, a behaviour change the spec must decide), a failing test suite, or a failed or blocked task.

### 1. Check GitHub (review R9)

Run `command -v gh` and `gh auth status`. If `gh` is missing or not signed in, push nothing and say, in a few lines: install it with `brew install gh` (or from cli.github.com), sign in with `gh auth login`, then run `/factree:review <work>`. The branch stays ready. Stop.

### 2. Check what's being sent (review R1)

Find the workspace with `bash <plugin>/scripts/init.sh` (its last line is the workspace; it creates one on first use, local only, and on exit 3, outside a git repo, say what it printed and stop). Read `<workspace>/work/<work>/plan.md` If the plan isn't implemented, push nothing: name what's unbuilt and stop.

### 3. Open or update the pull request (review R1, R2)

Log `bash <plugin>/scripts/event.sh stage.step <spec-id> '{"stage":"review","step":"pushing","work":"<work-id>"}'` before pushing (live-activity R4).


1. The base is the branch `factree/<work>` was made from (usually `main`); find it with `git merge-base` against the candidates, or from an earlier `review.opened`.
2. Push: `git push -u origin factree/<work>`.
3. If a `review.opened` for this work names a pull request that's still open (`gh pr view <n> --json state`), it's updated by the push: say so, and don't open another (R1.S3).
4. Otherwise write the description to a file and run `gh pr create --base <base> --head factree/<work> --title "<spec title>: <plan title>" --body-file <file>`. The description (R2), short on top with everything else folded (`<plugin>/shared/writing.md`):

```
<one sentence: what this changes, and why>

- **Changed:** <each vertical and its tasks, one line>
- **Look at:** <the one or two things a reviewer should check>, or "nothing special"
Verify is paused while it's redesigned; scenarios aren't marked proved.

<details><summary>Spec: <title> (<n> requirements, <n> scenarios)</summary>

- **R1 <name>:** <the requirement>
  - S1 <scenario name> · S2 …
</details>
<details><summary>What changed</summary>

- **<vertical>:** T1 <title> (<commit>), T2 …
</details>
<details><summary>Where to look</summary>

<the plan's Review focus, one line each>
</details>
<details><summary>Calls Claude made</summary>

<each call from this spec and plan, with its id, so reviewers can challenge it>
</details>
<details><summary>Suggested, not built</summary>

<each `beyond_sources` finding from the build's reviews, one line each, or omit this section if none>
</details>
<details><summary>How to test</summary>

<the project's test command, and how to try the behaviour by hand>
</details>
```

The workspace is local and never in the repo (workspace-setup D2), so the description carries the spec rather than linking to it: no link may point to a `.factree/` file (review R2).
5. Log `review.opened` with `{"pr":"<number>","url":"<url>","base":"<base>"}` on the work id, and show the link.

### 4. Follow the review (review R3)

Start `bash <plugin>/scripts/wait-review.sh <work>` with `run_in_background`, then end your turn. It checks the pull request every 5 minutes, logs each new comment (`review.comment`) and each change of state (`review.state`), and exits when there's something new, which wakes this session. Keep one wait per pull request. When it ends:
- **Merged or closed:** say so; Review is done. Don't start another wait.
- **Approved:** say it's ready for the reviewers or the user to merge. Never merge it yourself.
- **Comments:** go on to step 5.
- **CONFLICTING:** the pull request no longer merges cleanly with its base, usually because something else merged first. Go to step 7.
- **"gh failed":** say why, and how to fix it (often `gh auth login`); stop.

### 5. Check each comment against the code (review R4)

Read each new comment and the code it points at before changing anything. Don't agree just to agree, and don't assume the reviewer is right or wrong. Sort it:
- **Code change:** the code is wrong or could be clearer, and the spec stays as it is (a bug, a missing test, a cleaner way).
- **Behaviour change:** the reviewer wants the software to do something the spec doesn't say ("it should also export archived teams").
- **Doesn't hold:** checked against the code, the comment is mistaken (the Map is already there, the case is already tested).

Say how you sorted each, in one line apiece.

### 6. Loop it back

- **Code change** (R5): add a fix task to the plan's tasks for the vertical whose code it touches, numbered after the last task, with `**Proves:**` the scenarios it affects (or `none (review comment <id>)`), and run `/factree:build <work>` for it: test-first, reviewed, merged. Then run the project's full test suite (the profile's command). Push only if it passes; then reply on the comment with the commit (`gh api repos/{owner}/{repo}/pulls/<n>/comments/<id>/replies -f body="Fixed in <sha>: <one line>"`, or `gh pr comment` for a conversation comment) and log `review.reply` with `{"pr","comment":"<id>","kind":"fixed","commit":"<sha>"}`. If the suite fails, push nothing and bring the failure to the user (R5.S2).
- **Behaviour change** (R6): run `/factree:spec` with the comment as the requirement and the pull request as its source. The flow plans and builds the change; then push and reply as above with `"kind":"spec"`.
- **Doesn't hold** (R7): draft a short reply with your reasoning and the line that shows it. Ask it as a decision: log `question.asked` on the spec with `{"n","text":"Reply to <author> on <path>:<line>?","why":"<your reasoning>","proposal":"Post: <the reply>","options":["Change the code instead — treat it as a code change"]}`, and wait as for any decision. Post it only on the user's yes, then log `review.reply` with `"kind":"disagree"`.

Then start the wait again (step 4).

### 7. Keep it mergeable (review R10)

Repos differ in how a branch catches up with its base, so find this repo's way before changing anything, and assume none:
1. **The repo profile** (`<workspace>/profiles/<project>.md`): a note on how branches are updated or merged.
2. **GitHub's settings:** `gh api repos/{owner}/{repo} --jq '[.allow_merge_commit, .allow_squash_merge, .allow_rebase_merge]'`. If only rebase merges are allowed, the way is rebase.
3. **The repo's own docs:** CLAUDE.md, CONTRIBUTING and the like, for how to update a branch and for any rule about conflicts (a file that's regenerated, a version line, a changelog).
4. **The `update_branch` preference** in `<workspace>/preferences.md`.
5. **Otherwise ask once,** as a decision with a recommendation (merge, which keeps reviewers' comments attached and needs no force-push), and save the answer as `update_branch` so it isn't asked again (R10.S4).

Then:
- **Update the branch** from the base: `git merge origin/<base>`, or for rebase `git rebase origin/<base>` and later `git push --force-with-lease`. Never force-push otherwise, and never without lease (R10.S3).
- **Resolve each conflict.** Follow any rule the repo's docs give. Where both sides add separate things, keep both. Where the base and the branch change the same behaviour differently (the same rule, value or text to different ends), or you aren't sure what either side meant, stop: push nothing, and bring the user both versions and your recommendation as one decision (R10.S6).
- **Prove it** before pushing: run the build and the project's full test suite from the repo profile. If anything fails, push nothing and bring the failure to the user (R10.S6).
- **Push, then say so on the pull request** in one comment: what conflicted and how it was resolved, and the checks that passed (R10.S5).

Then start the wait again (step 4). It logs the pull request as mergeable once GitHub agrees.

**Evidence with every claim** (verifying R3): say work is pushed or fixed only right after running the command that shows it, and quote it ("git push: factree/012-review -> factree/012-review", "npm test: 221 passed").

## Logging events

`bash <plugin>/scripts/event.sh <type> <work> '<json>'`: `review.opened` `{"pr","url","base"}`, `review.reply` `{"pr","comment","kind","commit"}`. `review.comment` and `review.state` come from `wait-review.sh`, never by hand.

Run `bash <plugin>/scripts/link.sh <spec-id> <work>` when the pull request opens and end your message with its line, if any.

## Red flags

| Thought | Reality |
|---|---|
| "The reviewer's right, I'll just change it" | Check it against the code first. Then a fix task, built and tested, before anything is pushed. |
| "It's a one-line fix, I'll push it straight away" | Every push runs the full test suite first. A reviewer must never see code Factree hasn't built and tested. |
| "The reviewer wants new behaviour, I'll add it to the fix" | Behaviour changes go through the spec. Run /factree:spec. |
| "They're wrong, I'll reply and move on" | A reply that disagrees speaks for the user. Ask first. |
| "It's approved, I'll merge it" | Never. Merging is the reviewers' and the user's. |
| "gh isn't there, I'll push with git and open it later" | No gh, no push. Say how to install it and stop. |
