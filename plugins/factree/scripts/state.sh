#!/usr/bin/env bash
# The one writer of a spec's status (status-state R2, R3): <workspace>/state/<spec-id>.json, one key per line.
# Usage: state.sh <spec-id> <move> [<field>=<value>…]     state.sh <spec-id> show|stale     state.sh migrate
#   Spec moves:   write, approve [by=], edit
#   Plan moves:   plan, plan-approve, build-start, task-done task=<T>, implemented     (each with work=<work>)
#   Review moves: review-open pr=<n>, merged pr=<n>, closed pr=<n>                   (work=<work>; merged
#   and closed per pull request: the review is merged when all are, closed when one is and none is open: D4)
#   build-start may name task=<T>: the first moves the plan to building; each is logged as task.started once.
#   Any stage:    hold stage=<stage> reason=<text>, release        (work= defaults to the spec's newest plan)
# A move applies only from the stages the table in state-lib.awk allows, under the lock state/.lock-<spec>; the
# state is written to a temp file and moved into place, then the spec's or plan's status: line is set and the
# move is logged through event.sh with its sequence number (D2). Other fields go into the event only.
# A spec with no state, or a plan on disk its state lacks, is first seeded from files and events as migrate does.
# plan-approve keeps a cksum of each covered requirement (cover.<work>.<R>); stale prints each plan whose covered
# text changed since (D3). migrate writes every spec's state from files and events; it is not a move: no events.
# Values of work, task, pr, stage and reason are letters, digits and "#._ -"; others refuse " and \.
# Exit 0 when applied or already so ("<…> is already …"), 2 on bad usage, 3 when not allowed (nothing changed),
# 4 when the lock can't be had within 5 s.

export LC_ALL=C   # character classes mean ASCII only, whatever the caller's locale
here="$(cd "$(dirname "$0")" && pwd)"
spec="$1"; move="$2"; tab=$(printf '\t')
usage() { echo "usage: state.sh <spec-id> <move> [<field>=<value>…]" >&2; exit 2; }
[ -n "$spec" ] || usage
root=$(bash "$here/root.sh")
dir="$root/state"

