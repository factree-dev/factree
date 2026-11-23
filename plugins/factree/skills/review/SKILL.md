---
name: review
description: Send built Factree work out for human review — push each task's branch, open or update a GitHub pull request per task that says what was built, follow them in the background, and loop each review comment back through build (or the spec) before pushing. Use after a build (the flow does this on its own) or to pick up review comments. Never merges.
argument-hint: "<work id, e.g. 012-review>"
---

# Review

Take built work out to people. Factree opens the pull request, tells reviewers what was built and where to look, and turns their comments into more factory work: a code change goes back through build, a behaviour change through the spec first. Only code whose tests pass reaches the pull request, and merging stays with the reviewers and the user.

Input: $ARGUMENTS

Paths below: `<plugin>` is two levels up from this skill's base directory. Shared scripts are in `<plugin>/scripts/`.

<HARD-GATE>
Push only the `factree/<work>-T<n>` task branches (never the integration branch `factree/<work>`), and only code whose full test suite passes, all pull requests together or none. Never merge or approve a pull request, close one only to undo a half-opened set (D16), and never push to any other branch. Never post a reply that disagrees with a reviewer without the user's yes.
</HARD-GATE>

## Process

**The flow runs on its own** (factory-flow): build hands on to this skill once the plan is implemented with no must-fix open. Say "Opening the pull request for <work>." and carry on; stop only for an open decision (a reply that disagrees with a reviewer, a behaviour change the spec must decide), a failing test suite, or a failed or blocked task.

### 1. Check GitHub (review R9)

Run `command -v gh` and `gh auth status`. If `gh` is missing or not signed in, push nothing and say, in a few lines: install it with `brew install gh` (or from cli.github.com), sign in with `gh auth login`, then run `/factree:review <work>`. The branch stays ready. Stop.

### 2. Check what's being sent (review R1, multi-repo R5.S9)

Find the workspace with `bash <plugin>/scripts/init.sh` (its last line is the workspace; it creates one on first use, local only, and on exit 3, outside a git repo, say what it printed and stop). Read `<workspace>/work/<work>/plan.md`. If the plan isn't implemented, or the branch review still has a must-fix open, push nothing: name what's unbuilt or open and stop.

Get the pull requests: `bash <plugin>/scripts/pr-plan.sh <workspace>/work/<work>`. One tab-separated line per pull request, in merge order: `tasks`, `repo`, `head`, `base`, `after`. That list is the whole set; a single-repo plan is the same with one repo (R5.S5).

### 3. Test everything, then open every pull request or none (multi-repo R5, D14, D16)

Log `bash <plugin>/scripts/event.sh stage.step <spec-id> '{"stage":"review","step":"checking","work":"<work-id>"}'` before the checks and `"step":"pushing"` before the first push.

