#!/usr/bin/env bash
# Wait in the background for activity on a plan's pull request, log it, and exit so Claude Code wakes the session
# that started the wait (spec review R3).
# Usage: wait-review.sh <work> [repo] [pr]   The pull request defaults to the newest review.opened for <work> (and <repo>).
# A work with pull requests in several repos needs the repo named. gh runs with -R <owner/repo> parsed from that
# repo's origin remote (the repo folder is relative to the folder holding .factree/); an event with no repo is the
# current repo. Events logged carry "repo" (multi-repo R8).
# Checks every FACTREE_WAIT_EVERY seconds (default 300) for up to FACTREE_WAIT_FOR seconds (default 8 hours).
# Logs each new comment once (review.comment) and each change of state (review.state), and prints one line each:
#   review: comment by <author> on <path>:<line>     review: CHANGES_REQUESTED | APPROVED | CONFLICTING | MERGED | CLOSED
# CONFLICTING: GitHub says the open pull request conflicts with its base (review R10). When it's mergeable again the
# wait logs OPEN without waking the session, since the session that resolved it already knows.
# Reads GitHub only through the GitHub CLI, using its built-in --jq, so no other tools are needed.
# --once checks a single time and exits, for the session hook's catch-up (review R11).
once=""; args=(); for a in "$@"; do [ "$a" = "--once" ] && once=1 || args+=("$a"); done
work=${args[0]:?usage: wait-review.sh <work> [repo] [pr] [--once]}; repo=""; pr=""
case "${args[1]:-}" in ""|*[!0-9]*) repo=${args[1]:-}; pr=${args[2]:-} ;; *) pr=${args[1]} ;; esac   # a number is a pr (old form)
here=$(cd "$(dirname "$0")" && pwd)
root=$(bash "$here/root.sh" "$PWD") || exit 0
log="$root/events.jsonl"
. "$here/lib.sh"
opened=$(grep "\"type\":\"review.opened\",\"work\":\"$work\"" "$log" 2>/dev/null)
if [ -z "$repo" ]; then
  repos=$(echo "$opened" | while read -r l; do [ -n "$l" ] && echo "$l" | json_field repo; done | sort -u)
  [ "$(echo "$repos" | grep -c .)" -gt 1 ] && { echo "review: $work has pull requests in several repos ($(echo $repos | tr ' ' ',')): name one, wait-review.sh $work <repo>"; exit 0; }
  repo=$repos
fi
[ -n "$repo" ] && opened=$(echo "$opened" | grep -F "\"repo\":\"$repo\"")
[ -z "$pr" ] && pr=$(echo "$opened" | tail -n1 | json_field pr)
[ -z "$pr" ] && { echo "review: no pull request logged for $work${repo:+ in $repo}"; exit 0; }
# gh's target: the owner/repo of the repo's origin (https or ssh), else the current repo with gh's own placeholders.
rarg=(); slug="{owner}/{repo}"
if [ -n "$repo" ]; then
  url=$(git -C "$(dirname "$root")/$repo" remote get-url origin 2>/dev/null)
  slug=$(echo "$url" | sed -n -e 's#^https://github\.com/##p' -e 's#^ssh://git@github\.com/##p' -e 's#^git@github\.com:##p' | sed 's#\.git$##; s#/$##' | grep '^[^/][^/]*/[^/][^/]*$')
  [ -z "$slug" ] && { echo "review: $repo's origin is not a GitHub remote (${url:-none}), so its pull request can't be followed"; exit 0; }
  rarg=(-R "$slug")
