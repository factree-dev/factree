#!/usr/bin/env bash
# Mark a built task done: tick its steps, log task.done, and mark the plan implemented when it was the last.
# Usage: task-done.sh <work> <task> <commit> <changed-lines> <tests-run>
#   e.g. task-done.sh 015-build T1 3f2a9c1 142 "npm test"
# Prints "<task> done", then "<work> implemented" if every task in the plan is now done.
# Exit 0 when marked; 2 on bad usage or an unknown task. (spec build R4, R6)

work="$1"; task="$2"; commit="$3"; lines="$4"; tests="$5"
if [ -z "$work" ] || [ -z "$commit" ] || [ -z "$tests" ] || ! printf '%s' "$task" | grep -qE '^T[0-9]+$' || ! printf '%s' "$lines" | grep -qE '^[0-9]+$'; then
  echo "usage: task-done.sh <work> <task T<n>> <commit> <changed-lines> <tests-run>" >&2; exit 2
fi
case "$work" in *[!A-Za-z0-9_.-]*) echo "bad work id: $work" >&2; exit 2 ;; esac
here="$(cd "$(dirname "$0")" && pwd)"
root=$(bash "$here/root.sh")
dir="$root/work/$work"
[ -d "$dir" ] || { echo "no plan at $dir" >&2; exit 2; }

file=$(grep -l "^### $task:" "$dir"/*/tasks.md "$dir"/tasks.md 2>/dev/null | head -n1)
[ -n "$file" ] || { echo "$task is not a task in $work" >&2; exit 2; }

# Tick every step of this task, and only this task.
tmp="$file.$$"
awk -v T="### $task:" '
  index($0, T) == 1 { inside = 1; print; next }
  /^### / { inside = 0 }
  inside && /^- \[ \] / { sub(/^- \[ \] /, "- [x] ") }
  { print }' "$file" > "$tmp" && mv "$tmp" "$file"

. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
bash "$here/event.sh" task.done "$work" "{\"task\":\"$task\",\"commit\":\"$(json_escape "$commit")\",\"lines\":$lines,\"tests\":\"$(json_escape "$tests")\"}" || exit 1
echo "$task done"

# Implemented when every task in the plan has a task.done event.
all=$(cat "$dir"/*/tasks.md "$dir"/tasks.md 2>/dev/null | sed -n 's/^### \(T[0-9][0-9]*\):.*/\1/p' | sort -u)
done_ids=$(grep "\"type\":\"task.done\",\"work\":\"$work\"" "$root/events.jsonl" 2>/dev/null | sed -n 's/.*"task":"\(T[0-9][0-9]*\)".*/\1/p' | sort -u)
missing=$(printf '%s\n' "$all" | while read -r id; do [ -n "$id" ] && ! printf '%s\n' "$done_ids" | grep -qx "$id" && echo "$id"; done)
[ -n "$missing" ] && exit 0

head="$dir/plan.md"; [ -f "$head" ] || head="$dir/tasks.md"
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
tmp="$head.$$"
awk -v NOW="$now" '
  NR == 1 && $0 == "---" { fm = 1; print; next }
  fm == 1 && /^implemented_at:/ { print "implemented_at: " NOW; set = 1; next }
  fm == 1 && $0 == "---" { if (!set) print "implemented_at: " NOW; fm = 2 }
  { print }' "$head" > "$tmp" && mv "$tmp" "$head"
bash "$here/event.sh" plan.implemented "$work" "{\"tasks\":$(printf '%s\n' "$all" | grep -c .)}" || exit 1
echo "$work implemented"