# A front-matter value, and the status value.
fm() { awk -v K="$2" '{ sub(/\r$/, "") } NR == 1 && $0 == "---" { fm = 1; next } fm && $0 == "---" { exit }
  fm && index($0, K ":") == 1 { sub(/^[^:]*:[ ]*/, ""); sub(/[ ]+#.*/, ""); print; exit }' "$1"; }
status_of() { v=$(fm "$1" status); printf '%s\n' "${v%%[ #]*}"; }

# covers <work>: "cover.<work>.<R>\t<cksum>" for each requirement in the plan's scope as $specf reads now: its block
# from the heading to the next, whitespace collapsed, Source: lines left out; retired or missing ones not at all (D3).
covers() {
  h="$root/work/$1/plan.md"; [ -f "$h" ] || h="$root/work/$1/tasks.md"
  [ -f "$h" ] || return 0
  awk -v SCOPE=" $(fm "$h" scope | tr -d '[],') " '
    function flush() { if (id != "" && index(SCOPE, " " id " ") && !(id in gone)) { gsub(/[ \t\r]+/, " ", txt); sub(/^ /, "", txt); sub(/ $/, "", txt); print id "\t" txt }; id = ""; txt = "" }
    { sub(/\r$/, "") }
    NR == 1 && $0 == "---" { fm = 1; next }
    fm && $0 == "---" { fm = 0; next }
    fm { if (/^retired:/) { gsub(/[][,]/, " "); n = split($0, a, " "); for (i = 2; i <= n; i++) gone[a[i]] = 1 } next }
    /^## / || (/^### / && !/^### Requirement:/) { flush(); next }
    /^### Requirement: R[0-9]+/ { flush(); id = $3 }
    id != "" && !/^[ \t]*Source:/ { txt = txt " " $0 }
    END { flush() }' "$specf" |
  while IFS="$tab" read -r r text; do printf 'cover.%s.%s\t%s\n' "$1" "$r" "$(printf '%s' "$text" | cksum | awk '{ print $1 " " $2 }')"; done
}

# seed <spec or "">: "<spec>\t<key>\t<value>" lines from files and events (state-seed.awk).
seed() { (
  shopt -s nullglob
  set -- "$root"/specs/*.md "$root"/work/*/plan.md "$root"/work/*/tasks.md "$root"/work/*/*/tasks.md
  [ -f "$root/events.jsonl" ] && set -- "$@" "$root/events.jsonl"
  [ $# -gt 0 ] && awk -v ONLY="$only" -f "$here/state-seed.awk" "$@"
) }
# seeded <seed file>: "key\tvalue" for what $spec's state ($src) lacks: spec, plan and seq when it has none, and every
# plan's keys when it lacks that plan (but $skip), with the covers taken now for a plan that isn't stale today.
seeded() {
  awk -F'\t' -v S="$spec" '$1 == S { print $2 "\t" $3 }' "$1" |
  awk -F'\t' -v X="$skip" 'FILENAME == ARGV[1] { if (match($0, /^  "[^"]*"/)) have[substr($0, 4, RLENGTH - 4)] = 1; next }
    { w = ($1 == "snap") ? $2 : $1; sub(/^[a-z_]+\./, "", w); sub(/\..*/, "", w)
      if (w != X && ((w == $1) ? !($1 in have) : !(("plan." w) in have))) print }' "$src" - |
  while IFS="$tab" read -r k v; do if [ "$k" = snap ]; then covers "$v"; else printf '%s\t%s\n' "$k" "$v"; fi; done
}

# write_state <file>: "key\tvalue" lines in, the state out in the fixed key order (D2), through a temp file in
# state/; a file whose bytes wouldn't change is left alone.
write_state() {
  t="$dir/.${1##*/}.$$"
  awk -F'\t' '{ k = $1; r = 50
      if (k == "spec") r = 0; else if (k == "plan") r = 1; else if (k == "seq") r = 99
      else if (k ~ /^plan\./) r = 2; else if (k ~ /^(tasks|started)\./) r = 3; else if (k ~ /^total\./) r = 4; else if (k ~ /^cover\./) r = 5
      else if (k ~ /^review\./) r = 6; else if (k ~ /^(prs|merged|closed)\./) r = 7; else if (k ~ /^hold\./) r = 8; else if (k ~ /^hold_since\./) r = 9
      print r "\t" $0 }' | sort -t "$tab" -k1,1n -k2,2 |
    awk -F'\t' '{ L[NR] = "  \"" $2 "\": \"" $3 "\"" } END { print "{"; for (i = 1; i <= NR; i++) print L[i] (i < NR ? "," : ""); print "}" }' > "$t" &&
    { cmp -s "$t" "$1" && rm -f "$t" || mv "$t" "$1"; } || { rm -f "$t"; echo "state.sh: could not write $1" >&2; return 1; }
}

# The lock: mkdir is atomic, and the holder writes its pid into it. Wait up to 5 s. A lock is stale, left from a
# crash, when its pid is no longer running or it is older than 30 s (no move takes that long) (D2).
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }
stale() {
  pid=$(cat "$1/pid" 2>/dev/null)
  case "$pid" in ""|*[!0-9]*) ;; *) err=$(kill -0 "$pid" 2>&1) || case "$err" in *ermitted*) ;; *) return 0 ;; esac ;; esac
  m=$(mtime "$1"); [ -n "$m" ] && [ $(( $(date +%s) - m )) -gt 30 ]
}
# Taking over: one waiter at a time (mkdir .take-<spec>), which checks again that the lock is stale, then
# renames it aside, so a fresh lock made after another waiter's take-over is never removed.
take_over() {
  mkdir "$dir/.take-$spec" 2>/dev/null || { stale "$dir/.take-$spec" && rm -rf "$dir/.take-$spec"; return 1; }
  took=1; stale "$lock" && mv "$lock" "$lock.stale.$$" 2>/dev/null && rm -rf "$lock.stale.$$" && took=0
  rmdir "$dir/.take-$spec"; return $took
}
lock=""
lock_spec() {
  mkdir -p "$dir" || exit 1
  lock="$dir/.lock-$spec"; tries=0
  until mkdir "$lock" 2>/dev/null; do
    stale "$lock" && take_over && continue
    tries=$((tries + 1))
    [ $tries -ge 50 ] && { echo "$spec is locked by another state.sh ($lock); try again" >&2; exit 4; }
    sleep 0.1
  done
  echo $$ > "$lock/pid"
}
unlock() { [ -n "$lock" ] && { rm -f "$lock/pid"; rmdir "$lock" 2>/dev/null; }; lock=""; }
trap unlock EXIT

