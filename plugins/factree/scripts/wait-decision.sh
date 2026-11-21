#!/usr/bin/env bash
# Wait in the background for a decision made in the Factree companion on one spec (and its plan), then print it
# and exit, so Claude Code wakes the session that started the wait (companion-decisions R8).
# Usage: wait-decision.sh <spec> [work]     Run by the spec and plan skills with run_in_background after asking.
# FACTREE_WAIT_EVERY (seconds between checks, default 2) and FACTREE_WAIT_FOR (default 8 hours) are for tests.
spec=${1:?usage: wait-decision.sh <spec> [work]}; work=${2:-}
here=$(cd "$(dirname "$0")" && pwd)
root=$(bash "$here/root.sh" "$PWD") || exit 0
log="$root/events.jsonl"
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
every=${FACTREE_WAIT_EVERY:-$FACTREE_DECISION_EVERY_DEFAULT}; limit=${FACTREE_WAIT_FOR:-$FACTREE_WAIT_FOR_DEFAULT}
# In a Claude Code session, look from when its current turn began and skip what it already has, so a decision made
# between two waits isn't lost and none comes twice (factory-flow R6). Elsewhere, only decisions after the wait began.
sid=${CLAUDE_CODE_SESSION_ID:-}; case "$sid" in *[!A-Za-z0-9_-]*) sid="" ;; esac
since=""; delivered=""
if [ -n "$sid" ]; then
  since=$(sed -n 's/.*"prompted":"\([^"]*\)".*/\1/p' "$root/sessions/$sid.json" 2>/dev/null | head -n1)
  mkdir -p "$root/sessions"; delivered="$root/sessions/$sid.delivered"
fi
[ -z "$since" ] && since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
start=$(date +%s)
while :; do
  if [ -f "$log" ]; then
    out=$(bash "$here/decisions-since.sh" "$log" "$since" "$spec" "$work" "$delivered")
    if [ -n "$out" ]; then printf 'Decided in the Factree companion:\n%s\n' "$out"; exit 0; fi
  fi
  if [ $(( $(date +%s) - start )) -ge "$limit" ]; then
    echo "No decision in the companion yet on $spec${work:+ ($work)}. It will reach you with the user's next message."
    exit 0
  fi
  sleep "$every"
done
