---
name: init
description: Set up a Factree workspace where you want it — in this repo, in a parent folder shared by several repos, or in a central folder — with starting preferences and a first look at the repo. Optional: every Factree command creates a local workspace on first use. Use when the user asks to set up, initialise or move where Factree keeps its specs, or to change its starting preferences.
argument-hint: "[here | parent | central <folder>]"
---

# Init

Every Factree command already creates a workspace the first time it's used in a git repo, local only (workspace-setup R1, R2). This command is for when the default isn't what the user wants. `<plugin>` is two levels up from this skill's base directory.

Input: $ARGUMENTS

<HARD-GATE>
Never put a Factree file in a git repo: keep workspaces out of git through `.git/info/exclude` only, never a tracked `.gitignore`, and never stage anything. On an existing workspace, change only what the user asks, and never delete or move a spec, plan, event or lesson.
</HARD-GATE>

## Process

### 1. What's there now

Run `bash <plugin>/scripts/root.sh` and note whether it exits 0 (a workspace exists: say where, and how many specs and plans it holds) or 1. Note whether this folder is in a git repo (`git rev-parse --show-toplevel`).

### 2. One brief (workspace-setup R4)

Ask only what isn't already settled by the input, as one decision brief:

```
Decisions for you
1. Where should the workspace live? → this repo, <repo>/.factree (recommended)
2. Starting preferences? → flow: auto, review_budget: 300 (recommended)
Reply "yes", or e.g. "1: parent folder". Say "options" for the others.
```

With a workspace already there, ask only about what the user wants to change.

### 3. Set it up

- **This repo or a parent folder:** create `<folder>/.factree/`. For each git repo it sits in or serves, keep it out of git: if `git check-ignore -q .factree/` fails there, add `.factree/` to the file `git rev-parse --git-path info/exclude` names. (For this repo, `bash <plugin>/scripts/init.sh` does exactly this.)
- **A central folder:** create it, then tell the user the exact line to add to their shell profile, for example `export FACTREE_HOME=~/factree`, and that Claude Code must be restarted to see it. Don't edit their shell profile or settings yourself.
- **Preferences:** write the chosen keys to `<workspace>/preferences.md`, keeping any lines already there that the user didn't ask to change (format: `<plugin>/shared/preferences.md`).
- **A first look at the repo:** run `bash <plugin>/scripts/detect.sh <repo>` and build `<workspace>/profiles/<project>.md` as `<plugin>/shared/profile.md` describes, unless a current one exists.

### 4. Report

In at most 5 lines (`<plugin>/shared/writing.md`): where the workspace is, that it's local only (never in the repo), the preferences set, the profile built, and how to start: `/factree:spec <requirement>`.

**Evidence with every claim** (verifying R3): say a folder was created or a file written only after the command that did it, and quote it.

## Red flags

| Thought | Reality |
|---|---|
| "I'll add .factree/ to .gitignore, it's simpler" | .gitignore is tracked. Use .git/info/exclude; nothing of Factree's goes in the repo. |
| "I'll set FACTREE_HOME in their shell profile for them" | Tell them the line. Their profile and settings are theirs to edit. |
| "Moving the workspace means copying the old one over" | Init never moves or deletes anything. Say how to move it by hand if they ask. |