# migrate: every spec's state from files and events, each under its lock; a state it can't read is left alone.
if [ "$spec" = migrate ]; then
  mkdir -p "$dir" || exit 1
  sd="$dir/.seed.$$"; only=""; seed > "$sd"; n=0
  for specf in "$root"/specs/*.md; do
    [ -f "$specf" ] || continue
    spec="${specf##*/}"; spec="${spec%.md}"
    case "$spec" in *[!A-Za-z0-9_.-]*|.*) continue ;; esac
    lock_spec   # before reading: a move may create or change the state meanwhile
    file="$dir/$spec.json"; src="$file"; [ -f "$src" ] || src=/dev/null
    if grep -Evq '^([{}]|  "[^"]*": "[^"]*",?)$' "$src"; then echo "state/$spec.json is not readable; left alone" >&2; unlock; continue; fi
    { awk -F'"' 'NF >= 5 { print $2 "\t" $4 }' "$src"; seeded "$sd"; } | write_state "$file" && n=$((n + 1))
    unlock
  done
  rm -f "$sd"; echo "migrate: $n spec(s) have a state"; exit 0
fi

[ -n "$move" ] || usage
case "$spec" in *[!A-Za-z0-9_.-]*|.*) echo "bad spec id: $spec" >&2; exit 2 ;; esac
file="$dir/$spec.json"; specf="$root/specs/$spec.md"
if [ "$move" = show ]; then
  [ -f "$file" ] || { echo "no state for $spec" >&2; exit 1; }
  cat "$file"; exit 0
fi
if [ "$move" = stale ]; then
  [ -f "$file" ] && [ -f "$specf" ] || exit 0
  # Stale: a covered requirement's sum differs, or one is retired or missing; once its review is merged, only a
  # covered requirement still in the spec that changed counts (D6). cover.<work>.stale matches no current sum.
  for w in $(awk -F'"' '$2 ~ /^plan\./ && ($4 == "approved" || $4 == "building" || $4 == "implemented") { print substr($2, 6) }' "$file"); do
    covers "$w" | awk -F'\t' -v P="cover.$w." -v R="review.$w" 'FILENAME == ARGV[1] { split($0, q, "\"")
        if (index(q[2], P) == 1) { s[q[2]] = q[4]; n++ } else if (q[2] == R) m = (q[4] == "merged"); next }
      { if (!($1 in s) || s[$1] != $2) bad = 1; else hit++ }
      END { exit !(bad || (!m && hit != n)) }' "$file" - && echo "$w"
  done
  exit 0
fi
case " write approve edit plan plan-approve build-start task-done implemented review-open merged closed hold release " in
  *" $move "*) ;;
  *) echo "unknown move: $move" >&2; usage ;;
esac
[ -f "$specf" ] || { echo "no spec at $specf" >&2; exit 2; }

# Fields: those kept in the state are checked strictly; the rest are passed to the event as strings (or numbers).
shift 2
work=""; task=""; pr=""; stage=""; reason=""; extra=""; by=""; via=""; at=""
for arg in "$@"; do
  k="${arg%%=*}"; v="${arg#*=}"
  case "$arg" in *=*) ;; *) usage ;; esac
  case "$k" in ""|*[!a-z_]*) echo "bad field name: $k" >&2; exit 2 ;; esac
  case "$k" in
    work|task|pr|stage|reason)
      case "$v" in *[!A-Za-z0-9#._\ -]*) echo "$k may hold only letters, digits and #._ - : $v" >&2; exit 3 ;; esac
      case "$k:$v" in task:*" "*|pr:*" "*) echo "$k may not hold a space: $v" >&2; exit 3 ;; esac
      eval "$k=\$v" ;;
    *)
      case "$v" in *'"'*|*\\*|*"
