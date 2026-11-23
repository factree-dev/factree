#!/usr/bin/env bash
# The repo each task of a plan works in, from the paths on its **Files** lines (backticked, text in parentheses ignored).
# Usage: plan-repos.sh <work-dir>
# Prints "T<n><TAB><repo>" per task. Problems go to stderr, one per line, and the exit is 1:
#   T<n> spans repos <a>, <b>        T<n>: <file> is in no repo
# Without a repos.md in the workspace (<work-dir>/../..) every task is ".". A task with no Files paths is ".".
work="${1:?usage: plan-repos.sh <work-dir>}"
here="$(cd "$(dirname "$0")" && pwd)"
ws=$(cd "$work/../.." && pwd -P) || exit 2
base=$(dirname "$ws"); bad=0
tfiles=("$work/tasks.md"); for f in "$work"/*/tasks.md; do tfiles+=("$f"); done
pairs=$(for f in "${tfiles[@]}"; do [ -f "$f" ] && awk '
  /^### T[0-9]+:/ { t = $2; sub(/:.*/, "", t); infiles = 0; print t "\t"; next }
  /^\*\*Files\*\*/ { infiles = 1; next }
  /^\*\*/ || /^### / { infiles = 0 }
  infiles && /^- [A-Za-z]+:/ {
    line = $0; gsub(/\([^)]*\)/, "", line)
    while (match(line, /`[^`]+`/)) { print t "\t" substr(line, RSTART + 1, RLENGTH - 2); line = substr(line, RSTART + RLENGTH) }
  }' "$f"; done)
for t in $(printf '%s\n' "$pairs" | cut -f1 | awk '!(($0) in seen) { seen[$0] = 1; print }'); do
  repos=""
  while IFS=$'\t' read -r tt p; do
    [ "$tt" = "$t" ] && [ -n "$p" ] || continue
    if [ -f "$ws/repos.md" ]; then
      r=$(cd "$base" && FACTREE_HOME="$ws" bash "$here/repos.sh" of "$p") || { echo "$t: $p is in no repo" >&2; bad=1; continue; }
    else r="."; fi
    case " $repos " in *" $r "*) ;; *) repos="$repos $r" ;; esac
  done <<< "$pairs"
  set -- $repos
  if [ $# -gt 1 ]; then echo "$t spans repos $(echo "$*" | sed 's/ /, /g')" >&2; bad=1; fi
  printf '%s\t%s\n' "$t" "${1:-.}"
done
exit $bad
