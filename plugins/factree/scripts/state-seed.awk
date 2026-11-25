# A spec's state as today's files and events give it (status-state R6, D3, D4), for state.sh migrate and for the
# plans a state lacks. Files, in this order: specs/*.md, work/*/plan.md, work/*/tasks.md, work/*/*/tasks.md,
# events.jsonl. ONLY: one spec id, or empty for every spec.
# Prints "<spec>\t<key>\t<value>" per key, and "<spec>\tsnap\t<work>" for an approved plan not stale by today's rule
# (its covers are taken from the spec as it reads now); a plan stale today gets cover.<work>.stale, so it reads
# stale until it is approved again.
function val(line) { sub(/^[a-z_]+:[ ]*/, "", line); gsub(/"/, "", line); sub(/[ #].*/, "", line); return line }
function jval(s, k) {   # a string or number value of key k in s, or ""
  if (!match(s, "\"" k "\": *(\"[^\"]*\"|[0-9]+)")) return ""
  s = substr(s, RSTART, RLENGTH); sub(/^"[^"]*": */, "", s); gsub(/"/, "", s); return s
}
function clean(s) { gsub(/[^A-Za-z0-9#._ -]/, " ", s); gsub(/  +/, " ", s); sub(/^ /, "", s); sub(/ $/, "", s); return s }
FNR == 1 {
  n = split(FILENAME, f, "/"); kind = ""; fm = 0; head = 0; tasks = 0
  if (f[n] == "events.jsonl") kind = "ev"
  else if (n > 1 && f[n - 1] == "specs") { kind = "spec"; id = f[n]; sub(/\.md$/, "", id); specs[id] = 1 }
  else if (n > 2 && f[n - 2] == "work") { kind = "work"; w = f[n - 1]; tasks = (f[n] == "tasks.md"); head = !(w in hashead); hashead[w] = 1 }
  else if (n > 3 && f[n - 3] == "work") { kind = "work"; w = f[n - 2]; tasks = 1 }
  if (kind != "ev" && $0 == "---") { fm = 1; next }
}
kind == "" { next }
kind != "ev" && fm && $0 == "---" { fm = 0; next }
kind == "spec" { if (fm && /^status:/) sstat[id] = val($0); else if (fm && /^updated:/) supd[id] = val($0); next }
kind == "work" && fm { if (!head) next; if (/^spec:/) pspec[w] = val($0); else if (/^status:/) pstat[w] = val($0); else if (/^spec_updated:/) pupd[w] = val($0); next }
kind == "work" { if (tasks && /^### T[0-9]+:/) { t = $2; sub(/:$/, "", t); if (!((w, t) in tk)) { tk[w, t] = 1; total[w]++ } } next }
{
  type = jval($0, "type"); ts = jval($0, "ts"); s = jval($0, "spec"); e = jval($0, "work")
  d = $0; sub(/^.*"data": */, "", d); pr = jval(d, "pr")
  if (type == "spec.created") created[s] = 1
  else if (type == "spec.updated" && d ~ /"(added|changed|retired)": *\[ *"/) changed[s] = ts
  else if (type == "plan.created") pcreated[e] = ts
  else if (type == "plan.approved") papproved[e] = ts
  else if (type == "plan.implemented") pimpl[e] = ts
  else if (type == "task.started") pstarted[e] = 1
  else if (type == "task.done") { t = clean(jval(d, "task")); if (t != "" && !((e, t) in tdone)) { tdone[e, t] = 1; dlist[e] = dlist[e] (dlist[e] == "" ? "" : " ") t } }
  else if (type == "review.opened" && pr != "") {   # a pull request opened again moves to the end, as the UI orders them
    if (!((e, pr) in prst)) prst[e, pr] = ""; x = " " prs[e] " "; sub(" " pr " ", " ", x); gsub(/^ +| +$/, "", x)
    prs[e] = x (x == "" ? "" : " ") pr
  }
  else if (type == "review.state" && ((e, pr) in prst)) prst[e, pr] = jval(d, "state")
  else if (type == "stage.held") { hs[e] = clean(jval(d, "stage")); hold[e] = hs[e] " " clean(jval(d, "reason")); hsince[e] = ts }
  else if (type == "stage.released" && (e in hs) && clean(jval(d, "stage")) == hs[e]) { delete hs[e]; delete hold[e]; delete hsince[e] }
}
END {
  for (w in hashead) {
    s = pspec[w]
    if (!(s in specs) || (ONLY != "" && s != ONLY)) continue
    if (!(s in newest) || w > newest[s]) newest[s] = w
    st = pstat[w]
    if ((w in pimpl) || st == "implemented") stage = "implemented"
    else if (dlist[w] != "" || (w in pstarted)) stage = "building"
    else if ((w in papproved) || st == "approved") stage = "approved"
    else stage = "planned"
    print s "\tplan." w "\t" stage
    if (dlist[w] != "") print s "\ttasks." w "\t" dlist[w]
    if (total[w] > 0) print s "\ttotal." w "\t" total[w]
    if (prs[w] != "") {   # as the UI reads it (loop.ts reviewOf): each one's newest state, or open; one with no
      # state is superseded once a later one merged
      k = split(prs[w], p, " "); open = 0; merged = 0; closed = 0; later = 0
      for (i = k; i >= 1; i--) { x = prst[w, p[i]]; if (x == "MERGED") { merged++; later = 1 } else if (x == "CLOSED") closed++; else if (x != "" || !later) open++ }
      print s "\tprs." w "\t" prs[w]
      print s "\treview." w "\t" ((merged && !open && !closed) ? "merged" : (closed && !open) ? "closed" : "open")
    }
    if (w in hold) { print s "\thold." w "\t" hold[w]; print s "\thold_since." w "\t" hsince[w] }
    if (stage == "planned") continue
    # Today's rule (apps/companion/server/loop.ts isStale): changed after the last approval and not built since.
    made = (w in papproved) ? papproved[w] : (w in pcreated) ? pcreated[w] : ""
    c = (s in changed) ? changed[s] : ""
    if (made != "") old = (c != "" && c > made && !((w in pimpl) && pimpl[w] >= c))
    else old = ((s in supd) && (w in pupd) && supd[s] > pupd[w])
    print s "\t" (old ? "cover." w ".stale\t1" : "snap\t" w)
  }
  for (s in specs) if (ONLY == "" || s == ONLY) {
    print s "\tspec\t" ((sstat[s] == "approved" || sstat[s] == "live") ? "approved" : (s in created) ? "writing" : "draft")
    if (s in newest) print s "\tplan\t" newest[s]
    print s "\tseq\t0"
  }
}
