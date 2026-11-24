#!/usr/bin/env bash
# The one writer of a spec's status (status-state R2, R3): <workspace>/state/<spec-id>.json, one key per line.
# Usage: state.sh <spec-id> <move> [<field>=<value>…]     state.sh <spec-id> show
#   Spec moves:   write, approve [by=], edit
#   Plan moves:   plan, plan-approve, build-start, task-done task=<T>, implemented     (each with work=<work>)
#   Review moves: review-open pr=<n>, merged, closed                                  (work=<work>)
#   Any stage:    hold stage=<stage> reason=<text>, release        (work= defaults to the spec's newest plan)
# A move applies only from the stages the table in state-lib.awk allows, under the lock state/.lock-<spec>; the
# state is written to a temp file and moved into place, then the spec's or plan's status: line is set and the
# move is logged through event.sh with its sequence number (D2). Other fields go into the event only.
# Values of work, task, pr, stage and reason are letters, digits and "#._ -"; others refuse " and \.
# Exit 0 when applied or already so ("<…> is already …"), 2 on bad usage, 3 when not allowed (nothing changed),
# 4 when the lock can't be had within 5 s.

here="$(cd "$(dirname "$0")" && pwd)"
spec="$1"; move="$2"
usage() { echo "usage: state.sh <spec-id> <move> [<field>=<value>…]" >&2; exit 2; }
[ -n "$spec" ] && [ -n "$move" ] || usage
case "$spec" in *[!A-Za-z0-9_.-]*|.*) echo "bad spec id: $spec" >&2; exit 2 ;; esac
root=$(bash "$here/root.sh")
dir="$root/state"; file="$dir/$spec.json"

if [ "$move" = show ]; then
  [ -f "$file" ] || { echo "no state for $spec" >&2; exit 1; }
  cat "$file"; exit 0
fi
case " write approve edit plan plan-approve build-start task-done implemented review-open merged closed hold release " in
  *" $move "*) ;;
  *) echo "unknown move: $move" >&2; usage ;;
esac
specf="$root/specs/$spec.md"
[ -f "$specf" ] || { echo "no spec at $specf" >&2; exit 2; }

# Fields: those kept in the state are checked strictly; the rest are passed to the event as strings (or numbers).
shift 2
work=""; task=""; pr=""; stage=""; reason=""; extra=""
for arg in "$@"; do
  k="${arg%%=*}"; v="${arg#*=}"
  case "$arg" in *=*) ;; *) usage ;; esac
  case "$k" in ""|*[!a-z_]*) echo "bad field name: $k" >&2; exit 2 ;; esac
  case "$k" in
    work|task|pr|stage|reason)
      case "$v" in *[!A-Za-z0-9#._\ -]*) echo "$k may hold only letters, digits and #._ - : $v" >&2; exit 3 ;; esac
      eval "$k=\$v" ;;
    *)
      case "$v" in *'"'*|*\\*|*"
"*) echo "$k may not hold \" or \\ or a line break" >&2; exit 3 ;; esac
      case "$v" in ""|*[!0-9]*) extra="$extra,\"$k\":\"$v\"" ;; *) extra="$extra,\"$k\":$v" ;; esac ;;
  esac
done
case "$stage" in *[!a-z]*) echo "stage must be one lowercase word: $stage" >&2; exit 3 ;; esac

