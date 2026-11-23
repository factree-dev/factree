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

# Each pull request (work and repo) whose newest review.opened has no merged or closed state logged.
grep '"type":"review.opened"' "$log" | while read -r line; do
  printf '%s\037%s\037%s\n' "$(echo "$line" | json_field work)" "$(echo "$line" | json_field repo)" "$(echo "$line" | json_field pr)"
done | awk -F'\037' '{ k = $1 FS $2; if (!(k in seen)) { seen[k] = 1; order[++n] = k } pr[k] = $3 } END { for (i = 1; i <= n; i++) print order[i] FS pr[order[i]] }' |
while IFS="$(printf '\037')" read -r work repo pr; do
  [ -n "$work" ] && [ -n "$pr" ] || continue
  rpat=""; [ -n "$repo" ] && rpat=".*\"repo\":\"$repo\""
  done_state=$(grep "\"type\":\"review.state\",\"work\":\"$work\"$rpat" "$log" | grep "\"pr\":\"$pr\"" | tail -n1 | json_field state)
  case "$done_state" in MERGED|CLOSED) continue ;; esac
  bash "$here/wait-review.sh" "$work" ${repo:+"$repo"} "$pr" --once >/dev/null 2>&1
done
exit 0