"*) echo "$k may not hold \" or \\ or a line break" >&2; exit 3 ;; esac
      case "$k" in by|via|at) eval "$k=\$v" ;; esac
      case "$k:$v" in lines:*|seq:*|total:*|tasks:*) case "$v" in ""|*[!0-9]*) extra="$extra,\"$k\":\"$v\"" ;; *) extra="$extra,\"$k\":$v" ;; esac ;; *) extra="$extra,\"$k\":\"$v\"" ;; esac ;;
  esac
done
case "$stage" in *[!a-z]*) echo "stage must be one lowercase word: $stage" >&2; exit 3 ;; esac

# Setting the status: line (through a temp file).
set_status() {
  [ -f "$1" ] || return 0
  [ "$(status_of "$1")" = "$2" ] && return 0
  awk -v S="$2" 'NR == 1 && $0 == "---" { fm = 1; print; next }
    fm == 1 && $0 == "---" { fm = 2 }
    fm == 1 && /^status:/ { sub(/^status:[ ]*[^ #]*/, "status: " S); fm = 2 }
    { print }' "$1" > "$1.$$" && mv "$1.$$" "$1"
}

# Setting front-matter fields (through a temp file): each key's line is replaced, or added before the closing ---;
# "missing" leaves a key that already has a value alone.
set_fm() {   # <file> <missing|always> <key> <value>…
  f="$1"; mode="$2"; shift 2
  while [ $# -ge 2 ]; do
    [ "$mode" = always ] || [ -z "$(fm "$f" "$1")" ] && awk -v K="$1" -v V="$2" 'NR == 1 && $0 == "---" { fm = 1; print; next }
      fm == 1 && $0 == "---" { if (!done) print K ": " V; fm = 2 }
      fm == 1 && index($0, K ":") == 1 { print K ": " V; done = 1; next }
      { print }' "$f" > "$f.$$" && mv "$f.$$" "$f"
    shift 2
  done
}
# approval <file> <mode>: approved_by and approved_at, from by= and at= (default today, UTC).
approval() {
  [ -f "$1" ] || return 0
  who="${by:-$(git config user.name 2>/dev/null)}"; who="${who:-unknown}"; [ "$via" = companion ] && who="$who (via companion)"
  set_fm "$1" "$2" approved_by "$who" approved_at "${at:-$(date -u +%Y-%m-%d)}"
}

lock_spec

# The state as it stands, plus what it lacks seeded from files and events (as migrate would): only when there is no
# state, or a plan of this spec on disk (plan.md, or the old single tasks.md) has no entry. The plan a plan move
# names is never seeded: that move records it.
src="$file"; [ -f "$src" ] || src=/dev/null
skip=""; [ "$move" = plan ] && skip="$work"
need=$([ -f "$file" ] || echo 1)
if [ -z "$need" ]; then
  for h in $(grep -lx "spec: $spec" "$root"/work/*/plan.md "$root"/work/*/tasks.md 2>/dev/null); do
    w="${h%/*}"; w="${w##*/}"
    [ "${h##*/}" = tasks.md ] && [ -f "${h%/*}/plan.md" ] && continue
    [ "$w" = "$skip" ] || grep -qF "  \"plan.$w\":" "$file" || { need=1; break; }
  done
fi
add=""
if [ -n "$need" ]; then
  sd="$dir/.seed-$spec.$$"; only="$spec"; seed > "$sd"
  add=$(seeded "$sd" | awk -F'\t' '{ print "  \"" $1 "\": \"" $2 "\"" }'); rm -f "$sd"
fi
state() { cat "$src"; [ -z "$add" ] || printf '%s\n' "$add"; }

# The plan's task count, from its tasks files in either layout.
[ -z "$work" ] && work=$(state | sed -n 's/^  "plan": "\(.*\)",*$/\1/p' | head -n1)
total=0
if [ -n "$work" ] && [ -d "$root/work/$work" ]; then
  total=$(cat "$root/work/$work"/*/tasks.md "$root/work/$work"/tasks.md 2>/dev/null | sed -n 's/^### \(T[0-9][0-9]*\):.*/\1/p' | sort -u | grep -c .)
fi
cover=""; [ "$move" = plan-approve ] && [ -n "$work" ] && cover=$(covers "$work" | awk -F'\t' '{ printf "%s%s=%s", (NR > 1 ? ";" : ""), $1, $2 }')
case "$(status_of "$specf")" in approved|live) init=approved ;; *) init=draft ;; esac
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# A task whose newest outcome in the log is a failure or block may be started again (a retry), though it was started.
retry=""
[ "$move" = build-start ] && [ -n "$task" ] && [ -f "$root/events.jsonl" ] &&
  [ "$(grep -E "\"type\":\"task\.(started|failed|blocked)\",\"work\":\"$work\"" "$root/events.jsonl" | grep -F "\"task\":\"$task\"" | tail -n1 | sed 's/.*"type":"task\.\([a-z]*\)".*/\1/')" != started ] && retry=1
out=$(state | awk -v RETRY="$retry" -v SPEC="$spec" -v MOVE="$move" -v W="$work" -v TASK="$task" -v PR="$pr" -v STAGE="$stage" -v REASON="$reason" \
  -v TOTAL="$total" -v NOW="$now" -v INIT="$init" -v COVER="$cover" -f "$here/state-lib.awk")
case "$out" in
  "already "*)   # an approval a failed write left without its names is filled in; one that has them is left alone
    case "$move" in
      approve) approval "$specf" missing ;;
      plan-approve) h="$root/work/$work/plan.md"; [ -f "$h" ] || h="$root/work/$work/tasks.md"; approval "$h" missing ;;
    esac
    printf '%s\n' "${out#already }"; exit 0 ;;
  "refuse "*) printf '%s\n' "${out#refuse }" >&2; exit 3 ;;
  ok*) ;;
  *) echo "state.sh: no result for $move" >&2; exit 1 ;;
