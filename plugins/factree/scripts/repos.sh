#!/usr/bin/env bash
# The workspace's repo list, repos.md: one repo folder per line, relative to the folder that holds .factree/ ("." for one repo).
# Usage: repos.sh list                 print the listed repo folders
#        repos.sh of <path>            print the repo folder that holds <path> (the longest listed folder wins); exit 1 if none.
#                                      Pure lookup: never writes.
#        repos.sh add <folder>         append <folder> if it is a git repo and not listed yet
# <path> and <folder> are absolute, or relative to the current directory.
here="$(cd "$(dirname "$0")" && pwd)"
ws=$(bash "$here/root.sh") || { echo "no Factree workspace here" >&2; exit 2; }
base=$(dirname "$ws")
list="$ws/repos.md"

# Absolute, symlink-resolved form of a path whose folders may not exist yet: resolve the nearest existing ancestor, then
# put the rest back.
absolute() {
  case "$1" in /*) p="$1" ;; *) p="$PWD/$1" ;; esac
  rest=""
  while [ ! -d "$p" ] && [ "$p" != "/" ]; do rest="/$(basename "$p")$rest"; p=$(dirname "$p"); done
  p=$(cd "$p" && pwd -P)
  [ "$p" = "/" ] && p=""
  printf '%s\n' "$p$rest"
}
# A listed folder relative to the workspace base, as an absolute path.
listed_abs() { case "$1" in .) printf '%s\n' "$base" ;; *) printf '%s/%s\n' "$base" "$1" ;; esac; }

cmd="${1:-list}"
case "$cmd" in
  list) [ -f "$list" ] && grep -v '^[[:space:]]*$' "$list"; exit 0 ;;
  of)
    [ -n "$2" ] || { echo "usage: repos.sh of <path>" >&2; exit 2; }
    target=$(absolute "$2"); base=$(cd "$base" && pwd -P)
    [ -f "$list" ] || exit 1
    best=""; bestlen=0
    while IFS= read -r r; do
      [ -n "$r" ] || continue
      a=$(listed_abs "$r")
      case "$target/" in "$a"/*) [ ${#a} -gt $bestlen ] && { best="$r"; bestlen=${#a}; } ;; esac
    done < "$list"
    [ -n "$best" ] && { printf '%s\n' "$best"; exit 0; }
    exit 1 ;;
  add)
    [ -n "$2" ] || { echo "usage: repos.sh add <folder>" >&2; exit 2; }
    dir=$(absolute "$2"); base=$(cd "$base" && pwd -P)
    [ -e "$dir/.git" ] || { echo "$2 is not a git repo; not added" >&2; exit 1; }
    case "$dir" in "$base") rel="." ;; "$base"/*) rel="${dir#"$base"/}" ;; *) echo "$2 is outside the workspace folder; not added" >&2; exit 1 ;; esac
    grep -qxF -- "$rel" "$list" 2>/dev/null && exit 0
    printf '%s\n' "$rel" >> "$list"; exit 0 ;;
  *) echo "usage: repos.sh list | of <path> | add <folder>" >&2; exit 2 ;;
esac
