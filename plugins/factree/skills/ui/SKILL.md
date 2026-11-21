---
name: ui
description: Start the Factree UI, a local page showing the workspace's specs, open questions, decisions and what each Claude Code session is doing. Use when the user asks to open, start or stop the Factree UI or dashboard.
argument-hint: "[stop]"
disable-model-invocation: true
---

Start or stop the Factree UI. `<plugin>` is two levels up from this skill's base directory.

Input: $ARGUMENTS

- **Start** (no argument): run `bash <plugin>/scripts/ui.sh`. It starts a small local server in the background for the current workspace, or reports the one already running. Tell the user the URL it prints, in one line, and that the page updates live as specs change.
- **Stop** (argument `stop`): run `bash <plugin>/scripts/ui.sh --stop` and relay the result.
- **Different port** (the user asks for one): add `--port <n>`.

If it reports that Node.js is missing, say the UI needs Node.js 20 or later and that everything else in Factree works without it. If there's no workspace yet, suggest `/factree:spec` first.

The UI only reads: specs stay markdown files, and approvals and answers still happen in Claude Code.
