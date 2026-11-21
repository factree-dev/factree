#!/usr/bin/env bash
# Print a path link to a spec (or one of its plans) in the running Factree UI, for skills to show the user.
# Usage: link.sh <spec-id> [work-id]
# Prints "View in Factree: <url>" when the UI is running for this workspace, and nothing otherwise.

spec="$1"; work="$2"
[ -n "$spec" ] || { echo "usage: link.sh <spec-id> [work-id]" >&2; exit 2; }
root=$(bash "$(dirname "$0")/root.sh") || exit 0
info="$root/ui.json"
pid=$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$info" 2>/dev/null | head -n1)
url=$(sed -n 's/.*"url":"\([^"]*\)".*/\1/p' "$info" 2>/dev/null | head -n1)
[ -n "$pid" ] && [ -n "$url" ] && kill -0 "$pid" 2>/dev/null || exit 0
if [ -n "$work" ]; then printf 'View in Factree: %s/work/%s/plan/%s\n' "$url" "$spec" "$work"; else printf 'View in Factree: %s/work/%s/spec\n' "$url" "$spec"; fi
