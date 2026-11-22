#!/usr/bin/env bash
# Validate a Factree plan against its spec. Two layouts:
#   vertical plan: <work-folder>/plan.md plus <vertical>/design.md and <vertical>/tasks.md per vertical
#   old plan:      <work-folder>/design.md and tasks.md
# Usage: validate-plan.sh <work-folder> [spec-file]
#   spec-file defaults to <work-folder>/../../specs/<spec>.md, using `spec:` from plan.md (or tasks.md).
# Prints "ERROR file:line: message" / "WARN file:line: message".
# Exit 0 if no errors, 1 if any errors, 2 on usage problems.
# Checks structure and traceability only; whether the design is good is a judgment.

work="$1"
if [ -z "$work" ] || [ ! -d "$work" ]; then
  echo "usage: validate-plan.sh <work-folder> [spec-file]" >&2; exit 2
fi
work=${work%/}

# Problems found before the awk pass; printed first and counted in the summary.
pre=""; pre_err=0; pre_warn=0
note() { pre="$pre$1"$'\n'; case "$1" in ERROR*) pre_err=$((pre_err + 1)) ;; *) pre_warn=$((pre_warn + 1)) ;; esac; }
fmval() { awk -v K="$2" 'NR==1{next} $0=="---"{exit} index($0, K ":")==1 {sub(/^[a-z_]+:[ \t]*/,""); sub(/[ \t]+#.*$/,""); print; exit}' "$1"; }