**Check first; nothing is pushed until all of it passes:**
1. **Each pull request's own suite** (R5.S7). Check its `head` out in a worktree in its repo and run that repo's full suite (the profile's command). A failure stops everything: say which task fails alone and name the failing test.
2. **Each repo's access** (R5.S8). For every repo in the list, run `gh repo view -R <owner/repo>` (the owner and name come from its `origin` remote). If it can't be reached or `gh` isn't signed in for it, say which repo and why, with the fix (`gh auth login`, or the missing remote).

**Then push and open, in merge order,** so each earlier number exists when a later one needs it:
1. Push the pull request's head, once, by the rule in step 8. If a `review.opened` for this work already names this pull request and it's still open (`gh -R <owner/repo> pr view <n> --json state`), the push updates it: say so, don't open another (R1.S3), and skip 2 and 3. Otherwise it's a new branch with no recorded sha, so no previous tip: step 8 pushes it plain with `-u`.
2. Write the description to a file and run `gh pr create -R <owner/repo> --head <head> --base <base> --title "<spec title>: <tasks>" --body-file <file>`. The `base` is from the list: the repo's base branch, or the head of the pull request it's stacked on.
3. Log `review.opened` on the work id with `{"pr","url","repo","tasks":["T1"],"base","after","sha"}`; `sha` is `git -C <repo> rev-parse <head>`, the commit just pushed. `after` maps each of the line's `after` entries to `repo#number`: a head branch to its pull request in the same repo, `repo#T1+T2` to the numbers of the pull requests holding those tasks.

**If a push or an open fails part way,** undo it (D16): close every pull request this run opened (`gh -R <owner/repo> pr close <n>`), delete the branches it created (`git -C <repo> push origin --delete <head>`, in the repo each was pushed to; the one push outside step 8, as it only removes what this run made), and report what failed and what was undone. Never leave a half-opened set, because it breaks the merge order. Note before each push whether the head already existed on the remote; one that did is left alone.

The description (R2), with the plan's list of pull requests (multi-repo R6), short on top with everything else folded (`<plugin>/shared/writing.md`). Write each one after the earlier numbers exist; for the later pull requests, edit an earlier one (`gh pr edit`) so all of them list the whole set:

```
<one sentence: what this changes, and why>

- **Merge order:** <repo>#<n> (T1), then <repo>#<n> (T2, after <repo>#<n>)…; this is <repo>#<n>, so merge <the ones before it> first, or "nothing first"
- **Changed:** <each task of this pull request, one line>; **look at:** <the one or two things to check>, or "nothing special"
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

<the repo's test command, and how to try the behaviour by hand>
</details>
```

When a pull request is stacked on another in its repo, say that its base is that pull request's branch and that the earlier change shows until it merges.

The workspace is local and never in the repo (workspace-setup D2), so the description carries the spec rather than linking to it: no link may point to a `.factree/` file (review R2).

Show every link.

### 4. Follow the review (review R3)

Start one `bash <plugin>/scripts/wait-review.sh <work> <repo> <pr>` per pull request with `run_in_background`, then end your turn. Each checks its pull request, in its repo, every 5 minutes, logs each new comment (`review.comment`) and each change of state (`review.state`), and exits when there's something new, which wakes this session. Keep one wait per pull request. When one ends:
- **Merged or closed:** say so. Don't start another wait for it. If an open pull request is stacked on it, go to step 8. Review is done when every pull request is.
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

- **Code change** (R5, multi-repo R8, D11): the fix is a commit on the task branch of the pull request the comment is on, in that pull request's repo. Route it by repo and number, never by number alone: the same number can exist in two repos (R8.S3). Take the `repo` and task from the `review.opened` for that pull request, then:
  1. Make a worktree of `<head>` in that repo. Write the failing test first, then the fix, as one commit.
  2. A fresh reviewer, named `Review <work> T<n>`, checks that task's diff (the build skill's task review). Fix what it finds.
  3. Run that repo's full suite (the profile's command). If it fails, push nothing and bring the failure to the user (R5.S2).
  4. Merge the fix into the integration branch `factree/<work>` too (local only, never pushed), so it carries the fix.
  5. Push the task branch by the rule in step 8 (a plain push, since it only adds a commit), which also restacks each pull request stacked on it.
  6. Reply on the comment with the commit (`gh api repos/<owner/repo>/pulls/<n>/comments/<id>/replies -f body="Fixed in <sha>: <one line>"`, or `gh pr comment -R <owner/repo>` for a conversation comment) and log `review.reply` with `{"pr","repo","comment":"<id>","kind":"fixed","commit":"<sha>"}`.
