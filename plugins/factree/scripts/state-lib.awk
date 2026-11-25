# The moves of state.sh (status-state R3, D4): reads a spec's state file, applies one move.
# Variables: RETRY (a started task whose newest outcome failed or blocked), SPEC MOVE W TASK PR STAGE REASON TOTAL NOW, INIT (the spec stage when there is no state yet), and COVER
# ("cover.<work>.<R>=<sum>;…", the plan's covered requirements as they read now, for plan-approve: D3).
# Prints "ok", "already <message>" or "refuse <message>"; after "ok", one "<key>\t<value>" line per key of the
# new state. A line it can't read refuses every move.
{
  line = $0
  if (line == "{" || line == "}") next
  if (line !~ /^  "[^"]+": "[^"]*",?$/) { if (!bad) bad = NR; next }
  sub(/^ *"/, "", line); i = index(line, "\": \"")
  val = substr(line, i + 4); sub(/",?$/, "", val)
  V[substr(line, 1, i - 1)] = val
}
function say(kind, msg) { if (!said) print kind " " msg; said = 1 }
function refuse(what, verb, why) { say("refuse", what " can't be " verb ": " why) }
function inlist(list, x) { return index(" " list " ", " " x " ") > 0 }
function without(list, x,   parts, n, i, o) {
  n = split(list, parts, " "); o = ""
  for (i = 1; i <= n; i++) if (parts[i] != x) o = (o == "" ? "" : o " ") parts[i]
  return o
}
function count(list,   parts) { return list == "" ? 0 : split(list, parts, " ") }
# The plan's covers: the same as COVER, or replaced by it (a re-approval: status-state R4.S2).
function samecovers(   k, n, i, e, j, c) {
  c = 0; for (k in V) if (index(k, "cover." W ".") == 1) c++
  n = split(COVER, e, ";"); for (i = 1; i <= n; i++) if ((j = index(e[i], "=")) > 0) {
    k = substr(e[i], 1, j - 1); if (!(k in V) || V[k] != substr(e[i], j + 1)) return 0; c--
  }
  return c == 0
}
function setcovers(   k, n, i, e, j, old) {
  for (k in V) if (index(k, "cover." W ".") == 1) old[k] = 1
  for (k in old) delete V[k]
  n = split(COVER, e, ";"); for (i = 1; i <= n; i++) if ((j = index(e[i], "=")) > 0) V[substr(e[i], 1, j - 1)] = substr(e[i], j + 1)
}
END {
  if (bad) { print "refuse state/" SPEC ".json line " bad " is not readable; fix or remove it"; exit }
  if (!("spec" in V)) V["spec"] = INIT
  s = V["spec"]
  if (W == "" && ("plan" in V)) W = V["plan"]
  p = (("plan." W) in V) ? V["plan." W] : ""; pis = (p == "") ? "not planned" : p
  r = (("review." W) in V) ? V["review." W] : "none"
  held = (("hold." W) in V) ? V["hold." W] : ""
  if (MOVE == "write") {
    if (s == "writing") say("already", SPEC " is already writing"); else V["spec"] = "writing"
  } else if (MOVE == "approve") {
    if (s == "approved") say("already", SPEC " is already approved"); else V["spec"] = "approved"
  } else if (MOVE == "edit") {
    if (s == "writing") say("already", SPEC " is already writing")
    else if (s != "approved") refuse(SPEC, "edited", "it is " s)
    else V["spec"] = "writing"
  } else if (W == "") {
    say("refuse", SPEC " has no plan: give work=<work>")
  } else if (MOVE == "plan") {
    if (p != "") say("already", W " is already planned")
    else if (s != "approved") refuse(W, "planned", SPEC " is " s)
    else { V["plan." W] = "planned"; V["plan"] = W }
  } else if (MOVE == "plan-approve") {
    if (p == "approved" || p == "building" || p == "implemented") { if (samecovers()) say("already", W " is already approved"); else setcovers() }
    else if (p != "planned") refuse(W, "approved", "it is " pis)
    else { V["plan." W] = "approved"; setcovers() }
  } else if (MOVE == "build-start") {
    if (TASK != "" && p == "building") started = (("started." W) in V) ? V["started." W] : ""
    if (p == "implemented" || (p == "building" && (TASK == "" || (inlist(started, TASK) && !RETRY)))) say("already", W " is already " p)
    else if (p != "approved" && p != "building") refuse(W, "started", "it is " pis)
    else if (TASK != "") {   # per task: the first moves the plan to building; each is logged as started once
      started = (("started." W) in V) ? V["started." W] : ""
      if (inlist(started, TASK) && !RETRY) say("already", TASK " is already started in " W)
      else { V["plan." W] = "building"; if (!inlist(started, TASK)) V["started." W] = (started == "") ? TASK : started " " TASK }
    }
    else V["plan." W] = "building"
  } else if (MOVE == "task-done") {
    done = (("tasks." W) in V) ? V["tasks." W] : ""
    if (TASK == "") say("refuse", "task-done needs task=<T>")
    else if (inlist(done, TASK)) say("already", TASK " is already done in " W)
    else if (p != "approved" && p != "building") refuse(TASK, "done", W " is " pis)
    else { V["plan." W] = "building"; V["tasks." W] = (done == "") ? TASK : done " " TASK }
  } else if (MOVE == "implemented") {
    n = count(V["tasks." W])
    if (p == "implemented") say("already", W " is already implemented")
    else if (p != "approved" && p != "building") refuse(W, "implemented", "it is " pis)
    else if (TOTAL + 0 == 0 || n < TOTAL + 0) refuse(W, "implemented", n " of " (TOTAL + 0) " tasks done")
    else V["plan." W] = "implemented"
  } else if (MOVE == "review-open") {
    prs = (("prs." W) in V) ? V["prs." W] : ""
    if (PR == "") say("refuse", "review-open needs pr=<number>")
    else if (inlist(prs, PR)) say("already", W " already has pull request " PR)
    else if (p != "implemented") refuse(W, "reviewed", "it is " pis)
    else if (r == "merged") refuse(W, "reviewed", "its review is merged")
    else { V["review." W] = "open"; V["prs." W] = (prs == "") ? PR : prs " " PR }
  } else if (MOVE == "merged" || MOVE == "closed") {
    prs = (("prs." W) in V) ? V["prs." W] : ""
    ml = (("merged." W) in V) ? V["merged." W] : ""; cl = (("closed." W) in V) ? V["closed." W] : ""
    if (PR != "") {   # per pull request (D4): merged when all are, closed when one is and none is open
      if (!inlist(prs, PR)) refuse("pull request " PR, MOVE, W " has no such pull request")
      else if (inlist(MOVE == "merged" ? ml : cl, PR)) say("already", "pull request " PR " is already " MOVE)
      else {
        if (MOVE == "merged") { ml = (ml == "" ? PR : ml " " PR); cl = without(cl, PR) } else { cl = (cl == "" ? PR : cl " " PR); ml = without(ml, PR) }
        if (ml == "") delete V["merged." W]; else V["merged." W] = ml
        if (cl == "") delete V["closed." W]; else V["closed." W] = cl
        open = count(prs) - count(ml) - count(cl)
        V["review." W] = (open == 0 && count(ml) == count(prs)) ? "merged" : (open <= 0 && cl != "") ? "closed" : "open"
      }
    }
    else if (r == MOVE) say("already", W "'s review is already " MOVE)
    else if (r != "open") refuse(W "'s review", MOVE, "it is " r)
    else V["review." W] = MOVE
  } else if (MOVE == "hold") {
    if (STAGE == "") say("refuse", "hold needs stage=<stage>")
    else if (held == STAGE " " REASON) say("already", W " is already held")
    else { V["hold." W] = STAGE " " REASON; V["hold_since." W] = NOW }
  } else if (MOVE == "release") {
    if (held == "") say("already", W " is not held")
    else { delete V["hold." W]; delete V["hold_since." W] }
  }
  if (said) exit
  if (W != "" && TOTAL + 0 > 0 && (("plan." W) in V)) V["total." W] = TOTAL + 0
  V["seq"] = V["seq"] + 1
  print "ok"
  for (k in V) print k "\t" V[k]
}