files=(); roles=""; verticals=""
if [ -f "$work/plan.md" ]; then
  mode=vertical; head="$work/plan.md"
  verticals=$(fmval "$head" verticals | tr -d '[] ' | tr ',' ' ')
  [ -n "$verticals" ] || note "ERROR $head:1: front matter has no verticals:"
  for v in $verticals; do
    for k in design tasks; do
      if [ -f "$work/$v/$k.md" ]; then files+=("$work/$v/$k.md"); roles="$roles $k:$v"
      else note "ERROR $work/$v/$k.md:1: vertical $v has no $k.md"; fi
    done
  done
  for k in design tasks; do
    [ -f "$work/$k.md" ] && note "WARN $work/$k.md:1: stray $k.md: this is a vertical plan (plan.md), so the top-level file is ignored"
  done
  for d in "$work"/*/; do
    [ -d "$d" ] || continue
    v=$(basename "$d")
    case " $verticals " in *" $v "*) ;; *) note "WARN $work/$v:1: folder $v/ is not listed in verticals" ;; esac
  done
  files=("$head" "${files[@]}"); roles="plan$roles"
else
  mode=old; head="$work/tasks.md"
  for f in "$work/design.md" "$work/tasks.md"; do [ -f "$f" ] || { echo "ERROR $f: file not found"; exit 1; }; done
  files=("$work/design.md" "$work/tasks.md"); roles="design tasks"
fi

spec_id=$(fmval "$head" spec)
spec="${2:-$work/../../specs/$spec_id.md}"
[ -n "$spec_id" ] || { echo "ERROR $head:1: front matter has no spec:"; exit 1; }
[ -f "$spec" ] || { echo "ERROR $head:1: spec file not found: $spec"; exit 1; }

budget=$(fmval "$head" review_budget); budget=$(( ${budget:-0} + 0 ))
scope_list=$(fmval "$head" scope | tr -d '[] ')
nvert=$(echo $verticals | wc -w | tr -d ' ')

printf '%s' "$pre"
awk -v ROLES="spec $roles" -v MODE="$mode" -v NVERT="$nvert" -v PRE_ERR="$pre_err" -v PRE_WARN="$pre_warn" \
    -v SPEC_ID="$spec_id" -v SPECF="$spec" -v BUDGET="$budget" -v SCOPE_LIST="$scope_list" '
BEGIN {
  split(ROLES, RL, " "); errors = PRE_ERR + 0; warns = PRE_WARN + 0
  n = split(SCOPE_LIST, sl, ","); for (i = 1; i <= n; i++) if (sl[i] != "") INSCOPE[sl[i]] = 1
}
function err(f, l, m) { printf "ERROR %s:%d: %s\n", f, l, m; errors++ }
function warn(f, l, m) { printf "WARN %s:%d: %s\n", f, l, m; warns++ }
function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
function listparse(v, arr,    n, i, x, k) {
  gsub(/[\[\]]/, "", v); n = split(v, x, ","); k = 0
  for (i = 1; i <= n; i++) { x[i] = trim(x[i]); if (x[i] != "") arr[++k] = x[i] }
  return k
}
function num(t) { return substr(t, 2) + 0 }
# Each file has a role (spec, plan, design, tasks), with its vertical for design:<v> and tasks:<v>.
# Checks key off the role, not the position.
FNR == 1 {
  file++; split(RL[file], rv, ":"); ROLE = rv[1]; ROLEOF[file] = ROLE; VERT[file] = rv[2]
  FN[file] = FILENAME; IDX[ROLE] = file; fm = 0; section = ""; sub3 = ""; t = ""; infence = 0; mermaid = 0
}
# ---------- front matter (all files) ----------
FNR == 1 && $0 == "---" { fm = 1; next }
fm == 1 && $0 == "---" { fm = 2; next }
fm == 1 {
  if (match($0, /^[a-z_]+:/)) {
    k = substr($0, 1, RLENGTH - 1); v = trim(substr($0, RLENGTH + 1)); sub(/[ \t]+#.*$/, "", v)
    FMV[file, k] = v; FML[file, k] = FNR
  }
  next
}
# ---------- diagrams (plan files): a mermaid block must start with a kind the UI can draw ----------
ROLE != "spec" && $0 ~ /^```/ {
  if (infence) { infence = 0; mermaid = 0 }
  else { infence = 1; mermaid = ($0 ~ /^```mermaid[ \t]*$/); mline = FNR }
}
ROLE != "spec" && mermaid == 1 && $0 !~ /^```/ && $0 ~ /[^ \t]/ {
  k = trim($0)
  if (k !~ /^(sequenceDiagram|stateDiagram-v2|stateDiagram|flowchart|graph)([ \t]|$)/)
    warn(FILENAME, FNR, "mermaid block starts with \"" k "\"; use sequenceDiagram, stateDiagram-v2, flowchart or graph")
  mermaid = 2
}
# ---------- spec ----------
ROLE == "spec" {
  if ($0 ~ /^## /) { section = substr($0, 4); next }
  if (section == "Requirements") {
    if (match($0, /^### Requirement: R[0-9]+/)) { cur = substr($0, 18, RLENGTH - 17); REQ[cur] = 1; next }
    if (match($0, /^#### Scenario: S[0-9]+/)) { sc = substr($0, 16, RLENGTH - 15); SCEN[cur "." sc] = 1; next }
    if ($0 ~ /^Blocked by:/) { BLOCKED[cur] = 1 }
  }
  next
}
# ---------- plan overview ----------
ROLE == "plan" {
  if ($0 ~ /^## /) PSEC[trim(substr($0, 4))] = FNR
  next
}
# ---------- design ----------
ROLE == "design" {
  if ($0 ~ /^## /) { section = trim(substr($0, 4)); DSEC[file, section] = FNR; sub3 = ""; next }
  if (section == "Patterns" && $0 ~ /^### /) { sub3 = trim(substr($0, 5)); DSUB[file, sub3] = FNR; next }
  if (section == "Patterns" && $0 ~ /^- /) {
    if (sub3 == "Reused") {
      if ($0 !~ /^- \*\*P[0-9]+ /) { err(FILENAME, FNR, "reused pattern must start \"- **P<n> <Area>:**\""); next }
      match($0, /P[0-9]+/); id = substr($0, RSTART, RLENGTH)
      if (id in PAT) err(FILENAME, FNR, "duplicate pattern id " id); PAT[id] = 1; NREUSED[file]++
      if ($0 !~ /`[^`]+`/) err(FILENAME, FNR, id " cites no file (`path:line`); a reused pattern needs evidence")
      if (tolower($0) !~ /(because|fits)/) warn(FILENAME, FNR, id " does not say why it fits")
    } else if (sub3 == "New") {
      if ($0 !~ /^- \*\*N[0-9]+ /) { err(FILENAME, FNR, "new pattern must start \"- **N<n> <Area>:**\""); next }
      match($0, /N[0-9]+/); id = substr($0, RSTART, RLENGTH)
      if (id in PAT) err(FILENAME, FNR, "duplicate pattern id " id); PAT[id] = 1
      if (tolower($0) !~ /because/) err(FILENAME, FNR, id " does not say why existing patterns do not fit (\"Needed because ...\")")
      if ($0 !~ /Alternatives:/) warn(FILENAME, FNR, id " lists no alternatives considered")
      if ($0 !~ /Approved: [^<]/) { NEWLINE[id] = FNR; NEWFILE[id] = FILENAME }
    }
  }
  if (section == "Load and scale" && $0 ~ /^\|/ && $0 !~ /^\|[ |:-]*$/ && $0 !~ /^\| *Assumption/) {
    n = split($0, cells, "|")
    if (n >= 5 && trim(cells[4]) == "") warn(FILENAME, FNR, "assumption \"" trim(cells[2]) "\" has no source")
  }
  next
}
# ---------- tasks ----------
ROLE == "tasks" {
  if ($0 ~ /^### /) {
    if (match($0, /^### T[0-9]+: [^ ]/)) {
      match($0, /T[0-9]+/); t = substr($0, RSTART, RLENGTH)
      if (t in TASK) err(FILENAME, FNR, "duplicate task id " t " (" TFILE[t] ":" TASK[t] ", " FILENAME ":" FNR ")")
      ntasks++; if (num(t) > top) top = num(t); TASK[t] = FNR; TFILE[t] = FILENAME; TLIST[ntasks] = t
      # Vertical plans interleave numbers across files; their order is checked plan-wide in END.
      if (MODE == "old" && num(t) != ntasks) warn(FILENAME, FNR, t " is out of sequence (expected T" ntasks ")")
    } else { err(FILENAME, FNR, "task heading must be \"### T<n>: <title>\""); t = "" }
    insteps = 0; next
  }
  if (t == "") next
  if ($0 ~ /^\*\*Proves:\*\*/) {
    HASPROVES[t] = 1
    v = trim(substr($0, 12))
    if (tolower(v) ~ /^none/) { if (v !~ /\(/) warn(FILENAME, FNR, t " proves nothing; say why, e.g. \"none (foundation for T2, T3)\""); next }
    n = split(v, refs, ",")
    for (i = 1; i <= n; i++) {
      r = trim(refs[i])
      if (r !~ /^[a-z0-9-]+#R[0-9]+\.S[0-9]+$/) { err(FILENAME, FNR, t " has a malformed scenario reference \"" r "\" (expected " SPEC_ID "#R<n>.S<n>)"); continue }
      split(r, rp, "#")
      if (rp[1] != SPEC_ID) { err(FILENAME, FNR, t " references " r ", which is not in spec " SPEC_ID); continue }
      if (!(rp[2] in SCEN)) { err(FILENAME, FNR, t " references " r ", which does not exist in the spec"); continue }
      split(rp[2], rq, "."); if (!(rq[1] in INSCOPE)) warn(FILENAME, FNR, t " proves " r ", but " rq[1] " is not in scope")
      PROVED[rp[2]] = PROVED[rp[2]] ? PROVED[rp[2]] ", " t : t
    }
    next
  }
  if ($0 ~ /^\*\*Depends on:\*\*/) {
    HASDEPS[t] = 1
    v = trim(substr($0, 16)); if (tolower(v) ~ /^none/ || v == "—" || v == "-") next
    # "T<n> (<reason>), T<m>": a reason may hold commas, so scan rather than split.
    while ((v = trim(v)) != "") {
      sub(/^,[ \t]*/, "", v); match(v, /^[^ \t,(]*/); d = substr(v, 1, RLENGTH); v = trim(substr(v, RLENGTH + 1)); why = ""
      if (match(v, /^\([^)]*\)/)) { why = trim(substr(v, 2, RLENGTH - 2)); v = substr(v, RLENGTH + 1) }
      if (d !~ /^T[0-9]+$/) { err(FILENAME, FNR, t " has a malformed dependency \"" d "\""); sub(/^[^,]*/, "", v); continue }
      ndeps++; DEPT[ndeps] = t; DEPD[ndeps] = d; DEPF[ndeps] = FILENAME; DEPL[ndeps] = FNR; LINK[t, d] = 1
      if (why == "") { BARE[t, d] = 1; warn(FILENAME, FNR, t ": dependency on " d " has no reason") }
    }
    next
  }
  if ($0 ~ /^\*\*Est\. diff:\*\*/) {
    HASEST[t] = 1
    if (match($0, /[0-9]+/)) {
      est = substr($0, RSTART, RLENGTH) + 0
      if (BUDGET > 0 && est > BUDGET) err(FILENAME, FNR, t " is estimated at ~" est " lines, over the review budget of " BUDGET "; split it")
    } else err(FILENAME, FNR, t " Est. diff has no number")
    next
  }
  if ($0 ~ /^\*\*Files\*\*/) { HASFILES[t] = 1; next }
  if ($0 ~ /^\*\*Steps\*\*/) { insteps = 1; next }
  if (insteps && $0 ~ /^- \[[ x]\] /) { STEPS[t]++; if (tolower($0) ~ /commit/) COMMIT[t] = 1; RUNSTEP = (tolower($0) ~ /^- \[[ x]\] ([0-9]+\. )?(run|commit)/) }
  # A step decides something when it names a test, file or signature in backticks, or carries a code block (planning R1).
  if (insteps && index($0, "`") && !($0 ~ /^- \[[ x]\] / && RUNSTEP)) NAMED[t] = 1
  next
}
END {
  SI = IDX["spec"]; PI = IDX["plan"]; DI = IDX["design"]; TI = IDX["tasks"]
  HI = (MODE == "vertical") ? PI : TI      # the file holding spec, scope and status
  HEADF = FN[HI]
  # ----- scope -----
  ns = listparse(FMV[HI, "scope"], SC)
  if (ns == 0) err(HEADF, FML[HI, "scope"] ? FML[HI, "scope"] : 1, "front matter has no scope")
  if (MODE == "old") {
    nd = listparse(FMV[DI, "scope"], DSC)
    dscope = ""; for (i = 1; i <= nd; i++) dscope = dscope " " DSC[i]
    tscope = ""; for (i = 1; i <= ns; i++) tscope = tscope " " SC[i]
    if (dscope != tscope) err(HEADF, FML[TI, "scope"], "scope [" trim(tscope) "] differs from design.md scope [" trim(dscope) "]")
  }
  # ----- spec state -----
  sst = FMV[SI, "status"]
  # A compact change approves its draft spec with the plan (decision-flow R5): draft is an error only once the plan is approved.
  pst = FMV[HI, "status"]
  if (sst == "draft" && pst != "draft" && pst != "") err(SPECF, FML[SI, "status"], "spec is draft; it must be approved before the plan is")
  else if (sst == "draft") warn(SPECF, FML[SI, "status"], "spec is draft; approve it with the plan, or before planning")
  for (i = 1; i <= ns; i++) {
    r = SC[i]
    if (!(r in REQ)) err(HEADF, FML[HI, "scope"], "scope includes " r ", which is not a requirement in the spec")
    if (r in BLOCKED) err(HEADF, FML[HI, "scope"], "scope includes " r ", which is blocked by an open question")
  }
  # ----- front matter checks -----
  for (f = 1; f <= file; f++) {
    if (ROLEOF[f] == "spec") continue
    fn = FN[f]
    if (FMV[f, "work"] == "") err(fn, 1, "front matter has no work:")
    if (MODE == "old" || ROLEOF[f] == "plan") {
      if (FMV[f, "spec"] != SPEC_ID) err(fn, FML[f, "spec"] ? FML[f, "spec"] : 1, "spec: does not match tasks.md (" SPEC_ID ")")
      continue
    }
    if (FMV[f, "work"] != "" && FMV[f, "work"] != FMV[PI, "work"]) err(fn, FML[f, "work"], "work: does not match plan.md (" FMV[PI, "work"] ")")
    if (FMV[f, "vertical"] != VERT[f]) err(fn, FML[f, "vertical"] ? FML[f, "vertical"] : 1, "vertical: does not match its folder (" VERT[f] ")")
    if (FMV[f, "status"] != "") warn(fn, FML[f, "status"], "status belongs in plan.md, not in a vertical file")
  }
  if (MODE == "old") {
    dst = FMV[DI, "status"]; tst = FMV[TI, "status"]
    if (dst != "draft" && dst != "design-approved" && dst != "approved") err(FN[DI], FML[DI, "status"], "status must be draft, design-approved or approved")
    if (tst != "draft" && tst != "approved") err(FN[TI], FML[TI, "status"], "status must be draft or approved")
    if ((dst == "design-approved" || dst == "approved") && (FMV[DI, "design_approved_by"] == "" || FMV[DI, "design_approved_at"] == "")) err(FN[DI], FML[DI, "status"], "design is " dst " but design_approved_by/at are not set")
    if (tst == "approved" && (FMV[TI, "approved_by"] == "" || FMV[TI, "approved_at"] == "")) err(FN[TI], FML[TI, "status"], "plan is approved but approved_by/at are not set")
    if (tst == "approved" && dst == "draft") err(FN[TI], FML[TI, "status"], "tasks are approved but the design is still draft")
  } else {
    dst = FMV[PI, "status"]
    if (dst != "draft" && dst != "design-approved" && dst != "approved") err(HEADF, FML[PI, "status"], "status must be draft, design-approved or approved")
    if ((dst == "design-approved" || dst == "approved") && (FMV[PI, "design_approved_by"] == "" || FMV[PI, "design_approved_at"] == "")) err(HEADF, FML[PI, "status"], "design is " dst " but design_approved_by/at are not set")
    if (dst == "approved" && (FMV[PI, "approved_by"] == "" || FMV[PI, "approved_at"] == "")) err(HEADF, FML[PI, "status"], "plan is approved but approved_by/at are not set")
    npq = split("Context,Verticals,Order,Coverage,Spec updates", PQ, ",")
    # Plans written after this rule came in also carry Global constraints and Review focus (planning R2, R3).
    if (FMV[PI, "created"] > "2026-11-18") npq = split("Context,Verticals,Order,Coverage,Spec updates,Global constraints,Review focus", PQ, ",")
    for (i = 1; i <= npq; i++) if (!PSEC[PQ[i]]) err(HEADF, 1, "missing section \"## " PQ[i] "\"")
  }
  # ----- design sections (Context and Spec updates live in plan.md for vertical plans) -----
  if (MODE == "old") nreq = split("Context,Patterns,Approach,Load and scale,Components,Interfaces,Data,Flows,Error handling,Test strategy,Risks and rollout,Spec updates", RQ, ",")
  else nreq = split("Patterns,Approach,Load and scale,Components,Interfaces,Data,Flows,Error handling,Test strategy,Risks and rollout", RQ, ",")
  for (f = 1; f <= file; f++) {
    if (ROLEOF[f] != "design") continue
    for (i = 1; i <= nreq; i++) if (!DSEC[f, RQ[i]]) err(FN[f], 1, "missing section \"## " RQ[i] "\"")
    if (DSEC[f, "Patterns"] && (!DSUB[f, "Reused"] || !DSUB[f, "New"])) err(FN[f], DSEC[f, "Patterns"], "Patterns needs both \"### Reused\" and \"### New\" (write \"None.\" if empty)")
    if (DSEC[f, "Patterns"] && !NREUSED[f]) warn(FN[f], DSEC[f, "Patterns"], "no reused patterns; a design that reuses nothing from the repo is unusual")
  }
  for (id in NEWLINE) if (dst != "draft") err(NEWFILE[id], NEWLINE[id], id " is a new pattern with no \"Approved: <who>, <date>\" but the design is " dst)
  # ----- tasks -----
  if (ntasks == 0) err(HEADF, 1, "no tasks")
  for (i = 1; i <= ntasks; i++) {
    t = TLIST[i]; l = TASK[t]; tf = TFILE[t]
    if (!HASPROVES[t]) err(tf, l, t " has no **Proves:** line")
    if (!HASDEPS[t]) err(tf, l, t " has no **Depends on:** line")
    if (!HASEST[t]) err(tf, l, t " has no **Est. diff:** line")
    if (!HASFILES[t]) err(tf, l, t " has no **Files** list")
    if (STEPS[t] == 0) err(tf, l, t " has no checkbox steps under **Steps**")
    else if (!COMMIT[t]) warn(tf, l, t " has no commit step")
    if (STEPS[t] > 0 && !NAMED[t]) warn(tf, l, t ": steps name no test or signature")
  }
  if (MODE == "vertical")  # build order across the plan: T1..TN, each once
    for (i = 1; i <= top; i++) if (!(("T" i) in TASK)) warn(HEADF, 1, "task numbers skip T" i "; number tasks 1..N across the plan")
  # A task may depend only on a lower-numbered task that exists, in any vertical.
  for (i = 1; i <= ndeps; i++) if (!(DEPD[i] in TASK) || num(DEPD[i]) >= num(DEPT[i])) err(DEPF[i], DEPL[i], DEPT[i] " depends on " DEPD[i] ", which is not an earlier task")
  # Four or more tasks, each depending on the one numbered just before, with any link bare: nothing can run at once.
  run = 1; for (i = 2; i <= top + 1; i++) {
    if (i <= top && (("T" i, "T" (i - 1)) in LINK)) { run++; bare += (("T" i, "T" (i - 1)) in BARE); continue }
    if (run >= 4 && bare && !chain++) warn(HEADF, 1, "plan is one chain: no tasks can run at once")
    run = 1; bare = 0
  }
  # ----- coverage -----
  covered = 0; total = 0
  for (k in SCEN) {
    split(k, kp, "."); if (!(kp[1] in INSCOPE)) continue
    total++
    if (k in PROVED) covered++
    else err(HEADF, 1, "in-scope scenario " SPEC_ID "#" k " is not proved by any task")
  }
  if (MODE == "vertical")
    printf "%s: %d task(s) in %d vertical(s), %d/%d in-scope scenario(s) proved, review budget %s, %d error(s), %d warning(s)\n", HEADF, ntasks, NVERT, covered, total, (BUDGET ? BUDGET : "unset"), errors, warns
  else
    printf "%s: %d task(s), %d/%d in-scope scenario(s) proved, review budget %s, %d error(s), %d warning(s)\n", HEADF, ntasks, covered, total, (BUDGET ? BUDGET : "unset"), errors, warns
  exit (errors > 0) ? 1 : 0
}
' "$spec" "${files[@]}"