# The front matter's status value, and setting it (through a temp file).
status_of() { awk 'NR == 1 && $0 == "---" { fm = 1; next } fm && $0 == "---" { exit } fm && /^status:/ { sub(/^status:[ ]*/, ""); sub(/[ #].*/, ""); print; exit }' "$1"; }
set_status() {
  [ -f "$1" ] || return 0
  [ "$(status_of "$1")" = "$2" ] && return 0
  awk -v S="$2" 'NR == 1 && $0 == "---" { fm = 1; print; next }
    fm == 1 && $0 == "---" { fm = 2 }
    fm == 1 && /^status:/ { sub(/^status:[ ]*[^ #]*/, "status: " S); fm = 2 }
    { print }' "$1" > "$1.$$" && mv "$1.$$" "$1"
}

# The lock: mkdir is atomic. Wait up to 5 s; a lock older than 30 s is left from a crash and removed (D2).
mkdir -p "$dir" || exit 1
lock="$dir/.lock-$spec"
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }
tries=0
until mkdir "$lock" 2>/dev/null; do
  m=$(mtime "$lock")
  if [ -n "$m" ] && [ $(( $(date +%s) - m )) -gt 30 ]; then rm -rf "$lock"; continue; fi
  tries=$((tries + 1))
  [ $tries -ge 50 ] && { echo "$spec is locked by another state.sh ($lock); try again" >&2; exit 4; }
  sleep 0.1
done
trap 'rmdir "$lock" 2>/dev/null' EXIT

# The plan's task count, from its tasks files in either layout.
[ -z "$work" ] && [ -f "$file" ] && work=$(sed -n 's/^  "plan": "\(.*\)",*$/\1/p' "$file")
total=0
if [ -n "$work" ] && [ -d "$root/work/$work" ]; then
  total=$(cat "$root/work/$work"/*/tasks.md "$root/work/$work"/tasks.md 2>/dev/null | sed -n 's/^### \(T[0-9][0-9]*\):.*/\1/p' | sort -u | grep -c .)
fi
case "$(status_of "$specf")" in approved|live) init=approved ;; *) init=draft ;; esac
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

src="$file"; [ -f "$src" ] || src=/dev/null
out=$(awk -v SPEC="$spec" -v MOVE="$move" -v W="$work" -v TASK="$task" -v PR="$pr" -v STAGE="$stage" -v REASON="$reason" \
  -v TOTAL="$total" -v NOW="$now" -v INIT="$init" -f "$here/state-lib.awk" "$src")
case "$out" in
  "already "*) printf '%s\n' "${out#already }"; exit 0 ;;
  "refuse "*) printf '%s\n' "${out#refuse }" >&2; exit 3 ;;
  ok*) ;;
  *) echo "state.sh: no result for $move" >&2; exit 1 ;;
esac

# Write the new state in the fixed key order, to a temp file in state/, then move it into place.
tmp="$dir/.$spec.json.$$"
printf '%s\n' "$out" | sed 1d | LC_ALL=C sort -t "$(printf '\t')" -k1,1n -k2,2 |
  awk -F'\t' '{ L[NR] = "  \"" $2 "\": \"" $3 "\"" } END { print "{"; for (i = 1; i <= NR; i++) print L[i] (i < NR ? "," : ""); print "}" }' > "$tmp" &&
  mv "$tmp" "$file" || { rm -f "$tmp"; echo "state.sh: could not write $file" >&2; exit 1; }
seq=$(sed -n 's/^  "seq": "\([0-9]*\)".*/\1/p' "$file")

# The status: line that matches, and the event (the state stands even if the event is lost: D2).
plan_head="$root/work/$work/plan.md"; [ -f "$plan_head" ] || plan_head="$root/work/$work/tasks.md"
case "$move" in
  write|edit) set_status "$specf" draft ;;
  approve) case "$(status_of "$specf")" in approved|live) ;; *) set_status "$specf" approved ;; esac ;;
  plan-approve) set_status "$plan_head" approved ;;
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
case "$pr" in "") ;; *[!0-9]*) data="$data,\"pr\":\"$pr\"" ;; *) data="$data,\"pr\":$pr" ;; esac
[ -n "$stage" ] && data="$data,\"stage\":\"$stage\""
[ -n "$reason" ] && data="$data,\"reason\":\"$reason\""
[ "$move" = implemented ] && data="$data,\"tasks\":$total"
FACTREE_STATE_WRITER=1 bash "$here/event.sh" "$type" "$subject" "$data$extra}" || echo "state.sh: $move recorded, but its event wasn't logged" >&2
echo "$spec: $move"
