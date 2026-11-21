#!/usr/bin/env bash
# Turn per-test results into a status for every scenario of a spec, and record them (spec verify R1–R3).
# Usage: verify-record.sh <spec> [repo-root] < results
#   results: one line per test, "pass<TAB><test name>" or "fail<TAB><test name>"; also
#     "unchecked<TAB><spec>#Rn.Sm": its citing tests don't check the scenario's THEN, so they don't prove it (verifying R1)
#     "build<TAB>pass|fail<TAB><command>[: <first error>]": a typecheck or build run; any fail makes the spec failing (verifying R2)
#   repo-root (default: the git top level) is where manual cases are found: tests/*/cases.md
# A scenario is proved (a citing test passed, none failed; or a manual case passed on or after the build),
# failing (a citing test failed), or unverified (nothing proves it). Logs one spec.verified event.
# Prints "<spec>: <p> proved · <f> failing · <u> unverified", then each scenario that isn't proved.

spec="$1"
case "$spec" in ""|*[!a-z0-9-]*) echo "usage: verify-record.sh <spec> [repo-root] < results" >&2; exit 2 ;; esac
repo="${2:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
here="$(cd "$(dirname "$0")" && pwd)"
root=$(bash "$here/root.sh")
specf="$root/specs/$spec.md"
[ -f "$specf" ] || { echo "no spec $spec at $specf" >&2; exit 2; }

fmval() { awk -v K="$2" 'NR==1{next} $0=="---"{exit} index($0, K ":")==1 {sub(/^[a-z_]+:[ \t]*/,""); gsub(/"/,""); print; exit}' "$1"; }
# Manual runs count from the build on: the latest implemented_at of the spec's plans, else when the spec was approved.
threshold=""
for p in "$root"/work/*/plan.md "$root"/work/*/tasks.md; do
  [ -f "$p" ] && [ "$(fmval "$p" spec)" = "$spec" ] || continue
  d=$(fmval "$p" implemented_at | cut -c1-10)
  [ -n "$d" ] && { [ -z "$threshold" ] || [ "$d" \> "$threshold" ]; } && threshold="$d"
done
[ -n "$threshold" ] || threshold=$(fmval "$specf" approved_at | cut -c1-10)

results=$(mktemp); cat > "$results"
cases=$(ls "$repo"/tests/*/cases.md 2>/dev/null)

summary=$(awk -v SPEC="$spec" -v THRESH="$threshold" -v RESULTS="$results" '
  function esc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }
  function tags(s, arr,    n, t) {   # scenario ids of this spec cited in s
    n = 0
    while (match(s, "\\[" SPEC "#R[0-9]+\\.S[0-9]+\\]")) {
      t = substr(s, RSTART + length(SPEC) + 2, RLENGTH - length(SPEC) - 3); arr[++n] = t
      s = substr(s, RSTART + RLENGTH)
    }
    return n
  }
  FNR == 1 { f++ }
  # 1: the spec, for every scenario id in order
  f == 1 && /^### Requirement: R[0-9]+/ { match($0, /R[0-9]+/); req = substr($0, RSTART, RLENGTH); next }
  f == 1 && /^#### Scenario: S[0-9]+/ { match($0, /S[0-9]+/); id = req "." substr($0, RSTART, RLENGTH); ORD[++ns] = id; next }
  f == 1 { next }
  # then manual case files: headings name scenarios; Results rows record runs
  /^## / {
    key = ""; h = substr($0, 4)
    if (match(h, /^[0-9]+\./)) key = substr(h, 1, RLENGTH - 1); else { key = h; sub(/ *\[.*$/, "", key) }
    n = tags(h, T); for (i = 1; i <= n; i++) CASEOF[FILENAME SUBSEP key, T[i]] = 1
    next
  }
  /^\| *[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] *\|/ {
    nc = split($0, c, "|"); d = c[2]; gsub(/ /, "", d); k = c[4]; gsub(/^ +| +$/, "", k); ok = tolower(c[5]); gsub(/ /, "", ok)
    if (match(k, /^[0-9]+/)) k = substr(k, 1, RLENGTH)
    if (ok ~ /^(yes|y|pass|passed|ok|✓)$/ && d >= THRESH) RUN[FILENAME SUBSEP k] = d
    next
  }
  END {
    # manual proof: a case citing the scenario with a pass on or after the threshold
    for (ck in CASEOF) {
      split(ck, parts, SUBSEP); file_key = parts[1] SUBSEP parts[2]; sid = parts[3]
      if (file_key in RUN) MANUAL[sid] = "manual case " parts[2] " passed " RUN[file_key]
      else HASCASE[sid] = 1
    }
    while ((getline line < RESULTS) > 0) {
      split(line, r, "\t"); st = r[1]; name = r[2]
      if (st == "unchecked") { if (index(name, SPEC "#") == 1) UNCHECKED[substr(name, length(SPEC) + 2)] = 1; continue }
      if (st == "build") { BUILT = 1; if (name == "fail" && BROKEN == "") BROKEN = r[3]; continue }
      n = tags(name, T)
      for (i = 1; i <= n; i++) {
        if (st == "fail") FAILED[T[i]] = FAILED[T[i]] (FAILED[T[i]] ? "; " : "") name
        else if (st == "pass") PASSED[T[i]] = PASSED[T[i]] (PASSED[T[i]] ? "; " : "") name
      }
    }
    np = nf = nu = 0; json = ""; lines = ""
    for (i = 1; i <= ns; i++) {
      id = ORD[i]
      if (id in FAILED) { s = "failing"; ev = "failing: " FAILED[id]; nf++ }
      else if ((id in PASSED) && !(id in UNCHECKED)) { s = "proved"; ev = PASSED[id]; np++ }
      else if (id in MANUAL) { s = "proved"; ev = MANUAL[id]; np++ }
      else { s = "unverified"; ev = (id in PASSED) ? "cited, doesn\047t check THEN: " PASSED[id] : (id in HASCASE) ? "manual case not run since the build" : "no test cites it"; nu++ }
      json = json (json ? "," : "") "\"" id "\":{\"status\":\"" s "\",\"evidence\":\"" esc(ev) "\"}"
      if (s != "proved") lines = lines "\n  " id " " s ": " ev
    }
    b = BUILT ? ",\"build\":\"" (BROKEN == "" ? "passing" : "failing") "\"" : ""
    printf "{\"proved\":%d,\"failing\":%d,\"unverified\":%d%s,\"results\":{%s}}\n", np, nf, nu, b, json
    if (BROKEN != "") printf "%s: failing build: %s\n", SPEC, BROKEN
    printf "%s: %d proved · %d failing · %d unverified%s\n", SPEC, np, nf, nu, lines
  }' "$specf" $cases /dev/null)
rm -f "$results"

data=$(printf '%s\n' "$summary" | head -n1)
bash "$here/event.sh" spec.verified "$spec" "$data" || exit 1
printf '%s\n' "$summary" | tail -n +2
