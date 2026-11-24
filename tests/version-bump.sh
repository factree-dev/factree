#!/usr/bin/env bash
# Usage: version-bump.sh <base-ref>   (run in the repo root)
# Fails when plugins/factree changed since <base-ref> but plugin.json's version did not, or when
# the README badge is not the plugin.json version (releases R2, R3).
P=plugins/factree
J=$P/.claude-plugin/plugin.json
base=${1:?usage: version-bump.sh <base-ref>}
ver() { sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1; }
git rev-parse --verify -q "$base^{commit}" >/dev/null || { git rev-parse --verify "$base^{commit}"; exit 2; }
v=$(ver < $J)
b=$(sed -n 's/.*badge\/version-\([^-]*\)-.*/\1/p' README.md | head -n1)
if [ "$b" != "$v" ]; then echo "README badge says $b but plugin.json says $v"; exit 1; fi
changed=$(git diff --name-only "$base...HEAD" -- $P/) || exit 2
[ -z "$changed" ] && exit 0
old=$(git show "$base:$J" 2>/dev/null | ver)
if [ "$old" = "$v" ]; then echo "$P changed but the version is still $v; bump it in plugin.json and the README badge"; exit 1; fi
exit 0