fi
rjson=""; [ -n "$repo" ] && rjson=",\"repo\":\"$repo\""   # logged on this repo's events
rpat=""; [ -n "$repo" ] && rpat=".*\"repo\":\"$(printf %s "$repo" | sed 's/[].[*^$\\]/\\&/g')\""   # matched reading back (. literal)
every=${FACTREE_WAIT_EVERY:-$FACTREE_REVIEW_EVERY_DEFAULT}; limit=${FACTREE_WAIT_FOR:-$FACTREE_WAIT_FOR_DEFAULT}
# jq has already turned newlines and tabs in comment bodies into spaces; json_escape handles backslashes and quotes.
# Run gh and print only its answer (stdout): gh also prints notes and hints on stderr, which are not comments
# (review R3.S3). On failure print "review: gh failed: <first stderr line>" and fail, so the caller stops the wait.
gh_or_stop() {
  err=$(mktemp); out=$("$@" 2>"$err") || { echo "review: gh failed: $(head -n1 "$err")"; rm -f "$err"; return 1; }
  rm -f "$err"; printf '%s' "$out"
}
start=$(date +%s)
while :; do
  found=0
  # Comments on lines and on the conversation, each logged once by its id.
  # Fields joined by the unit separator, not tabs: bash's read collapses empty tab-separated fields, which shifted a
  # conversation comment's text into its path (review R3.S4).
  jqc='.[] | [(.id|tostring), .user.login, (.path // ""), ((.line // .original_line // "")|tostring), (.body | gsub("[\\n\\t]"; " "))] | join("\u001f")'
  comments=$(gh_or_stop gh api "repos/$slug/pulls/$pr/comments" --jq "$jqc") || { echo "$comments"; exit 0; }
  more=$(gh_or_stop gh api "repos/$slug/issues/$pr/comments" --jq "$jqc") || { echo "$more"; exit 0; }
  while IFS="$(printf '\037')" read -r id author path line body; do
    [ -n "$id" ] || continue
    grep -q "\"type\":\"review.comment\",\"work\":\"$work\".*\"pr\":\"$pr\",\"id\":\"$id\"$rpat" "$log" 2>/dev/null && continue
    bash "$here/event.sh" review.comment "$work" "{\"pr\":\"$pr\",\"id\":\"$id\",\"author\":\"$(json_escape "$author")\",\"path\":\"$(json_escape "$path")\",\"line\":\"$line\",\"body\":\"$(json_escape "$body")\"$rjson}" || exit 1
    if [ -n "$path" ]; then echo "review: comment by $author on $path${line:+:$line}"; else echo "review: comment by $author on the pull request"; fi
    found=1
  done <<EOF
$comments
$more
EOF
  # State: merged or closed; else a conflict with the base (UNKNOWN means GitHub is still working it out, not a
  # conflict); else the review decision (changes requested, approved). Fields are never empty, so they split cleanly.
  st=$(gh_or_stop gh pr view "$pr" "${rarg[@]}" --json state,mergeable,reviewDecision --jq '.state + " " + (.mergeable // "UNKNOWN") + " " + (.reviewDecision // "NONE")') || { echo "$st"; exit 0; }
  set -- $st
  now=$1
  if [ "$1" = "OPEN" ]; then
    if [ "$2" = "CONFLICTING" ]; then now=CONFLICTING; else now=${3:-NONE}; fi
    case "$now" in NONE|REVIEW_REQUIRED) now=OPEN ;; esac
  fi
  last=$(grep "\"type\":\"review.state\",\"work\":\"$work\"$rpat" "$log" 2>/dev/null | grep -F "\"pr\":\"$pr\"" | tail -n1 | json_field state)
  if [ "$now" = "OPEN" ]; then
    if [ "$last" = "CONFLICTING" ]; then   # resolved: log it quietly (review R10.S2)
      bash "$here/event.sh" review.state "$work" "{\"pr\":\"$pr\",\"state\":\"OPEN\"$rjson}" || exit 1
    fi
  elif [ "$now" != "$last" ]; then
    bash "$here/event.sh" review.state "$work" "{\"pr\":\"$pr\",\"state\":\"$now\"$rjson}" || exit 1
    echo "review: $now"; found=1
  fi
  [ "$found" = 1 ] && exit 0
  case "$now" in MERGED|CLOSED) exit 0 ;; esac
  [ -n "$once" ] && exit 0
  if [ $(( $(date +%s) - start )) -ge "$limit" ]; then echo "No review activity yet on $work."; exit 0; fi
  sleep "$every"
done
