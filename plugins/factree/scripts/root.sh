#!/usr/bin/env bash
# Print the Factree workspace folder (the directory that holds specs/, work/, profiles/).
# Usage: root.sh [start-dir]      (default: current directory)
#
# Lookup order:
#   1. $FACTREE_HOME, if set (a central place, possibly its own repo)
#   2. the nearest .factree/ folder in start-dir or any parent (shared by repos below it)
#   3. <git repo root>/.factree, or <start-dir>/.factree outside git (to be created)
#
# Prints the path, then exits 0 if it already exists, 1 if it would need creating.

start="${1:-$PWD}"
start=$(cd "$start" 2>/dev/null && pwd) || { echo "no such directory: $1" >&2; exit 2; }

if [ -n "$FACTREE_HOME" ]; then
  printf '%s\n' "$FACTREE_HOME"
  [ -d "$FACTREE_HOME" ] && exit 0 || exit 1
fi

dir="$start"
while :; do
  if [ -d "$dir/.factree" ]; then printf '%s\n' "$dir/.factree"; exit 0; fi
  [ "$dir" = "/" ] && break
  dir=$(dirname "$dir")
done

# --show-cdup keeps the logical path; --show-toplevel resolves symlinks (/var → /private/var on macOS)
if cdup=$(git -C "$start" rev-parse --show-cdup 2>/dev/null); then
  top=$(cd "$start/$cdup" && pwd)
else
  top="$start"
fi
printf '%s\n' "$top/.factree"
exit 1