esac
printf '%s\n' "$out" | sed 1d | write_state "$file" || exit 1
seq=$(sed -n 's/^  "seq": "\([0-9]*\)".*/\1/p' "$file")

# The status: line that matches, and the event (the state stands even if the event is lost: D2).
plan_head="$root/work/$work/plan.md"; [ -f "$plan_head" ] || plan_head="$root/work/$work/tasks.md"
case "$move" in
  write|edit) set_status "$specf" draft ;;
  approve) case "$(status_of "$specf")" in approved|live) approval "$specf" missing ;; *) set_status "$specf" approved; approval "$specf" always ;; esac ;;
  plan-approve) set_status "$plan_head" approved; approval "$plan_head" always ;;
esac
case "$move" in
  write) type=spec.created ;; approve) type=spec.approved ;; edit) type=spec.edited ;;
  plan) type=plan.created ;; plan-approve) type=plan.approved ;; build-start) type=task.started ;;
  task-done) type=task.done ;; implemented) type=plan.implemented ;; review-open) type=review.opened ;;
  merged) type=review.merged ;; closed) type=review.closed ;; hold) type=stage.held ;; release) type=stage.released ;;
esac
data="{\"move\":\"$move\",\"seq\":$seq"
case "$type" in
  spec.*) subject="$spec" ;;
  *) subject="$work"; data="$data,\"spec\":\"$spec\"" ;;
esac
[ -n "$task" ] && data="$data,\"task\":\"$task\""
[ -n "$pr" ] && data="$data,\"pr\":\"$pr\""
[ -n "$stage" ] && data="$data,\"stage\":\"$stage\""
[ -n "$reason" ] && data="$data,\"reason\":\"$reason\""
[ "$move" = implemented ] && data="$data,\"tasks\":$total"
FACTREE_STATE_WRITER=1 bash "$here/event.sh" "$type" "$subject" "$data$extra}" || echo "state.sh: $move recorded, but its event wasn't logged" >&2
echo "$spec: $move"
