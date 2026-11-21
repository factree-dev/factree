#!/usr/bin/env bash
# Find the Factree workspace, or create it on first use, local only (spec workspace-setup R1–R3).
# Usage: init.sh [start-dir]      (default: current directory)
#
# A workspace that root.sh finds is used as it is. Otherwise, inside a git repo, <repo root>/.factree/ is created and
# kept out of the repo through .git/info/exclude (an untracked file), unless the repo already ignores it. Outside a git
# repo nothing is created: the user chooses where with /factree:init.
# Prints the workspace path on its last line (after "Created …" when it was just created) and exits 0;
# exits 3 outside a git repo with nothing created.
here="$(cd "$(dirname "$0")" && pwd)"
start="${1:-$PWD}"
root=$(bash "$here/root.sh" "$start") && { printf '%s\n' "$root"; exit 0; }
[ -n "$root" ] || exit 2
if [ -n "$FACTREE_HOME" ]; then mkdir -p "$FACTREE_HOME" && printf 'Created a Factree workspace in %s\n%s\n' "$FACTREE_HOME" "$FACTREE_HOME"; exit 0; fi

repo=$(git -C "$start" rev-parse --show-toplevel 2>/dev/null) || {
  echo "No Factree workspace here, and this folder isn't in a git repo, so none was created."
  echo "Open a git repo and run the command there, or run /factree:init to choose where the workspace goes."
  exit 3
}
ws="$repo/.factree"
mkdir -p "$ws"
# Local only: ignored through the repo's own exclude file, never a tracked .gitignore (workspace-setup R2).
if ! git -C "$repo" check-ignore -q .factree/ 2>/dev/null; then
  exclude=$(cd "$repo" && git rev-parse --git-path info/exclude)
  case "$exclude" in /*) ;; *) exclude="$repo/$exclude" ;; esac
  mkdir -p "$(dirname "$exclude")"
  printf '.factree/\n' >> "$exclude"
fi
printf 'Created a Factree workspace in %s (local only)\n%s\n' "$ws" "$ws"
