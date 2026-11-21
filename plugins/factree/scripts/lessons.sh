#!/usr/bin/env bash
# Find lessons the factory could learn: things that have happened the same way often enough (spec self-improving R4–R8).
# Usage: lessons.sh   (the workspace comes from root.sh, or $FACTREE_HOME)
# Prints one candidate per line, most evidence first (ties by key):
#   <key><TAB><count><TAB><file, relative to the workspace><TAB><change><TAB><evidence: event times, comma-separated>
# Keys: pref:approve_plans · default:<kind>=<choice> · lens:<pattern path> · bug:<spec>#<scenario>
# Each decision counts once however often it was logged; keys already approved or rejected are never printed again;
# a preference already set in preferences.md isn't proposed.
here="$(cd "$(dirname "$0")" && pwd)"
root=$(bash "$here/root.sh") || exit 0
log="$root/events.jsonl"
[ -f "$log" ] || exit 0
set_plans=$(grep -c '^approve_plans:' "$root/preferences.md" 2>/dev/null)
tab=$(printf '\t')

awk -v SETPLANS="${set_plans:-0}" -v ROOT="$root" '
  function get(k,    m) { if (match($0, "\"" k "\":\"[^\"]*\"")) { m = substr($0, RSTART, RLENGTH); sub("^\"" k "\":\"", "", m); sub("\"$", "", m); return m } return "" }
  function add(key, subject, ts, file, change) {
    if ((key SUBSEP subject) in SEEN) return          # the same decision logged twice counts once
    SEEN[key SUBSEP subject] = 1
    COUNT[key]++; EVID[key] = EVID[key] (EVID[key] == "" ? "" : ",") ts
    FILE[key] = file; CHANGE[key] = change
  }
  function vertical(work, task,    f, line, v) {      # which vertical of a plan holds a task, for its lens
    v = ""
    cmd = "ls \"" ROOT "/work/" work "\"/*/tasks.md 2>/dev/null"
    while ((cmd | getline f) > 0) {
      while ((getline line < f) > 0) if (index(line, "### " task ":") == 1) { v = f; sub(/\/tasks\.md$/, "", v); sub(/.*\//, "", v) }
      close(f)
    }
    close(cmd)
    return v
  }
  {
    type = get("type"); ts = get("ts")
    if (type == "lesson.approved" || type == "lesson.rejected") { DONE[get("key")] = 1; next }
    if (type == "decision.feedback") { CHANGED[get("work")] = 1; next }
    if (type == "plan.design_approved" && get("by") !~ /^(preference|flow)/ && index($0, "\"new_patterns\":[]")) {
      APPROVED[get("work")] = ts; next
    }
    if (type == "decision.recorded" && get("overrides") != "") {
      kind = get("kind"); choice = get("choice")
      if (kind != "" && choice != "") add("default:" kind "=" choice, get("spec") "#" get("overrides"), ts, "defaults.md", kind ": " choice)
      next
    }
    if (type == "task.reviewed") {
      work = get("work"); task = get("task"); s = $0
      while (match(s, "\"pattern\":\"[^\"]+\"")) {
        p = substr(s, RSTART + 11, RLENGTH - 12); s = substr(s, RSTART + RLENGTH)
        key = "lens:" p
        if (!(key in LENSOF)) { v = vertical(work, task); LENSOF[key] = (v == "" ? "unknown" : v) }
        add(key, work "#" task, ts, "lenses/" LENSOF[key] ".md", "follow " p)
      }
      next
    }
    if (type == "bug.escaped") {
      sc = get("scenario")
      add("bug:" get("spec") "#" sc, sc, ts, "checklists/plan.md", "ask about: " get("slipped"))
    }
  }
  END {
    if (!SETPLANS) for (w in APPROVED) if (!(w in CHANGED)) add("pref:approve_plans", w, APPROVED[w], "preferences.md", "approve_plans: nothing-new")
    for (k in COUNT) {
      if (k in DONE) continue
      need = (k ~ /^bug:/) ? 1 : 3
      if (COUNT[k] >= need) printf "%s\t%d\t%s\t%s\t%s\n", k, COUNT[k], FILE[k], CHANGE[k], EVID[k]
    }
  }' "$log" | sort -t "$tab" -k2,2nr -k1,1
