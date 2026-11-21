#!/usr/bin/env bash
# Catch up on pull requests still open in the log, so a merge, close or review decision shows even when no wait was
# following it (review R11). Run by the session hook in the background; prints nothing.
# Skips everything without the GitHub CLI, and runs at most every FACTREE_CATCHUP_EVERY seconds (config.sh).
here=$(cd "$(dirname "$0")" && pwd)
. "$here/lib.sh"
command -v gh >/dev/null 2>&1 || exit 0
root=$(bash "$here/root.sh" "$PWD") || exit 0
log="$root/events.jsonl"; stamp="$root/review-catchup.at"
[ -f "$log" ] || exit 0
every=${FACTREE_CATCHUP_EVERY:-$FACTREE_CATCHUP_EVERY_DEFAULT}; now=$(date +%s)
last=$(cat "$stamp" 2>/dev/null || echo 0)
[ $(( now - last )) -lt "$every" ] && exit 0
echo "$now" > "$stamp"

# Each work whose newest pull request has no merged or closed state logged.
grep '"type":"review.opened"' "$log" | sed -n 's/.*"work":"\([^"]*\)".*/\1/p' | sort -u | while read -r work; do   # every work (json_field reads one line)
  [ -n "$work" ] || continue
  pr=$(grep "\"type\":\"review.opened\",\"work\":\"$work\"" "$log" | tail -n1 | json_field pr)
  done_state=$(grep "\"type\":\"review.state\",\"work\":\"$work\"" "$log" | grep "\"pr\":\"$pr\"" | tail -n1 | json_field state)
  case "$done_state" in MERGED|CLOSED) continue ;; esac
  bash "$here/wait-review.sh" "$work" "$pr" --once >/dev/null 2>&1
done
exit 0
