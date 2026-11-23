#!/usr/bin/env bash
# The pull requests of a plan, in merge order.
# Usage: pr-plan.sh <work-dir>
# Prints one line per pull request, tab-separated: tasks (T1,T2), repo, head branch, base branch, after.
#   head   factree/<work>-T<n>, the branch of the PR's last task
#   base   the repo's base branch, or the head of the PR holding the task's highest-numbered same-repo dependency
#   after  PR heads (same repo) or repo#T1+T2 (other repos) that merge first, comma-separated, or -
# A chain of tasks in one repo shares a PR when each depends only on the one before it, nothing else depends on the
# earlier ones, and their Est. diff sums to at most review_budget (plan.md, default 300).
# The repo's base branch: a "base: <name>" line in <workspace>/profiles/<repo>.md, else origin/HEAD, else the
# remote's default branch (git ls-remote --symref), else main.
work="${1:?usage: pr-plan.sh <work-dir>}"
here="$(cd "$(dirname "$0")" && pwd)"
ws=$(cd "$work/../.." && pwd -P) || exit 2
work=$(cd "$work" && pwd -P); name=$(basename "$work"); top=$(dirname "$ws")
budget=$(awk '/^review_budget:/ { print $2; exit }' "$work/plan.md" 2>/dev/null); budget=$(( ${budget:-300} + 0 ))
[ "$budget" -gt 0 ] || budget=300
repos=$(bash "$here/plan-repos.sh" "$work") || exit 1   # its problems go to stderr, once
tfiles=("$work/tasks.md"); for f in "$work"/*/tasks.md; do tfiles+=("$f"); done
base_of() {
  local r=$1 dir prof b
  dir="$top/$r"; [ "$r" = . ] && dir="$top"; prof="$ws/profiles/$(basename "$dir").md"
  b=$(awk '/^base:/ { sub(/^base:[ \t]*/, ""); print; exit }' "$prof" 2>/dev/null)
  [ -n "$b" ] || b=$(git -C "$dir" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
  [ -n "$b" ] || b=$(GIT_TERMINAL_PROMPT=0 git -C "$dir" ls-remote --symref origin HEAD 2>/dev/null | awk '$1 == "ref:" { sub(/^refs\/heads\//, "", $2); print $2; exit }')
  echo "${b:-main}"
}
for f in "${tfiles[@]}"; do [ -f "$f" ] && cat "$f"; done | REPOS="$repos" awk -v BUDGET="$budget" -v NAME="$name" '
  BEGIN {
    nl = split(ENVIRON["REPOS"], rl, "\n")
    for (i = 1; i <= nl; i++) { split(rl[i], kv, "\t"); repo[substr(kv[1], 2) + 0] = kv[2] }
  }
  /^### T[0-9]+:/ { t = $2; sub(/:.*/, "", t); cur = substr(t, 2) + 0; ids[cur] = 1; if (cur > top) top = cur; next }
  /^\*\*Depends on:\*\*/ {
    line = $0; gsub(/\([^)]*\)/, "", line); sub(/^\*\*Depends on:\*\*/, "", line); nd = 0
    while (match(line, /T[0-9]+/)) { nd++; dep[cur, nd] = substr(line, RSTART + 1, RLENGTH - 1) + 0; line = substr(line, RSTART + RLENGTH) }
    ndep[cur] = nd; next
  }
  /^\*\*Est\. diff:\*\*/ { line = $0; if (match(line, /[0-9]+/)) est[cur] = substr(line, RSTART, RLENGTH) + 0 }
  function head(g) { return "factree/" NAME "-T" last[g] }
  function addafter(g, s) { if (!((g SUBSEP s) in seen)) { seen[g SUBSEP s] = 1; aft[g] = aft[g] (aft[g] == "" ? "" : ",") s } }
  END {
    for (n = 1; n <= top; n++) if (n in ids) for (k = 1; k <= ndep[n]; k++) dependents[dep[n, k]]++
    for (n = 1; n <= top; n++) {
      if (!(n in ids)) continue
      r = repo[n]; p = prev[r]; g = 0
      if (p != "" && ndep[n] == 1 && dep[n, 1] == p && dependents[p] == 1 && sum[grp[p]] + est[n] <= BUDGET) g = grp[p]
      if (!g) { g = n; first[g] = n; order[++ng] = g; sum[g] = 0; tasks[g] = ""; grepo[g] = r }
      grp[n] = g; sum[g] += est[n]; last[g] = n; tasks[g] = tasks[g] (tasks[g] == "" ? "" : ",") "T" n; prev[r] = n
    }
    for (i = 1; i <= ng; i++) {
      g = order[i]; hi = 0
      for (m = first[g]; m <= last[g]; m++) if (grp[m] == g && (m in ids)) for (k = 1; k <= ndep[m]; k++) {
        d = dep[m, k]; if (!(d in ids) || grp[d] == g) continue
        gd[g] = gd[g] " " grp[d]
        if (repo[d] == grepo[g] && d > hi) hi = d
      }
      for (m = first[g]; m <= last[g]; m++) if (grp[m] == g && (m in ids)) for (k = 1; k <= ndep[m]; k++) {
        d = dep[m, k]; if (!(d in ids) || grp[d] == g || d == hi) continue
        h = grp[d]
        if (repo[d] == grepo[g]) addafter(g, head(h))
        else { s = tasks[h]; gsub(/,/, "+", s); addafter(g, repo[d] "#" s) }
      }
      bas[g] = hi ? head(grp[hi]) : "@BASE"
    }
    left = ng
    while (left > 0) {
      pick = 0
      for (i = 1; i <= ng && !pick; i++) {
        g = order[i]; if (g in done) continue
        nb = split(gd[g], bl, " "); ok = 1
        for (k = 1; k <= nb; k++) if (!(bl[k] in done)) ok = 0
        if (ok) pick = g
      }
      if (!pick) { print "dependency cycle in the plan" > "/dev/stderr"; exit 1 }
      done[pick] = 1; left--
      printf "%s\t%s\t%s\t%s\t%s\n", tasks[pick], grepo[pick], head(pick), bas[pick], (aft[pick] == "" ? "-" : aft[pick])
    }
  }' | while IFS=$'\t' read -r ts r hd bs af; do
    [ "$bs" = "@BASE" ] && bs=$(base_of "$r")
    printf '%s\t%s\t%s\t%s\t%s\n' "$ts" "$r" "$hd" "$bs" "$af"
  done
exit "${PIPESTATUS[1]}"
