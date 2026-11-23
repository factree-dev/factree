#!/usr/bin/env bash
# Build three git repos under <dir>: frontend (base branch develop), backend and infra (base branch main).
# Each has one commit and a bare origin (<dir>/origins/<name>.git) it is pushed to.
# Usage: make.sh <dir>
dir="${1:?usage: make.sh <dir>}"
mkdir -p "$dir/origins"
for spec in frontend:develop backend:main infra:main; do
  name=${spec%%:*}; base=${spec##*:}
  git init -q --bare -b "$base" "$dir/origins/$name.git"
  git init -q -b "$base" "$dir/$name"
  echo "$name" > "$dir/$name/README.md"
  git -C "$dir/$name" add README.md
  git -C "$dir/$name" -c user.email=t@t -c user.name=t commit -q -m "initial commit"
  git -C "$dir/$name" remote add origin "$dir/origins/$name.git"
  git -C "$dir/$name" push -q origin "$base"
done