- **Behaviour change** (R6): run `/factree:spec` with the comment as the requirement and the pull request as its source. The flow plans and builds the change; then push each task branch the change touches by the rule in step 8 (which restacks what's stacked on it), and reply as above with `"kind":"spec"`.
- **Doesn't hold** (R7): draft a short reply with your reasoning and the line that shows it. Ask it as a decision: log `question.asked` on the spec with `{"n","text":"Reply to <author> on <path>:<line>?","why":"<your reasoning>","proposal":"Post: <the reply>","options":["Change the code instead — treat it as a code change"]}`, and wait as for any decision. Post it only on the user's yes, then log `review.reply` with `"repo"` and `"kind":"disagree"`.

Then start the wait again (step 4).

### 7. Keep it mergeable (review R10)

Repos differ in how a branch catches up with its base, so find this repo's way before changing anything, and assume none:
1. **The repo profile** (`<workspace>/profiles/<project>.md`): a note on how branches are updated or merged.
2. **GitHub's settings:** `gh api repos/{owner}/{repo} --jq '[.allow_merge_commit, .allow_squash_merge, .allow_rebase_merge]'`. If only rebase merges are allowed, the way is rebase.
3. **The repo's own docs:** CLAUDE.md, CONTRIBUTING and the like, for how to update a branch and for any rule about conflicts (a file that's regenerated, a version line, a changelog).
4. **The `update_branch` preference** in `<workspace>/preferences.md`.
5. **Otherwise ask once,** as a decision with a recommendation (merge, which keeps reviewers' comments attached and needs no force-push), and save the answer as `update_branch` so it isn't asked again (R10.S4).

Then:
- **Update the branch** from the base, locally: `git merge origin/<base>`, or for rebase `git rebase origin/<base>`. Update only the pull request's own task branch, never `factree/<work>`. Nothing is pushed yet.
- **Resolve each conflict.** Follow any rule the repo's docs give. Where both sides add separate things, keep both. Where the base and the branch change the same behaviour differently (the same rule, value or text to different ends), or you aren't sure what either side meant, stop: push nothing, and bring the user both versions and your recommendation as one decision (R10.S6).
- **Prove it** before pushing: run the build and the project's full test suite from the repo profile. If anything fails, push nothing and bring the failure to the user (R10.S6).
- **Push the task branch by the rule in step 8,** whichever way it was updated: a plain push after a merge, a force-push with the lease after a rebase, never a force-push without it (R10.S3). The rule logs the new sha and restacks the pull requests stacked on it.
- **Then say so on the pull request** in one comment: what conflicted and how it was resolved, and the checks that passed (R10.S5).

Then start the wait again (step 4). It logs the pull request as mergeable once GitHub agrees.

### 8. Push a task branch, restack what's stacked on it (multi-repo R7, R8.S2, D5)

A pull request stacked on another carries the other's commits, and a squash merge or a fix changes them. This rule is the only way a task branch is pushed: every push of a task head anywhere in this skill (opening, an update push, a fix, a branch update, a restack) goes through it, and so does every merge. Only `factree/` branches Factree created are rebased or pushed, never `factree/<work>`.

**Before every push of a task branch,** capture `<previous tip>`: the last `sha` recorded for that head in `review.opened` or `review.restacked`. A new pull request's branch has none: no previous tip, nothing stacked on it yet, so just push it with `git -C <repo> push -u origin <head>` and let step 3 record its sha in `review.opened`. Otherwise:
1. Push it: a plain `git -C <repo> push origin <head>` when it only adds commits on top of `<previous tip>` (a fix, a merge-style update), otherwise `git -C <repo> push --force-with-lease=<head>:<previous tip> origin <head>`.
2. **If the push is rejected,** plain or leased, someone else pushed to that branch (R7.S2): stop, change nothing (no retry, no force, no log, no restack), tell the user what's on the remote, and ask what to do. While opening a set of pull requests (review step 3), also undo as D16 says.
3. Log `review.restacked` on the work id with `{"pr","repo","task","base","sha"}`, `sha` being the pushed head.
4. Restack each open pull request whose base is this head, in the same repo, with `<new base>` = this head (its pull request is still open) and `<old base tip>` = the captured `<previous tip>` (the events now hold the new sha, so use the captured value). Each restack pushes by this whole rule in turn, so in a chain T1 <- T3 <- T4, T3 is restacked onto T1's new tip with T1's previous tip, then T4 onto T3's new tip with T3's previous tip, captured before T3's own log.

**After a merge** (step 4), the merged head is gone and nothing is pushed for it; its `<previous tip>` is its last recorded `sha`. Only the open pull requests whose own base is the merged head are restacked with `<new base>` = the repo's base branch, and retargeted. Their pushes then restack anything stacked on them by 4 above, as usual: onto their still-open head, without retargeting. In T1 <- T3 <- T4 with T1 merged, T3 moves onto the base branch and is retargeted; T4 moves onto T3's new tip and keeps T3 as its base.

**To restack one pull request** onto `<new base>` from `<old base tip>`:
1. `git -C <repo> fetch origin`. In a worktree of its `<head>`: `git rebase --onto origin/<new base> <old base tip> <head>`. The old base commits drop out.
2. A conflict: resolve it as in step 7, or stop and ask.
3. Run that repo's full suite. If it fails, push nothing and bring the failure to the user.
4. Push it by the rule above (a force-push with the lease).
5. Only if `<new base>` is the repo's base branch (its own base just merged), retarget it: `gh pr edit <n> -R <owner/repo> --base <new base>`. Its diff then shows only its own change (R7.S1).

**Evidence with every claim** (verifying R3): say work is pushed or fixed only right after running the command that shows it, and quote it ("git push: factree/012-review-T2 -> factree/012-review-T2", "npm test: 221 passed").

## Logging events

`bash <plugin>/scripts/event.sh <type> <work> '<json>'`: `review.opened` `{"pr","url","repo","tasks","base","after","sha"}`, `review.reply` `{"pr","repo","comment","kind","commit"}`, `review.restacked` `{"pr","repo","task","base","sha"}`. `review.comment` and `review.state` come from `wait-review.sh`, never by hand.

Run `bash <plugin>/scripts/link.sh <spec-id> <work>` when the pull request opens and end your message with its line, if any.

## Red flags

| Thought | Reality |
|---|---|
| "The reviewer's right, I'll just change it" | Check it against the code first. Then a test-first fix on the task branch, reviewed and tested, before anything is pushed. |
| "It's a one-line fix, I'll push it straight away" | Every push runs the full test suite first. A reviewer must never see code Factree hasn't built and tested. |
| "The reviewer wants new behaviour, I'll add it to the fix" | Behaviour changes go through the spec. Run /factree:spec. |
| "They're wrong, I'll reply and move on" | A reply that disagrees speaks for the user. Ask first. |
| "I'll force-push the rebase" | Only by step 8, with `--force-with-lease=<head>:<previous tip>`, and only a `factree/` task branch. Any rejected push means someone else pushed: change nothing, ask. |
| "It's approved, I'll merge it" | Never. Merging is the reviewers' and the user's. |
| "gh isn't there, I'll push with git and open it later" | No gh, no push. Say how to install it and stop. |
