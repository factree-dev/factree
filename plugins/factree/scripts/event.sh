#!/usr/bin/env bash
# Append one event to events.jsonl in the Factree workspace (see root.sh).
# Usage: event.sh <type> <subject-id> ['<json object>']
#   subject-id is a spec id for spec.*, question.*, decision.*; a work id for plan.*
# Example: event.sh spec.approved link-report '{"by":"John Doe"}'
# Inside Claude Code, the event also records the session (CLAUDE_CODE_SESSION_ID).

types="spec.created spec.updated spec.approved spec.step question.asked question.answered question.opened question.resolved decision.recorded plan.created plan.design_approved plan.approved plan.implemented task.started task.done task.failed task.blocked spec.verified decision.feedback task.reviewed bug.escaped lesson.proposed lesson.approved lesson.rejected review.opened review.comment review.state review.reply stage.step agent.started task.waiting"

type="$1"; subject="$2"; data="${3:-}"
[ -z "$data" ] && data='{}'
if [ -z "$type" ] || [ -z "$subject" ]; then
  echo "usage: event.sh <type> <subject-id> ['<json object>']" >&2; exit 2
fi
case " $types " in
  *" $type "*) ;;
  *) echo "unknown event type '$type' (expected one of: $types)" >&2; exit 2 ;;
esac
case "$data" in
  \{*\}) ;;
  *) echo "data must be a JSON object, e.g. '{\"by\":\"John Doe\"}'" >&2; exit 2 ;;
esac

root=$(bash "$(dirname "$0")/root.sh")
mkdir -p "$root"
actor=$(git config user.name 2>/dev/null || whoami)
actor=$(printf '%s' "$actor" | sed 's/\\/\\\\/g; s/"/\\"/g')
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cwd=$(printf '%s' "$PWD" | sed 's/\\/\\\\/g; s/"/\\"/g')
case "$type" in plan.*|task.*|review.*|agent.*) key="work" ;; *) key="spec" ;; esac
# The Claude Code session logging this, so the UI can offer to resume it (spec-sessions R1). Ids are [A-Za-z0-9_-] only.
session=""
case "${CLAUDE_CODE_SESSION_ID:-}" in ""|*[!A-Za-z0-9_-]*) ;; *) session=",\"session\":\"$CLAUDE_CODE_SESSION_ID\"" ;; esac

# The Factree version that logged it, so a stale install can be spotted (version-check R1).
v=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9][0-9.]*\)".*/\1/p' "$(dirname "$0")/../.claude-plugin/plugin.json" 2>/dev/null | head -n1)
version=""; [ -n "$v" ] && version=",\"v\":\"$v\""

printf '{"ts":"%s","type":"%s","%s":"%s","actor":"%s","cwd":"%s"%s%s,"data":%s}\n' \
  "$ts" "$type" "$key" "$subject" "$actor" "$cwd" "$session" "$version" "$data" >> "$root/events.jsonl"
