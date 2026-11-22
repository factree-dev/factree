#!/usr/bin/env bash
# Claude Code PreToolUse hook on Agent|Task: log an agent.started event for Factree's own subagents,
# named "Build <work> T<n>" or "Review <work> T<n>" (parallel-build R7). The review gate in task-done.sh
# needs this event, which comes from the harness rather than from the model.
# Does nothing, silently, for any other subagent or when no Factree workspace exists. Always exits 0.

here="$(cd "$(dirname "$0")" && pwd)"
input=$(cat 2>/dev/null || true)
# tool_input.description / tool_input.model: nested, so read from the raw JSON (the first match wins).
desc=$(printf '%s' "$input" | sed -n 's/.*"description"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
model=$(printf '%s' "$input" | sed -n 's/.*"model"[[:space:]]*:[[:space:]]*"\([A-Za-z0-9_.:-]*\)".*/\1/p' | head -n1)
cwd=$(printf '%s' "$input" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -z "$cwd" ] && cwd="$PWD"

printf '%s' "$desc" | grep -qE '^(Build|Review) [A-Za-z0-9_.-]+ T[0-9]+' || exit 0
case "$desc" in Build*) role=build ;; *) role=review ;; esac
work=$(printf '%s' "$desc" | awk '{print $2}')
task=$(printf '%s' "$desc" | awk '{print $3}' | sed 's/^\(T[0-9]*\).*/\1/')

root=$(cd "$cwd" 2>/dev/null && bash "$here/root.sh" 2>/dev/null) || exit 0
[ -d "$root" ] || exit 0
(cd "$cwd" && bash "$here/event.sh" agent.started "$work" "{\"role\":\"$role\",\"task\":\"$task\",\"model\":\"$model\"}" >/dev/null 2>&1)
exit 0
