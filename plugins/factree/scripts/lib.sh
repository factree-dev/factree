#!/usr/bin/env bash
# Helpers shared by Factree's scripts (codebase-health R4). Source it from a script with:
#   . "$(cd "$(dirname "$0")" && pwd)/lib.sh"
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/config.sh"

# $1 with backslashes and double quotes escaped, for a JSON string.
json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# The string value of field $1 in the JSON on stdin (first line that has it).
json_field() { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n1; }
