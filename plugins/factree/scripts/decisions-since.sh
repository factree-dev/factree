#!/usr/bin/env bash
# Print decisions made in the Factree companion as "- <what> (<who>)" lines (companion-decisions R8).
# Usage: decisions-since.sh <events.jsonl|-> <since> [spec] [work] [delivered]
#   since: an ISO time; events at or after it count ("" for all). spec, work: only decisions on that spec or plan.
#   delivered: a file of log line numbers already handed to this session; those are skipped, and what's printed is
#   added to it, so each decision reaches a session once (factory-flow R6).
# Shared by the session hook (on each prompt) and wait-decision.sh (in the background).
file=${1:--}; since=${2:-}; spec=${3:-}; work=${4:-}; delivered=${5:-}
[ "$file" != "-" ] && [ ! -f "$file" ] && exit 0
[ -n "$delivered" ] && touch "$delivered"
awk -v SINCE="$since" -v SPEC="$spec" -v WORK="$work" -v DONE="$delivered" '
  BEGIN { if (DONE != "") while ((getline l < DONE) > 0) SEEN[l] = 1 }
  NR in SEEN { next }
  function get(k,    m) { if (match($0, "\"" k "\":\"[^\"]*\"")) { m = substr($0, RSTART, RLENGTH); sub("^\"" k "\":\"", "", m); sub("\"$", "", m); return m } return "" }
  function num(k) { if (match($0, "\"" k "\":[0-9]+")) return substr($0, RSTART + length(k) + 3, RLENGTH - length(k) - 3); return "" }
  index($0, "\"via\":\"companion\"") == 0 { next }
  { ts = get("ts"); if (SINCE != "" && ts < SINCE) next
    type = get("type"); s = get("spec"); w = get("work"); by = get("by")
    if (SPEC != "" && s != SPEC && !(WORK != "" && w == WORK)) next
    subj = s != "" ? s : w
    if (type == "question.answered") line = subj " question " num("n") ": " get("answer")
    else if (type == "decision.feedback") line = (w != "" ? w : subj) " changes requested: " get("note")
    else if (type == "spec.approved") line = subj " spec approved"
    else if (type == "plan.approved") line = subj " plan approved"
    else if (type == "plan.design_approved") line = subj " design approved"
    else next
    print "- " line " (" by ")"
    if (DONE != "") print NR >> DONE }' "$file"
