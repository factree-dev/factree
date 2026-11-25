#!/usr/bin/env bash
# All script tests. Run from the repo root: bash tests/run.sh
P=plugins/factree
SPECV=$P/skills/spec/scripts/validate.sh
PLANV=$P/skills/plan/scripts/validate-plan.sh
DETECT=$P/scripts/detect.sh
ROOT=$P/scripts/root.sh
fail=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

echo "# spec validator"
out=$(bash $SPECV tests/fixtures/workspace/specs/link-report.md); code=$?
check "example spec passes with no errors or warnings" '[ $code -eq 0 ] && echo "$out" | grep -q "0 error(s), 0 warning(s)"'
out=$(bash $SPECV tests/validate/bad/broken-export.md); code=$?
check "broken spec fails" '[ $code -eq 1 ]'
for msg in "has no scenarios" "duplicate requirement id R1" "has no SHALL" "has no \*\*THEN\*\*" \
           "listed in retired" "requirement heading must be" "out of order" "does not match file name" \
           "sources is empty" "approved_by/approved_at" "missing section \"## Code\"" \
           "which is not an open question" "which is not a requirement" "still listed as open" \
           "vague word \"fast\"" "does not say why"; do
  check "spec: reports $msg" 'echo "$out" | grep -q "$msg"'
done

out=$(bash $SPECV tests/validate/sketch.md); code=$?
check "a Sketch section after Requirements is accepted" '[ $code -eq 0 ] && echo "$out" | grep -q "0 error(s), 0 warning(s)"'
tmp=$(mktemp -d); grep -v '^\*\*Anti-goals:\*\*' tests/fixtures/workspace/specs/link-report.md > "$tmp/link-report.md"
out=$(bash $SPECV "$tmp/link-report.md"); code=$?
check "no Sketch, nothing said about one [spec-writing#R1.S3]" '! echo "$out" | grep -qi "sketch"'
check "no anti-goals: passes with one warning [spec-writing#R2.S2]" '[ $code -eq 0 ] && echo "$out" | grep -q "Scope has no Anti-goals line" && echo "$out" | grep -q "0 error(s), 1 warning(s)"'
rm -rf "$tmp"
out=$(bash $SPECV tests/validate/flow.md); code=$?
check "a wrong citation [spec-flow#R5.S1]" '[ $code -eq 1 ] && echo "$out" | grep -q "cites R9.S1, which is not a scenario"'
check "a malformed flow line" 'echo "$out" | grep -q "flow line needs"'
check "flow lines citing real scenarios pass" '! echo "$out" | grep -q "R2.S1\|R2.S2"'

echo "# plan validator"
out=$(bash $PLANV tests/fixtures/workspace/work/001-link-report); code=$?
check "example plan passes with full coverage [plan-verticals#R6.S4]" '[ $code -eq 0 ] && echo "$out" | grep -q "9/9 in-scope scenario(s) proved" && echo "$out" | grep -q "0 error(s), 0 warning(s)"'
out=$(bash $PLANV tests/fixtures/workspace/work/002-link-report); code=$?
check "two-vertical example passes" '[ $code -eq 0 ] && echo "$out" | grep -q "4/4 in-scope scenario(s) proved" && echo "$out" | grep -q "0 error(s), 0 warning(s)"'
out=$(bash $PLANV tests/validate-plan/bad tests/fixtures/workspace/specs/link-report.md); code=$?
check "broken plan fails" '[ $code -eq 1 ]'
for msg in "cites no file" "reused pattern must start" "does not say why existing patterns" \
           "does not exist in the spec" "is not in spec link-report" "malformed scenario reference" \
           "is not an earlier task" "over the review budget" "task heading must be" "differs from design.md scope" \
           "not a requirement in the spec" "design_approved_by/at are not set" "missing section \"## Flows\"" \
           "no \"Approved:" "has no \*\*Proves:\*\* line" "has no \*\*Files\*\* list" "has no checkbox steps" \
           "is not proved by any task" "has no source" "has no commit step"; do
  check "plan: reports $msg" 'echo "$out" | grep -q "$msg"'
done
VP=tests/validate-plan/verticals
out=$(bash $PLANV $VP/plan $VP/widget-export.md); code=$?
check "valid two-vertical plan passes [plan-verticals#R6.S1]" '[ $code -eq 0 ] && echo "$out" | grep -q "in 2 vertical(s)" && echo "$out" | grep -q "0 error(s), 0 warning(s)"'
check "dependency across verticals is fine [plan-verticals#R3.S1]" '! echo "$out" | grep -q "not an earlier task"'
check "scenario proved in two verticals counts once [plan-verticals#R2.S4]" 'echo "$out" | grep -q "4/4 in-scope scenario(s) proved"'
tmp=$(mktemp -d); cp -R $VP/plan "$tmp/plan"; cp $VP/plan/backend/design.md "$tmp/plan/design.md"
out=$(bash $PLANV "$tmp/plan" $VP/widget-export.md); code=$?
check "stray top-level design.md is warned [plan-verticals#R6.S5]" '[ $code -eq 0 ] && echo "$out" | grep -q "stray design.md"'
rm -rf "$tmp"
tmp=$(mktemp -d); cp -R $VP/plan "$tmp/new"; sed -i.bak 's/^created: 2026-11-16$/created: 2026-11-19/' "$tmp/new/plan.md"
out=$(bash $PLANV "$tmp/new" $VP/widget-export.md); code=$?
check "a new plan without Review focus fails [planning#R2.S3]" '[ $code -eq 1 ] && echo "$out" | grep -q "missing section \"## Review focus\"" && echo "$out" | grep -q "missing section \"## Global constraints\""'
printf '\n## Global constraints\nNone.\n\n## Review focus\nNone found.\n' >> "$tmp/new/plan.md"
out=$(bash $PLANV "$tmp/new" $VP/widget-export.md); code=$?
check "Review focus \"None found\" and Global constraints \"None\" pass [planning#R2.S2] [planning#R3.S2]" '[ $code -eq 0 ] && echo "$out" | grep -q "0 error(s), 0 warning(s)"'
sed -i.bak 's/^- \[ \] 1\. Write failing tests.*/- [ ] 1. Write the failing tests/' "$tmp/new/backend/tasks.md"
out=$(bash $PLANV "$tmp/new" $VP/widget-export.md)
check "steps that name nothing are warned [planning#R1.S2]" 'echo "$out" | grep -q "T1: steps name no test or signature"'
rm -rf "$tmp"
out=$(bash $PLANV tests/validate-plan/verticals-bad $VP/widget-export.md); code=$?
check "broken vertical plan fails" '[ $code -eq 1 ]'
check "same task id in two verticals [plan-verticals#R3.S2]" 'echo "$out" | grep "duplicate task id T2" | grep -q "backend/tasks.md" && echo "$out" | grep "duplicate task id T2" | grep -q "frontend/tasks.md"'
check "depending on a later task [plan-verticals#R3.S3]" 'echo "$out" | grep -q "T3 depends on T4, which is not an earlier task"'
check "scenario no task proves [plan-verticals#R6.S2]" 'echo "$out" | grep -q "widget-export#R2.S3 is not proved by any task"'
check "dependency on a missing task [plan-verticals#R6.S3]" 'echo "$out" | grep -q "T5 depends on T9"'
check "pattern ids unique across verticals" 'echo "$out" | grep -q "duplicate pattern id P1"'
tmp=$(mktemp -d); cp -R $VP/plan "$tmp/plan"; sed -i.bak "s/### T3:/### T4:/" "$tmp/plan/backend/tasks.md"; rm "$tmp/plan/backend/tasks.md.bak"
out=$(bash $PLANV "$tmp/plan" $VP/widget-export.md)
check "gap in task numbers is warned" 'echo "$out" | grep -q "task numbers skip T3"'
tmp=$(mktemp -d); cp -R $VP/plan "$tmp/plan"; printf '\n```mermaid\nsequence Diagram\n  A->>B: hi\n```\n' >> "$tmp/plan/backend/design.md"
out=$(bash $PLANV "$tmp/plan" $VP/widget-export.md)
check "unknown diagram kind is warned [plan-diagrams#R4.S1]" 'echo "$out" | grep -q "backend/design.md:[0-9]*: mermaid block starts with \"sequence Diagram\""'
printf '\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n\n```mermaid\nflowchart LR\n  A --> B\n```\n' > "$tmp/extra.md"; cp $VP/plan/frontend/design.md "$tmp/plan/frontend/design.md"; cat "$tmp/extra.md" >> "$tmp/plan/frontend/design.md"
out=$(bash $PLANV "$tmp/plan" $VP/widget-export.md)
check "known diagram kinds pass [plan-diagrams#R4.S2]" '[ $(echo "$out" | grep -c "mermaid block") -eq 1 ]'
rm -rf "$tmp"
tmp=$(mktemp -d); cp -R $VP/plan "$tmp/plan"; sed "s/^status: approved$/status: draft/" $VP/widget-export.md > "$tmp/spec.md"
out=$(bash $PLANV "$tmp/plan" "$tmp/spec.md"); code=$?
check "approved plan of a draft spec fails [decision-flow#R5.S1]" '[ $code -eq 1 ] && echo "$out" | grep -q "spec is draft; it must be approved before the plan is"'
sed -i.bak "s/^status: approved$/status: draft/" "$tmp/plan/plan.md"; rm "$tmp/plan/plan.md.bak"
out=$(bash $PLANV "$tmp/plan" "$tmp/spec.md"); code=$?
check "draft plan of a draft spec only warns (compact path) [decision-flow#R5.S1]" '[ $code -eq 0 ] && echo "$out" | grep -q "approve it with the plan"'
rm -rf "$tmp"
# A plan whose backend tasks are T1..N, T<k> depending on <dep>(s) given by the function's callers; frontend has none.
mkdep() { # $1 plan dir, then one "Depends on" value per task from T1
  d=$1; shift; f=$d/backend/tasks.md; head -4 $VP/plan/backend/tasks.md > $f; printf '# Tasks\n' >> $f
  printf -- '---\nwork: 007-widget-export\nvertical: frontend\n---\n# Tasks\n' > $d/frontend/tasks.md
  n=0; for dep in "$@"; do n=$((n + 1))
    printf '\n### T%s: Task %s\n\n**Proves:** none (test)\n**Depends on:** %s\n**Est. diff:** ~10 lines\n\n**Files**\n- Create: `src/x.ts`\n\n**Steps**\n- [ ] 1. Write failing tests: `works [widget-export#R2.S1]`\n- [ ] 2. Commit\n' $n $n "$dep" >> $f
  done; }
tmp=$(mktemp -d); cp -R $VP/plan "$tmp/plan"
mkdep "$tmp/plan" none "T1 (the model it reads)" "T2 (b, c)" "T1 (), T2 (uses parse from T2), T3" T4
out=$(bash $PLANV "$tmp/plan" $VP/widget-export.md)
check "a reasoned dependency gets no warning [parallel-build#R1.S1]" '! echo "$out" | grep -q "T2: dependency" && ! echo "$out" | grep -q "T3: dependency"'
check "a bare dependency warns with task and line [parallel-build#R1.S2]" 'echo "$out" | grep -q "backend/tasks.md:[0-9]*: T5: dependency on T4 has no reason"'
check "empty and partial reasons warn per dependency [parallel-build#R1.S4]" '[ $(echo "$out" | grep -c "T4: dependency") -eq 2 ] && echo "$out" | grep -q "T4: dependency on T1 has no reason" && echo "$out" | grep -q "T4: dependency on T3 has no reason"'
mkdep "$tmp/plan" none T1 T2 T3 T4 T5 T6
out=$(bash $PLANV "$tmp/plan" $VP/widget-export.md)
check "a 7-task bare chain warns once [parallel-build#R2.S1]" '[ $(echo "$out" | grep -c "plan is one chain: no tasks can run at once") -eq 1 ]'
mkdep "$tmp/plan" none "T1 (a)" "T2 (b)" "T3 (c)"
out=$(bash $PLANV "$tmp/plan" $VP/widget-export.md)
check "a reasoned 4-chain doesn't [parallel-build#R2.S2]" '! echo "$out" | grep -q "one chain"'
mkdep "$tmp/plan" none T1 T2
out=$(bash $PLANV "$tmp/plan" $VP/widget-export.md)
check "a 3-chain doesn't [parallel-build#R2.S3]" '! echo "$out" | grep -q "one chain"'
rm -rf "$tmp"
out=$(bash $PLANV tests/validate-plan/verticals-bad $VP/widget-export.md); code=$?
check "older plans warn but don't error [parallel-build#R1.S3]" '[ $code -eq 1 ] && echo "$out" | grep -q "has no reason" && ! echo "$out" | grep "has no reason" | grep -q ERROR'
rm -rf "$tmp"

echo "# detect"
out=$(bash $DETECT tests/detect/fixtures/parent)
check "parent folder finds three projects" '[ $(echo "$out" | grep -c "^project:") -eq 3 ]'
check "angular app gets the frontend lens" 'echo "$out" | grep -A1 "^project: web" | grep -q "lenses: frontend"'
check "express api gets the backend lens" 'echo "$out" | grep -A1 "^project: api" | grep -q "lenses: backend"'
check "terraform gets the infra lens" 'echo "$out" | grep -A1 "^project: infra" | grep -q "lenses: infra"'
check "npm scripts become commands" 'echo "$out" | grep -q "e2e=\"npm run e2e\""'
check "node_modules is ignored" '! echo "$out" | grep -q node_modules'
out=$(bash $DETECT tests/detect/fixtures/nextjs)
check "next.js with api routes gets both lenses" 'echo "$out" | grep -q "lenses: frontend backend"'
check "one-line package.json scripts are found" 'echo "$out" | grep -q "test=\"npm test\""'
out=$(bash $DETECT tests/detect/fixtures/rails)
check "rails gets backend and rspec" 'echo "$out" | grep -q "lenses: backend" && echo "$out" | grep -q "bundle exec rspec"'
out=$(bash $DETECT tests/detect/fixtures/empty)
check "no manifest reports no lenses" 'echo "$out" | grep -q "lenses: none"'
out=$(bash $DETECT tests/detect/fixtures/wslens)
check "workspace lens is reported [plan-verticals#R12.S1]" 'echo "$out" | grep -A1 "^project: plugins/x/scripts$" | grep -q "lenses: tooling$"'
check "lens with no matches isn't reported [plan-verticals#R12.S2]" '! echo "$out" | grep -q "unused"'
empty=$(mktemp -d)
out=$(FACTREE_HOME="$empty" bash $DETECT tests/detect/fixtures/parent)
check "no workspace lenses, output unchanged [plan-verticals#R12.S3]" '! echo "$out" | grep -q workspace-lens && [ $(echo "$out" | grep -c "^project:") -eq 3 ]'
rmdir "$empty"
out=$(bash $DETECT tests/detect/fixtures/plain-yaml)
check "unrelated yaml alone reports no lenses" 'echo "$out" | grep -q "lenses: none"'
out=$(bash $DETECT tests/detect/fixtures/docker)
check "dockerfile alone is an infra project [plan-verticals#R8.S1]" 'echo "$out" | grep -q "lenses: infra" && echo "$out" | grep -q "docker"'
out=$(bash $DETECT tests/detect/fixtures/ci-api)
check "ci workflows add infra to an api [plan-verticals#R8.S2]" '[ $(echo "$out" | grep -c "^project:") -eq 1 ] && echo "$out" | grep -q "lenses: backend infra" && echo "$out" | grep -q "github-actions"'
out=$(bash $DETECT tests/detect/fixtures/k8s)
check "kubernetes manifests are infra [plan-verticals#R8.S3]" 'echo "$out" | grep -q "lenses: infra" && echo "$out" | grep -q "kubernetes"'
out=$(bash $DETECT tests/detect/fixtures/nextjs)
check "frontend without infra files gets no infra [plan-verticals#R8.S4]" '! echo "$out" | grep -q infra'
out=$(bash $DETECT tests/detect/fixtures/infra-folder)
check "infra folder without a manifest is a project [plan-verticals#R8.S5]" 'echo "$out" | grep -A1 "^project: api$" | grep -q "lenses: backend$" && echo "$out" | grep -A1 "^project: deploy$" | grep -q "lenses: infra$"'
out=$(bash $DETECT tests/detect/fixtures/ci-root)
check "root ci is infra on the root only [plan-verticals#R8.S6]" 'echo "$out" | grep -A1 "^project: \.$" | grep -q "lenses: infra$" && echo "$out" | grep -A1 "^project: web$" | grep -q "lenses: frontend$"'
out=$(bash $DETECT tests/detect/fixtures/helm)
check "helm templates count once, as helm" '[ $(echo "$out" | grep -c "^project:") -eq 1 ] && echo "$out" | grep -q "helm" && ! echo "$out" | grep -q "kubernetes"'

echo "# preferences"
check "template sets nothing, every key commented out [preferences#R5.S1]" '! grep -v -E "^(#|$)" $P/shared/preferences.md | grep -q . && grep -q "^# approve_plans:" $P/shared/preferences.md && grep -q "^# review_budget:" $P/shared/preferences.md'

echo "# lenses"
check "lens README documents Detect [plan-verticals#R13.S1]" 'grep -q "^- \*\*Detect:\*\*" $P/lenses/README.md && grep -q "detect.sh" $P/lenses/README.md && grep -q "^## Generated lenses" $P/lenses/README.md'
for l in $P/lenses/backend.md $P/lenses/frontend.md $P/lenses/infra.md; do
  check "$(basename $l) has the 7 contract sections" '[ $(grep -c -E "^## (Signals|Patterns to inventory|Gaps to check|Scale triggers|Design sections|Failure handling|Test mapping)$" $l) -eq 7 ]'
  check "$(basename $l) sections are in contract order [factory-quality#R3.S2]" '[ "$(grep -E "^## (Signals|Patterns to inventory|Gaps to check|Scale triggers|Design sections|Failure handling|Test mapping)$" $l | tr "\n" "|")" = "## Signals|## Patterns to inventory|## Gaps to check|## Scale triggers|## Design sections|## Failure handling|## Test mapping|" ]'
done
gaps=$(awk '/^## Gaps to check$/{g=1;next} /^## /{g=0} g' $P/lenses/backend.md)
check "backend lens asks about stale state and input as sent [factory-quality#R3.S1]" 'echo "$gaps" | grep -q "await" && echo "$gaps" | grep -q "encoding" && ! echo "$gaps" | grep -E "await|encoding" | grep -q -i -E "express|django|rails|spring|node"'
check "branch reviewers are told to tag security suggestions [factory-quality#R5.S3]" 'awk "/^## Branch/{b=1} b" $P/skills/build/review-prompt.md | grep -q "security:"'

echo "# session hook and events"
HOOK=$P/scripts/session-hook.sh
EVENT="$(pwd)/$P/scripts/event.sh"
tmp=$(mktemp -d); mkdir -p "$tmp/ws/.factree" "$tmp/ws/repo" "$tmp/bare"
hook() { echo "{\"session_id\":\"$1\",\"hook_event_name\":\"$2\",\"cwd\":\"$3\",\"transcript_path\":\"/t.jsonl\"}" | bash $HOOK; }
hook s1 UserPromptSubmit "$tmp/ws/repo"
check "prompt marks the session working" 'grep -q "\"state\":\"working\"" "$tmp/ws/.factree/sessions/s1.json"'
hook s1 Stop "$tmp/ws/repo"
check "stop marks it your turn and keeps the start time" 'grep -q "\"state\":\"your_turn\"" "$tmp/ws/.factree/sessions/s1.json" && grep -q "\"transcript\":\"/t.jsonl\"" "$tmp/ws/.factree/sessions/s1.json"'
hook s2 Stop "$tmp/bare"
check "no workspace: the hook writes nothing" '[ ! -e "$tmp/bare/.factree" ]'
hook "../x" Stop "$tmp/ws/repo"
check "unsafe session ids are ignored" '[ $(ls "$tmp/ws/.factree/sessions" | wc -l) -eq 1 ]'
(cd "$tmp/ws/repo" && bash $EVENT question.asked demo '{"n":1,"text":"Hidden or disabled?"}')
check "event.sh accepts question.asked and records cwd" 'grep -q "\"type\":\"question.asked\".*\"cwd\":\"$tmp/ws/repo\"" "$tmp/ws/.factree/events.jsonl"'
check "event.sh rejects unknown types" '! bash $EVENT spec.bogus demo 2>/dev/null'
for t in spec.created spec.approved spec.edited plan.created plan.approved task.started task.done plan.implemented review.opened review.merged review.closed stage.held stage.released; do
  msg=$(cd "$tmp/ws/repo" && env -u FACTREE_STATE_WRITER bash $EVENT $t demo '{"by":"A"}' 2>&1); echo "$t $? $msg"
done > "$tmp/moves.out"
check "event.sh refuses every move type without the writer, exit 3 [status-state#R7.S1]" '[ $(grep -c "^[a-z.]* 3 [a-z.]* is a status move: use state.sh$" "$tmp/moves.out") -eq 13 ] && ! grep -q "\"type\":\"spec.created\"" "$tmp/ws/.factree/events.jsonl"'
check "event.sh spec.approved without the writer is refused, exit 3 [status-state#R7.S1]" '(cd "$tmp/ws/repo" && env -u FACTREE_STATE_WRITER bash $EVENT spec.approved demo "{}" >/dev/null 2>&1; [ $? -eq 3 ])'
check "event.sh accepts a non-move type without the writer [status-state#R7.S1]" '(cd "$tmp/ws/repo" && env -u FACTREE_STATE_WRITER bash $EVENT spec.step demo "{}" 2>/dev/null) && tail -n1 "$tmp/ws/.factree/events.jsonl" | grep -q "\"type\":\"spec.step\""'
(cd "$tmp/ws/repo" && CLAUDE_CODE_SESSION_ID=611a0794-d356-4c30-a967-cc8cb6f9f85a FACTREE_STATE_WRITER=1 bash $EVENT spec.approved demo '{"by":"A"}')
check "event.sh records the session [spec-sessions#R1.S1]" 'tail -n1 "$tmp/ws/.factree/events.jsonl" | grep -q "\"session\":\"611a0794-d356-4c30-a967-cc8cb6f9f85a\""'
(cd "$tmp/ws/repo" && env -u CLAUDE_CODE_SESSION_ID FACTREE_STATE_WRITER=1 bash $EVENT spec.approved demo '{"by":"A"}')
check "no session outside Claude Code [spec-sessions#R1.S2]" '! tail -n1 "$tmp/ws/.factree/events.jsonl" | grep -q "\"session\""'
(cd "$tmp/ws/repo" && CLAUDE_CODE_SESSION_ID='a"b' FACTREE_STATE_WRITER=1 bash $EVENT spec.approved demo '{"by":"A"}')
check "unsafe session ids are left out [spec-sessions#R1.S3]" 'tail -n1 "$tmp/ws/.factree/events.jsonl" | grep -v -q "\"session\"" && tail -n1 "$tmp/ws/.factree/events.jsonl" | grep -q "\"data\":{\"by\":\"A\"}}$"'
rm -rf "$tmp"

echo "# companion decisions reach Claude"
WAIT="$(pwd)/$P/scripts/wait-decision.sh"
SINCE="$(pwd)/$P/scripts/decisions-since.sh"
tmp=$(mktemp -d); mkdir -p "$tmp/ws/.factree" "$tmp/ws/repo"; touch "$tmp/ws/.factree/events.jsonl"
decided() { (cd "$tmp/ws/repo" && env -u CLAUDE_CODE_SESSION_ID FACTREE_STATE_WRITER=1 bash $EVENT "$@"); }   # fabricates companion history on purpose, so it holds the writer env
waiting() { (cd "$tmp/ws/repo" && FACTREE_WAIT_EVERY=0.2 FACTREE_WAIT_FOR=${2:-20} bash "$WAIT" $1 > "$tmp/out" 2>&1) & wpid=$!; sleep 0.5; }
decided question.asked demo '{"n":3,"text":"Where?"}'
waiting demo
decided question.answered demo '{"n":3,"answer":"Beside each id","by":"John Doe","via":"companion"}'
for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 $wpid 2>/dev/null || break; sleep 0.3; done
check "the wait ends with the companion's answer [companion-decisions#R8.S1]" '! kill -0 $wpid 2>/dev/null && grep -q "^Decided in the Factree companion:$" "$tmp/out" && grep -q "^- demo question 3: Beside each id (John Doe)$" "$tmp/out"'
sleep 1.1   # the next wait starts after that answer's second, or it counts the answer again (ci R1.S4)
waiting demo
decided spec.approved other '{"by":"John Doe","via":"companion"}'
decided question.answered demo '{"n":4,"answer":"typed in the terminal","by":"John Doe"}'
sleep 1
check "another spec's decision, or one not made in the companion, doesn't end it [companion-decisions#R8.S3]" 'kill -0 $wpid 2>/dev/null'
decided plan.approved 024-demo '{"by":"John Doe","via":"companion"}'
sleep 1
check "a plan the wait doesn't name doesn't end it" 'kill -0 $wpid 2>/dev/null'
kill $wpid 2>/dev/null; wait $wpid 2>/dev/null
(cd "$tmp/ws/repo" && FACTREE_WAIT_EVERY=0.2 bash "$WAIT" demo 024-demo > "$tmp/out" 2>&1) & wpid=$!; sleep 0.5
decided plan.approved 024-demo '{"by":"John Doe","via":"companion"}'
for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 $wpid 2>/dev/null || break; sleep 0.3; done
check "the wait ends on its plan's approval" '! kill -0 $wpid 2>/dev/null && grep -q "^- 024-demo plan approved (John Doe)$" "$tmp/out"'
waiting demo 1; wait $wpid
check "the wait gives up, saying what still waits [companion-decisions#R8.S6]" 'grep -q "^No decision in the companion yet on demo." "$tmp/out"'
hook s5 UserPromptSubmit "$tmp/ws/repo"; hook s5 Stop "$tmp/ws/repo"; sleep 1
decided spec.approved demo '{"by":"John Doe","via":"companion"}'
sleep 1; hook s5 SessionEnd "$tmp/ws/repo" >/dev/null
sed -i.bak 's/"updated":"[^"]*"/"updated":"2026-01-01T00:00:00Z"/' "$tmp/ws/.factree/sessions/s5.json"
out=$(hook s5 UserPromptSubmit "$tmp/ws/repo")
check "a closed session gets it on the next prompt [companion-decisions#R8.S4]" 'echo "$out" | grep -q "^- demo spec approved (John Doe)$"'
hook s5 Stop "$tmp/ws/repo"; sleep 1
out=$(hook s5 UserPromptSubmit "$tmp/ws/repo")
check "nothing is handed over twice [companion-decisions#R8.S5]" '[ -z "$out" ]'
out=$(bash "$SINCE" "$tmp/ws/.factree/events.jsonl" "" other)
check "decisions-since picks one spec" '[ "$out" = "- other spec approved (John Doe)" ]'
rm -rf "$tmp"

echo "# each decision reaches Claude once"
tmp=$(mktemp -d); mkdir -p "$tmp/ws/.factree" "$tmp/ws/repo"; touch "$tmp/ws/.factree/events.jsonl"
decided() { (cd "$tmp/ws/repo" && env -u CLAUDE_CODE_SESSION_ID FACTREE_STATE_WRITER=1 bash $EVENT "$@"); }   # fabricates companion history on purpose, so it holds the writer env
answer() { decided question.answered demo "{\"n\":$1,\"answer\":\"A$1\",\"by\":\"John Doe\",\"via\":\"companion\"}"; }
wait_in() { (cd "$tmp/ws/repo" && CLAUDE_CODE_SESSION_ID=$1 FACTREE_WAIT_EVERY=0.2 FACTREE_WAIT_FOR=${2:-4} bash "$WAIT" demo > "$tmp/out" 2>&1) & wpid=$!; }
done_in() { for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25; do kill -0 $wpid 2>/dev/null || return 0; sleep 0.2; done; return 1; }
hook s6 UserPromptSubmit "$tmp/ws/repo" >/dev/null; hook s6 Stop "$tmp/ws/repo" >/dev/null; sleep 1
wait_in s6; sleep 0.5; answer 1; done_in
answer 2                                   # logged before the next wait starts
wait_in s6; done_in; got2=$?
check "an answer logged between two waits is delivered [factory-flow#R6.S2]" '[ $got2 -eq 0 ] && grep -q "^- demo question 2: A2 (John Doe)$" "$tmp/out" && ! grep -q "question 1" "$tmp/out"'
out=$(hook s6 UserPromptSubmit "$tmp/ws/repo")
check "the turn the wait wakes doesn't get them again [factory-flow#R6.S1]" '[ -z "$out" ]'
hook s6 Stop "$tmp/ws/repo" >/dev/null
answer 3
out=$(hook s6 UserPromptSubmit "$tmp/ws/repo"); out2=$(hook s6 UserPromptSubmit "$tmp/ws/repo")
check "with no wait, the next prompt brings it, once [factory-flow#R6.S3]" 'echo "$out" | grep -q "^- demo question 3: A3 (John Doe)$" && [ -z "$out2" ]'
rm -rf "$tmp"

tmp=$(mktemp -d); mkdir -p "$tmp/.factree"
for t in task.reviewed bug.escaped lesson.proposed lesson.approved lesson.rejected; do FACTREE_HOME="$tmp/.factree" bash $EVENT $t demo '{"key":"x"}' 2>/dev/null; done
check "event.sh accepts the learning events [self-improving#R2.S1]" '[ $(grep -c "\"type\":\"\(task.reviewed\|bug.escaped\|lesson.proposed\|lesson.approved\|lesson.rejected\)\"" "$tmp/.factree/events.jsonl" 2>/dev/null) -eq 5 ]'
rm -rf "$tmp"
tmp=$(mktemp -d); mkdir -p "$tmp/.factree"
FACTREE_HOME="$tmp/.factree" FACTREE_STATE_WRITER=1 bash $EVENT stage.held 063-x '{"stage":"review","reason":"acceptance run"}' 2>/dev/null
FACTREE_HOME="$tmp/.factree" FACTREE_STATE_WRITER=1 bash $EVENT stage.released 063-x '{"stage":"review"}' 2>/dev/null
check "event.sh accepts stage.held and stage.released on the work [build-status#R4.S3]" 'grep -q "\"type\":\"stage.held\",\"work\":\"063-x\"" "$tmp/.factree/events.jsonl" && grep -q "\"type\":\"stage.released\",\"work\":\"063-x\"" "$tmp/.factree/events.jsonl"'
rm -rf "$tmp"

echo "# lessons"
LS="$(pwd)/$P/scripts/lessons.sh"
lw() { tmp=$(mktemp -d); mkdir -p "$tmp/.factree"; : > "$tmp/.factree/events.jsonl"; }
ev() { echo "$1" >> "$tmp/.factree/events.jsonl"; }
appr() { ev "{\"ts\":\"2026-11-1$2T10:00:00Z\",\"type\":\"plan.design_approved\",\"work\":\"$1\",\"data\":{\"by\":\"John Doe\",\"new_patterns\":[]}}"; }
ovr() { ev "{\"ts\":\"2026-11-1$2T10:00:00Z\",\"type\":\"decision.recorded\",\"spec\":\"$1\",\"data\":{\"id\":\"call-2-override\",\"by\":\"John Doe\",\"overrides\":\"call-2\",\"kind\":\"date format\",\"choice\":\"DD/MM/YYYY\"}}"; }
rev() { ev "{\"ts\":\"2026-11-1$2T10:00:00Z\",\"type\":\"task.reviewed\",\"work\":\"$1\",\"data\":{\"task\":\"T2\",\"spec\":\"pass\",\"quality\":\"fail\",\"findings\":[{\"text\":\"fetches data its own way\",\"pattern\":\"apps/companion/src/api.ts\"}]}}"; }
L() { FACTREE_HOME="$tmp/.factree" bash "$LS"; }
lw; appr 001-a 1; appr 002-b 2; appr 003-c 3; out=$(L)
check "three plans approved by hand → approve_plans [self-improving#R4.S1]" 'echo "$out" | grep -q "^pref:approve_plans	3	preferences.md	approve_plans: nothing-new	"'
ev "{\"ts\":\"2026-11-15T10:00:00Z\",\"type\":\"plan.design_approved\",\"work\":\"009-x\",\"data\":{\"by\":\"flow: no open decisions\",\"new_patterns\":[]}}"; out=$(L)
check "a flow approval isn't a hand approval" 'echo "$out" | grep -q "^pref:approve_plans	3	"'
appr 003-c 4; out=$(L)
check "counts a decision once even if logged twice" 'echo "$out" | grep -q "^pref:approve_plans	3	"'
echo "approve_plans: nothing-new" > "$tmp/.factree/preferences.md"; out=$(L)
check "no lesson for a preference already set" '! echo "$out" | grep -q "^pref:approve_plans"'
rm -rf "$tmp"
lw; ovr link-report 1; ovr spec-order 2; out=$(L)
check "twice is not enough [self-improving#R4.S3]" '[ -z "$out" ]'
ovr search 3; out=$(L)
check "the same override three times → a default [self-improving#R4.S2]" 'echo "$out" | grep -q "^default:date format=DD/MM/YYYY	3	defaults.md	"'
ev '{"ts":"2026-11-15T10:00:00Z","type":"lesson.rejected","spec":"x","data":{"key":"default:date format=DD/MM/YYYY","by":"John Doe"}}'; ovr verify 6; out=$(L)
check "rejected never again [self-improving#R8.S2]" '! echo "$out" | grep -q "^default:date format"'
rm -rf "$tmp"
lw; rev 001-a 1; rev 002-b 2; rev 003-c 3; out=$(L)
check "a finding in three tasks → a lens rule [self-improving#R5.S1]" 'echo "$out" | grep -q "^lens:apps/companion/src/api.ts	3	lenses/"'
ev '{"ts":"2026-11-14T10:00:00Z","type":"bug.escaped","spec":"companion-decide","data":{"scenario":"R1.S5","slipped":"a spec with no file yet"}}'; out=$(L)
check "an escaped bug → a checklist question [self-improving#R6.S1]" 'echo "$out" | grep -q "^bug:companion-decide#R1.S5	1	checklists/plan.md	"'
appr 001-a 5; appr 002-b 6; appr 003-c 7; appr 004-d 8; ovr a 1; ovr b 2; ovr c 3; out=$(L)
check "most evidence first [self-improving#R7.S2]" '[ "$(echo "$out" | cut -f1,2 | tr "\n" " ")" = "pref:approve_plans	4 default:date format=DD/MM/YYYY	3 lens:apps/companion/src/api.ts	3 bug:companion-decide#R1.S5	1 " ]'
rm -rf "$tmp"

echo "# review"
WR="$(pwd)/$P/scripts/wait-review.sh"
tmp=$(mktemp -d); mkdir -p "$tmp/ws/.factree" "$tmp/ws/repo" "$tmp/bin"; : > "$tmp/ws/.factree/events.jsonl"
# A fake gh: its answers come from files the test writes.
cat > "$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
d="$(dirname "$0")"
[ -f "$d/fail" ] && { echo "gh: authentication required" >&2; exit 1; }
echo "hint: use gh event listen instead of polling" >&2
case "$1 $2" in
  "pr view") cat "$d/state" ;;
  "api "*) cat "$d/comments" ;;
esac
GH
chmod +x "$tmp/bin/gh"
# gh answers "<state> <mergeable> <reviewDecision>", as wait-review.sh asks it to.
printf 'OPEN MERGEABLE REVIEW_REQUIRED\n' > "$tmp/bin/state"; : > "$tmp/bin/comments"
(cd "$tmp/ws/repo" && FACTREE_STATE_WRITER=1 bash $EVENT review.opened 012-review '{"pr":"7","url":"https://github.com/o/r/pull/7","base":"main"}')
wr() { (cd "$tmp/ws/repo" && PATH="$tmp/bin:$PATH" FACTREE_WAIT_EVERY=0.2 FACTREE_WAIT_FOR=${1:-3} bash "$WR" 012-review > "$tmp/out" 2>&1) ; }
# gh answers one comment per line, fields joined by the unit separator (\037), as wait-review.sh asks it to.
printf '101\037priya\037src/App.tsx\03742\037this loop is off by one\n' > "$tmp/bin/comments"; wr
check "notes from gh are not comments [review#R3.S3]" '[ $(grep -c "\"type\":\"review.comment\"" "$tmp/ws/.factree/events.jsonl") -eq 1 ] && ! grep -q "hint" "$tmp/ws/.factree/events.jsonl"'
check "a new comment wakes it [review#R3.S1]" 'grep -q "^review: comment by priya on src/App.tsx:42$" "$tmp/out" && [ $(grep -c "\"type\":\"review.comment\"" "$tmp/ws/.factree/events.jsonl") -eq 1 ] && grep -q "\"work\":\"012-review\".*\"id\":\"101\".*\"body\":\"this loop is off by one\"" "$tmp/ws/.factree/events.jsonl"'
wr 1
check "a comment is logged once" '[ $(grep -c "\"type\":\"review.comment\"" "$tmp/ws/.factree/events.jsonl") -eq 1 ] && grep -q "^No review activity yet on 012-review" "$tmp/out"'
printf '102\037john\037\037\037merged main in\n' >> "$tmp/bin/comments"; wr
check "a conversation comment keeps its text [review#R3.S4]" 'grep -q "\"id\":\"102\",\"author\":\"john\",\"path\":\"\",\"line\":\"\",\"body\":\"merged main in\"" "$tmp/ws/.factree/events.jsonl"'
printf 'OPEN UNKNOWN REVIEW_REQUIRED\n' > "$tmp/bin/state"; wr 1
check "unknown is not a conflict" '! grep -q "\"type\":\"review.state\"" "$tmp/ws/.factree/events.jsonl" && grep -q "^No review activity yet" "$tmp/out"'
printf 'OPEN CONFLICTING REVIEW_REQUIRED\n' > "$tmp/bin/state"; wr
check "a conflict wakes it [review#R10.S1]" 'grep -q "^review: CONFLICTING$" "$tmp/out" && [ $(grep -c "\"state\":\"CONFLICTING\"" "$tmp/ws/.factree/events.jsonl") -eq 1 ]'
wr 1
check "a conflict is logged once" '[ $(grep -c "\"state\":\"CONFLICTING\"" "$tmp/ws/.factree/events.jsonl") -eq 1 ] && grep -q "^No review activity yet" "$tmp/out"'
printf 'OPEN MERGEABLE REVIEW_REQUIRED\n' > "$tmp/bin/state"; wr 1
check "resolved, logged quietly [review#R10.S2]" 'grep "\"type\":\"review.state\"" "$tmp/ws/.factree/events.jsonl" | tail -n1 | grep -q "\"state\":\"OPEN\"" && ! grep -q "^review: OPEN" "$tmp/out" && grep -q "^No review activity yet" "$tmp/out"'
printf 'MERGED UNKNOWN \n' > "$tmp/bin/state"; wr
check "merged ends it [review#R3.S2]" 'grep -q "^review: MERGED$" "$tmp/out" && grep -q "\"type\":\"review.state\".*\"state\":\"MERGED\"" "$tmp/ws/.factree/events.jsonl"'
touch "$tmp/bin/fail"; wr
check "wait stops when gh fails" 'grep -q "^review: gh failed: gh: authentication required$" "$tmp/out"'
rm -rf "$tmp"

echo "# review, several repos"
tmp=$(mktemp -d); mkdir -p "$tmp/ws/.factree" "$tmp/bin"; : > "$tmp/ws/.factree/events.jsonl"
for r in backend frontend; do mkdir -p "$tmp/ws/$r"; git -C "$tmp/ws/$r" init -q; done
git -C "$tmp/ws/backend" remote add origin https://github.com/acme/backend.git
git -C "$tmp/ws/frontend" remote add origin git@github.com:acme/frontend.git
# A fake gh that answers per -R (pr view) or per repos/acme/<repo> (api), from state-<repo> and comments-<repo> files.
cat > "$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
d="$(dirname "$0")"; r=""
if [ "$1" = pr ]; then while [ $# -gt 0 ]; do [ "$1" = -R ] && r=${2#acme/}; shift; done; cat "$d/state-$r"
else r=${2#repos/acme/}; r=${r%%/*}; case "$2" in */pulls/*) cat "$d/comments-$r" ;; esac; fi
GH
chmod +x "$tmp/bin/gh"
for r in backend frontend; do printf 'OPEN MERGEABLE REVIEW_REQUIRED\n' > "$tmp/bin/state-$r"; : > "$tmp/bin/comments-$r"
  (cd "$tmp/ws/$r" && FACTREE_STATE_WRITER=1 bash $EVENT review.opened 062-x "{\"pr\":\"7\",\"url\":\"u\",\"repo\":\"$r\",\"tasks\":\"T1\",\"base\":\"main\"}"); done
wm() { (cd "$tmp/ws/frontend" && PATH="$tmp/bin:$PATH" FACTREE_WAIT_EVERY=0.2 FACTREE_WAIT_FOR=1 bash "$WR" 062-x "$@" > "$tmp/out" 2>&1); }
printf '201\037priya\037a.ts\0373\037fix this\n' > "$tmp/bin/comments-frontend"; wm frontend
check "a comment on frontend #7 is logged for frontend, not backend #7 [multi-repo#R8.S3]" 'grep -q "\"type\":\"review.comment\".*\"id\":\"201\".*\"repo\":\"frontend\"" "$tmp/ws/.factree/events.jsonl" && ! grep "review.comment" "$tmp/ws/.factree/events.jsonl" | grep -q "\"repo\":\"backend\"" && grep -q "^review: comment by priya" "$tmp/out"'
printf 'MERGED UNKNOWN \n' > "$tmp/bin/state-backend"; wm backend 7
check "each repo's state is its own, logged with its repo" 'grep -q "\"type\":\"review.state\".*\"pr\":\"7\",\"state\":\"MERGED\",\"repo\":\"backend\"" "$tmp/ws/.factree/events.jsonl" && ! grep "review.state" "$tmp/ws/.factree/events.jsonl" | grep -q "\"repo\":\"frontend\""'
wm
check "two repos and no repo named: it says which to name" 'grep -q "^review: 062-x has pull requests in several repos (backend,frontend): name one" "$tmp/out" && [ $(wc -l < "$tmp/out") -eq 1 ]'
for p in 12 13; do (cd "$tmp/ws/backend" && FACTREE_STATE_WRITER=1 bash $EVENT review.opened 062-x "{\"pr\":\"$p\",\"url\":\"u\",\"repo\":\"backend\",\"tasks\":\"T$p\",\"base\":\"main\"}"); done
printf 'OPEN MERGEABLE APPROVED\n' > "$tmp/bin/state-backend"; wm backend 12; wm backend 13
check "two PRs in one repo reaching the same state are each logged [multi-repo#R8]" 'grep -q "\"type\":\"review.state\".*\"pr\":\"12\",\"state\":\"APPROVED\",\"repo\":\"backend\"" "$tmp/ws/.factree/events.jsonl" && grep -q "\"type\":\"review.state\".*\"pr\":\"13\",\"state\":\"APPROVED\",\"repo\":\"backend\"" "$tmp/ws/.factree/events.jsonl" && grep -q "^review: APPROVED$" "$tmp/out"'
git -C "$tmp/ws/frontend" remote set-url origin https://gitlab.com/acme/frontend.git; wm frontend
check "a non-GitHub remote stops the follower with one line" 'grep -q "^review: frontend.s origin is not a GitHub remote" "$tmp/out" && [ $(wc -l < "$tmp/out") -eq 1 ]'
rm -rf "$tmp"

echo "# review, one repo (repo .)"
tmp=$(mktemp -d); mkdir -p "$tmp/r/.factree" "$tmp/bin"; : > "$tmp/r/.factree/events.jsonl"; git -C "$tmp/r" init -q
git -C "$tmp/r" remote add origin https://github.com/acme/r.git
printf '#!/usr/bin/env bash\n[ "$1" = pr ] && cat "$(dirname "$0")/state"; exit 0\n' > "$tmp/bin/gh"; chmod +x "$tmp/bin/gh"
printf 'OPEN MERGEABLE APPROVED\n' > "$tmp/bin/state"
(cd "$tmp/r" && bash $EVENT review.state 062-s '{"pr":"9","state":"APPROVED","repo":"x"}')
for p in 12 13; do (cd "$tmp/r" && FACTREE_STATE_WRITER=1 bash $EVENT review.opened 062-s "{\"pr\":\"$p\",\"url\":\"u\",\"repo\":\".\",\"base\":\"main\"}"); done
for p in 12 13; do (cd "$tmp/r" && PATH="$tmp/bin:$PATH" bash "$WR" 062-s . "$p" --once >/dev/null 2>&1); done
check "repo . : each PR's state is logged, and . is not a wildcard [multi-repo#R8]" '[ $(grep -c "\"type\":\"review.state\".*\"state\":\"APPROVED\",\"repo\":\"\.\"" "$tmp/r/.factree/events.jsonl") -eq 2 ]'
rm -rf "$tmp"

echo "# review catch-up, several repos"
CU="$(pwd)/$P/scripts/review-catchup.sh"
tmp=$(mktemp -d); mkdir -p "$tmp/ws/.factree" "$tmp/bin"; : > "$tmp/ws/.factree/events.jsonl"
for r in backend frontend infra; do mkdir -p "$tmp/ws/$r"; git -C "$tmp/ws/$r" init -q; done
git -C "$tmp/ws/backend" remote add origin https://github.com/acme/backend.git
git -C "$tmp/ws/frontend" remote add origin git@github.com:acme/frontend.git
git -C "$tmp/ws/infra" remote add origin ssh://git@github.com/acme/infra.git
cat > "$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
echo "$*" >> "$(dirname "$0")/calls"; [ "$1" = pr ] && echo "OPEN MERGEABLE REVIEW_REQUIRED"; exit 0
GH
chmod +x "$tmp/bin/gh"
for r in backend frontend; do (cd "$tmp/ws/$r" && FACTREE_STATE_WRITER=1 bash $EVENT review.opened 062-x "{\"pr\":\"7\",\"url\":\"u\",\"repo\":\"$r\",\"base\":\"main\"}"); done
(cd "$tmp/ws/backend" && bash $EVENT review.state 062-x '{"pr":"7","state":"MERGED","repo":"backend"}')
(cd "$tmp/ws/frontend" && PATH="$tmp/bin:/usr/bin:/bin" bash "$CU" >/dev/null 2>&1)
check "catch-up skips the merged #7 in backend and still checks frontend's #7 [multi-repo#R8.S3]" '! grep -q "acme/backend" "$tmp/bin/calls" && grep -q "^pr view 7 -R acme/frontend" "$tmp/bin/calls"'
(cd "$tmp/ws/infra" && FACTREE_STATE_WRITER=1 bash $EVENT review.opened 062-y '{"pr":"3","url":"u","repo":"infra","base":"main"}')
: > "$tmp/bin/calls"; (cd "$tmp/ws/infra" && PATH="$tmp/bin:/usr/bin:/bin" bash "$WR" 062-y infra --once >/dev/null 2>&1)
check "an ssh:// origin parses to acme/infra" 'grep -q "^pr view 3 -R acme/infra" "$tmp/bin/calls"'
rm -rf "$tmp"

echo "# review catch-up"
CU="$(pwd)/$P/scripts/review-catchup.sh"
tmp=$(mktemp -d); mkdir -p "$tmp/ws/.factree" "$tmp/ws/repo" "$tmp/bin" "$tmp/nogh"; : > "$tmp/ws/.factree/events.jsonl"
cat > "$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
d="$(dirname "$0")"; echo "$*" >> "$d/calls"
case "$1 $2" in "pr view") cat "$d/state" ;; "api "*) : ;; esac
GH
chmod +x "$tmp/bin/gh"
printf 'MERGED UNKNOWN \n' > "$tmp/bin/state"
(cd "$tmp/ws/repo" && FACTREE_STATE_WRITER=1 bash $EVENT review.opened 040-export '{"pr":"12","url":"u","base":"main"}')
cu() { (cd "$tmp/ws/repo" && PATH="$1:/usr/bin:/bin" bash "$CU" > "$tmp/out" 2>&1); }
cu "$tmp/bin"
check "merged with no wait [review#R11.S1]" 'grep -q "\"type\":\"review.state\",\"work\":\"040-export\".*\"state\":\"MERGED\"" "$tmp/ws/.factree/events.jsonl" && [ ! -s "$tmp/out" ]'
: > "$tmp/bin/calls"; cu "$tmp/bin"
check "not too often [review#R11.S2]" '[ ! -s "$tmp/bin/calls" ]'
rm -f "$tmp/ws/.factree/review-catchup.at"; : > "$tmp/bin/calls"; cu "$tmp/bin"
check "finished ones skipped [review#R11.S3]" '! grep -q "pr view 12" "$tmp/bin/calls"'
rm -f "$tmp/ws/.factree/review-catchup.at"; (cd "$tmp/ws/repo" && FACTREE_STATE_WRITER=1 bash $EVENT review.opened 041-other '{"pr":"13","url":"u","base":"main"}')
before=$(wc -l < "$tmp/ws/.factree/events.jsonl"); cu "$tmp/nogh"
check "no GitHub CLI [review#R11.S4]" '[ ! -s "$tmp/out" ] && [ "$(wc -l < "$tmp/ws/.factree/events.jsonl")" = "$before" ]'
rm -f "$tmp/ws/.factree/review-catchup.at"; (cd "$tmp/ws/repo" && FACTREE_STATE_WRITER=1 bash $EVENT review.opened 042-hook '{"pr":"14","url":"u","base":"main"}')
out=$(printf '{"session_id":"hook1","hook_event_name":"SessionStart","cwd":"%s"}' "$tmp/ws/repo" | PATH="$tmp/bin:/usr/bin:/bin" bash $P/scripts/session-hook.sh)
for n in 1 2 3 4 5 6 7 8 9 10; do grep -q "\"work\":\"042-hook\".*\"state\":\"MERGED\"" "$tmp/ws/.factree/events.jsonl" && break; sleep 0.3; done
check "the hook starts the catch-up [review#R11.S1]" 'grep -q "\"work\":\"042-hook\".*\"state\":\"MERGED\"" "$tmp/ws/.factree/events.jsonl" && [ -z "$out" ]'
rm -rf "$tmp"

echo "# workspace setup"
INIT="$(pwd)/$P/scripts/init.sh"; UI="$(pwd)/$P/scripts/ui.sh"
fresh() { tmp=$(mktemp -d); tmp=$(cd "$tmp" && pwd -P); mkdir -p "$tmp/shop"; git -C "$tmp/shop" init -q; git -C "$tmp/shop" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init; }
fresh
out=$(cd "$tmp/shop" && env -u FACTREE_HOME bash "$INIT"); code=$?
check "created in a fresh repo [workspace-setup#R1.S1]" '[ $code -eq 0 ] && [ -d "$tmp/shop/.factree" ] && echo "$out" | grep -q "^Created a Factree workspace in $tmp/shop/.factree (local only)$" && [ "$(echo "$out" | tail -n1)" = "$tmp/shop/.factree" ]'
check "nothing to commit [workspace-setup#R2.S1]" '[ -z "$(git -C "$tmp/shop" status --porcelain)" ] && [ $(grep -cx ".factree/" "$tmp/shop/.git/info/exclude") -eq 1 ]'
out=$(cd "$tmp/shop" && env -u FACTREE_HOME bash "$INIT")
check "created twice, excluded once" '[ $(grep -cx ".factree/" "$tmp/shop/.git/info/exclude") -eq 1 ] && ! echo "$out" | grep -q "^Created"'
rm -rf "$tmp/shop/.factree"; out=$(cd "$tmp/shop" && env -u FACTREE_HOME bash "$UI" --port 47991 2>&1); (cd "$tmp/shop" && env -u FACTREE_HOME bash "$UI" --stop >/dev/null 2>&1)
check "the companion starts in a fresh repo [workspace-setup#R1.S1]" '[ -d "$tmp/shop/.factree" ] && ! echo "$out" | grep -q "Run /factree:spec first" && echo "$out" | grep -q "Factree UI running at"'
rm -rf "$tmp"
fresh; printf '.factree/\n' > "$tmp/shop/.gitignore"; git -C "$tmp/shop" add .gitignore; git -C "$tmp/shop" -c user.email=t@t -c user.name=t commit -q -m ignore
(cd "$tmp/shop" && env -u FACTREE_HOME bash "$INIT" >/dev/null)
check "already excluded [workspace-setup#R2.S2]" '! grep -qx ".factree/" "$tmp/shop/.git/info/exclude" 2>/dev/null && [ -z "$(git -C "$tmp/shop" status --porcelain)" ]'
rm -rf "$tmp"
fresh; mkdir -p "$tmp/.factree"; out=$(cd "$tmp/shop" && env -u FACTREE_HOME bash "$INIT")
check "a workspace above is used [workspace-setup#R1.S3]" '[ "$(echo "$out" | tail -n1)" = "$tmp/.factree" ] && [ ! -d "$tmp/shop/.factree" ]'
rm -rf "$tmp"
fresh; git -C "$tmp/shop" worktree add -q "$tmp/wt" 2>/dev/null; out=$(cd "$tmp/wt" && env -u FACTREE_HOME bash "$INIT")
check "excluded in a worktree" '[ -d "$tmp/wt/.factree" ] && [ -z "$(git -C "$tmp/wt" status --porcelain)" ]'
rm -rf "$tmp"
tmp=$(mktemp -d); tmp=$(cd "$tmp" && pwd -P); out=$(cd "$tmp" && env -u FACTREE_HOME bash "$INIT" 2>&1); code=$?
check "outside git, nothing created [workspace-setup#R3.S1]" '[ $code -eq 3 ] && [ ! -d "$tmp/.factree" ] && echo "$out" | grep -q "/factree:init"'
rm -rf "$tmp"

tmp=$(mktemp -d); mkdir -p "$tmp/.factree"
FACTREE_HOME="$tmp/.factree" bash $EVENT stage.step link-report '{"stage":"plan","step":"designing","work":"017-link-report"}' 2>/dev/null
check "event.sh accepts stage.step on the spec [live-activity#R4.S1]" 'grep -q "\"type\":\"stage.step\",\"spec\":\"link-report\"" "$tmp/.factree/events.jsonl" 2>/dev/null'
rm -rf "$tmp"

echo "# companion links"
LINK="$(pwd)/$P/scripts/link.sh"
tmp=$(mktemp -d); mkdir -p "$tmp/.factree"
sleep 60 & live=$!
printf '{"pid":%s,"port":4747,"url":"http://localhost:4747"}\n' "$live" > "$tmp/.factree/ui.json"
out=$(cd "$tmp" && FACTREE_HOME="$tmp/.factree" bash "$LINK" link-report)
check "link to a spec [companion-handoff#R1.S1]" '[ "$out" = "View in Factree: http://localhost:4747/work/link-report/spec" ]'
out=$(cd "$tmp" && FACTREE_HOME="$tmp/.factree" bash "$LINK" link-report 002-link-report)
check "link to a plan [companion-handoff#R1.S2] [deep-links#R5.S1]" '[ "$out" = "View in Factree: http://localhost:4747/work/link-report/plan/002-link-report" ]'
kill "$live" 2>/dev/null; wait "$live" 2>/dev/null
out=$(cd "$tmp" && FACTREE_HOME="$tmp/.factree" bash "$LINK" link-report)
check "no link when the companion isn't running [companion-handoff#R1.S3]" '[ -z "$out" ]'
rm -rf "$tmp"

echo "# version check"
V=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' $P/.claude-plugin/plugin.json | head -n1)
tmp=$(mktemp -d); mkdir -p "$tmp/ws/.factree" "$tmp/ws/repo"
(cd "$tmp/ws/repo" && FACTREE_STATE_WRITER=1 bash $EVENT spec.approved demo '{"by":"A"}')
check "events record the version [version-check#R1.S1]" 'tail -n1 "$tmp/ws/.factree/events.jsonl" | grep -q "\"v\":\"$V\""'
mkdir -p "$tmp/bare/scripts"; cp $P/scripts/*.sh "$tmp/bare/scripts/"
(cd "$tmp/ws/repo" && FACTREE_STATE_WRITER=1 bash "$tmp/bare/scripts/event.sh" spec.approved demo '{"by":"A"}')
check "no manifest, no version [version-check#R1.S2]" '! tail -n1 "$tmp/ws/.factree/events.jsonl" | grep -q "\"v\":"'
start() { echo "{\"session_id\":\"s9\",\"hook_event_name\":\"$2\",\"cwd\":\"$tmp/ws/repo\"}" | bash "$1"; }
echo '{"ts":"2026-11-17T10:00:00Z","type":"spec.step","spec":"demo","v":"9.9.0","data":{}}' >> "$tmp/ws/.factree/events.jsonl"
out=$(start $P/scripts/session-hook.sh SessionStart)
check "warns when the workspace is newer [version-check#R2.S1]" 'echo "$out" | grep -q "^Factree $V is older than the 9.9.0 that last wrote this workspace. Update: /plugin → factree, then restart Claude Code.$"'
out=$(start $P/scripts/session-hook.sh UserPromptSubmit)
check "never warns on a prompt [version-check#R2.S3]" '[ -z "$out" ]'
mkdir -p "$tmp/ws2/.factree" "$tmp/ws2/repo"; echo "{\"ts\":\"2026-11-17T10:00:00Z\",\"type\":\"spec.step\",\"spec\":\"demo\",\"v\":\"$V\",\"data\":{}}" > "$tmp/ws2/.factree/events.jsonl"
out=$(echo "{\"session_id\":\"s8\",\"hook_event_name\":\"SessionStart\",\"cwd\":\"$tmp/ws2/repo\"}" | bash $P/scripts/session-hook.sh)
check "silent when current [version-check#R2.S2]" '! echo "$out" | grep -q "is older than"'
mkdir -p "$tmp/p10/scripts" "$tmp/p10/.claude-plugin"; cp $P/scripts/*.sh "$tmp/p10/scripts/"; echo '{"name":"factree","version":"0.10.0"}' > "$tmp/p10/.claude-plugin/plugin.json"
echo '{"ts":"2026-11-17T10:00:00Z","type":"spec.step","spec":"demo","v":"0.9.0","data":{}}' > "$tmp/ws2/.factree/events.jsonl"
out=$(echo "{\"session_id\":\"s7\",\"hook_event_name\":\"SessionStart\",\"cwd\":\"$tmp/ws2/repo\"}" | bash "$tmp/p10/scripts/session-hook.sh")
check "versions compare as numbers [version-check#R2.S4]" '! echo "$out" | grep -q "is older than"'
rm -rf "$tmp"

echo "# build progress"
TD="$(pwd)/$P/scripts/task-done.sh"
ST="$(pwd)/$P/scripts/state.sh"
# The plan's spec, with its state approved and planned, as the flow leaves it before a build [status-state#R7].
wstate() { mkdir -p "$1/specs"; printf -- '---\nstatus: approved\n---\n# widget-export\n' > "$1/specs/widget-export.md"
  FACTREE_HOME="$1" bash "$ST" widget-export plan work=007-widget-export >/dev/null && FACTREE_HOME="$1" bash "$ST" widget-export plan-approve work=007-widget-export >/dev/null; }
tmp=$(mktemp -d); mkdir -p "$tmp/.factree/work"; cp -R tests/validate-plan/verticals/plan "$tmp/.factree/work/007-widget-export"; wstate "$tmp/.factree"
rv() { FACTREE_HOME="$1/.factree" bash $EVENT task.reviewed 007-widget-export "{\"task\":\"$2\",\"spec\":\"$3\",\"quality\":\"${4:-pass}\"}"; }
rvs() { FACTREE_HOME="$1/.factree" bash $EVENT agent.started 007-widget-export "{\"role\":\"review\",\"task\":\"$2\",\"model\":\"sonnet\"}"; }   # the reviewer the hook would have logged
for t in T1 T2 T3; do rvs "$tmp" $t; rv "$tmp" $t pass; done
out=$(FACTREE_HOME="$tmp/.factree" bash "$TD" 007-widget-export T1 abc1234 120 "npm test")
check "marking a task done ticks its steps and logs it [build#R4.S1]" '! awk "/^### T1:/{f=1;next} /^### /{f=0} f" "$tmp/.factree/work/007-widget-export/backend/tasks.md" | grep -q "^- \[ \]" && grep -q "\"type\":\"task.done\",\"work\":\"007-widget-export\".*\"task\":\"T1\",\"commit\":\"abc1234\",\"lines\":120" "$tmp/.factree/events.jsonl" && awk "/^### T3:/{f=1;next} f" "$tmp/.factree/work/007-widget-export/backend/tasks.md" | grep -q "^- \[ \]"'
FACTREE_HOME="$tmp/.factree" bash $EVENT task.failed 007-widget-export '{"task":"T2","reason":"over budget"}'
out=$(FACTREE_HOME="$tmp/.factree" bash "$TD" 007-widget-export T3 def5678 80 "npm test")
check "a failed task keeps the plan from implemented [build#R6.S2]" '! grep -q "^implemented_at:" "$tmp/.factree/work/007-widget-export/plan.md" && ! grep -q "plan.implemented" "$tmp/.factree/events.jsonl"'
out=$(FACTREE_HOME="$tmp/.factree" bash "$TD" 007-widget-export T2 0a0b0c0 60 "npm test")
check "the last task marks the plan implemented [build#R6.S1]" 'grep -q "^implemented_at: 20" "$tmp/.factree/work/007-widget-export/plan.md" && grep -q "\"type\":\"plan.implemented\",\"work\":\"007-widget-export\"" "$tmp/.factree/events.jsonl" && echo "$out" | grep -q "007-widget-export implemented"'
check "unknown task is refused" '! FACTREE_HOME="$tmp/.factree" bash "$TD" 007-widget-export T9 x 1 y 2>/dev/null'
rm -rf "$tmp"
rtmp() { tmp=$(mktemp -d); mkdir -p "$tmp/.factree/work"; cp -R tests/validate-plan/verticals/plan "$tmp/.factree/work/007-widget-export"; wstate "$tmp/.factree"; }
tdr() { FACTREE_HOME="$tmp/.factree" bash "$TD" 007-widget-export T2 abc1234 60 "npm test" 2>&1; echo "rc=$?"; }
t2open() { awk "/^### T2:/{f=1;next} /^### /{f=0} f" "$tmp/.factree/work/007-widget-export/"*/tasks.md | grep -q "^- \[ \]"; }
rtmp; rvs "$tmp" T2; rv "$tmp" T2 pass; out=$(FACTREE_HOME="$tmp/.factree" bash "$TD" 007-widget-export T2 0123456 60 "npm test" 2>&1)
check "a numeric commit stays a quoted string in a valid event line [status-state#R7.S2]" 'grep "\"type\":\"task.done\"" "$tmp/.factree/events.jsonl" | grep -q "\"commit\":\"0123456\",\"lines\":60,"'
rm -rf "$tmp"
rtmp; rvs "$tmp" T2; rv "$tmp" T2 pass; rm -rf "$tmp/.factree/state"; FACTREE_HOME="$tmp/.factree" bash "$ST" widget-export write >/dev/null; out=$(tdr)
check "a refused move passes state.sh's exit code and leaves the steps unticked [status-state#R7.S2]" 'echo "$out" | grep -q "rc=3" && ! echo "$out" | grep -q "^T2 done" && t2open'
rm -rf "$tmp"
rtmp; rvs "$tmp" T2; rv "$tmp" T2 pass; out=$(tdr)
check "task-done.sh moves the state's count by one [status-state#R7.S2]" 'grep -q "\"tasks.007-widget-export\": \"T2\"" "$tmp/.factree/state/widget-export.json" && grep -q "\"plan.007-widget-export\": \"building\"" "$tmp/.factree/state/widget-export.json" && grep -q "\"type\":\"task.done\".*\"move\":\"task-done\"" "$tmp/.factree/events.jsonl"'
check "reviewed and passing is marked [parallel-build#R5.S1]" 'echo "$out" | grep -q "^T2 done$" && echo "$out" | grep -q "rc=0" && ! t2open'
rtmp; out=$(tdr)
check "never reviewed exits 3, ticks and logs nothing [parallel-build#R5.S2]" 'echo "$out" | grep -q "^T2 has no passing review$" && echo "$out" | grep -q "rc=3" && t2open && ! grep -q task.done "$tmp/.factree/events.jsonl" 2>/dev/null'
rtmp; rvs "$tmp" T2; rv "$tmp" T2 fail; out=$(tdr)
check "a failed review blocks [parallel-build#R5.S3]" 'echo "$out" | grep -q "rc=3" && t2open'
rtmp; rvs "$tmp" T2; rv "$tmp" T2 pass; rv "$tmp" T2 fail; FACTREE_HOME="$tmp/.factree" bash $EVENT task.reviewed 007-widget-export '{"task":"T2","round":2,"cause":"spec"}'; out=$(tdr)
check "a pass then a failing re-review blocks [parallel-build#R5.S4]" 'echo "$out" | grep -q "rc=3" && t2open'
rtmp; rvs "$tmp" T2; FACTREE_HOME="$tmp/.factree" bash $EVENT task.reviewed 008-other '{"task":"T2","spec":"pass","quality":"pass"}'; out=$(tdr)
check "another plan's review doesn't count [parallel-build#R5.S5]" 'echo "$out" | grep -q "rc=3" && t2open'
rtmp; rvs "$tmp" branch; rv "$tmp" T2 pass; out=$(tdr)
check "a branch reviewer doesn't satisfy a task's gate [build-visibility#R5.S1]" 'echo "$out" | grep -q "^T2 has no reviewer subagent$" && echo "$out" | grep -q "rc=3"'
rtmp; rv "$tmp" T2 pass; out=$(tdr)
check "a review event without a reviewer subagent exits 3 [parallel-build#R5.S6]" 'echo "$out" | grep -q "^T2 has no reviewer subagent$" && echo "$out" | grep -q "rc=3" && t2open && ! grep -q task.done "$tmp/.factree/events.jsonl"'
rm -rf "$tmp"
# task.done records the task's repo [multi-repo#R3.S4]
tmp=$(mktemp -d); tmp=$(cd "$tmp" && pwd -P); bash tests/fixtures/multi/make.sh "$tmp/ws"; mkdir -p "$tmp/ws/.factree/work"
cp -R tests/validate-plan/verticals/plan "$tmp/ws/.factree/work/007-widget-export"; printf 'frontend\nbackend\ninfra\n' > "$tmp/ws/.factree/repos.md"; wstate "$tmp/ws/.factree"
M="$tmp/ws/.factree/work/007-widget-export"
sed -i.bak 's#`src/x.ts`#`backend/src/x.ts`#' "$M/backend/tasks.md"; sed -i.bak 's#`src/x.ts`#`frontend/src/x.ts`#' "$M/frontend/tasks.md"; rm -f "$M"/*/*.bak
FACTREE_HOME="$tmp/ws/.factree" bash $EVENT agent.started 007-widget-export '{"role":"review","task":"T2","model":"sonnet"}'
FACTREE_HOME="$tmp/ws/.factree" bash $EVENT task.reviewed 007-widget-export '{"task":"T2","spec":"pass","quality":"pass"}'
FACTREE_HOME="$tmp/ws/.factree" bash "$TD" 007-widget-export T2 abc1234 60 "npm test" >/dev/null
check "task.done records the task's repo [multi-repo#R3.S4]" 'grep "\"type\":\"task.done\",\"work\":\"007-widget-export\"" "$tmp/ws/.factree/events.jsonl" | grep -q "\"task\":\"T2\",\"commit\":\"abc1234\",\"lines\":60,\"tests\":\"npm test\",\"repo\":\"frontend\""'
rm -rf "$tmp"
rtmp; rv "$tmp" T2 pass; rvs "$tmp" T2; FACTREE_HOME="$tmp/.factree" bash "$TD" 007-widget-export T2 abc1234 60 "npm test" >/dev/null
check "a single-repo task records repo \".\" [multi-repo#R3.S4]" 'grep "\"type\":\"task.done\"" "$tmp/.factree/events.jsonl" | grep -q "\"tests\":\"npm test\",\"repo\":\"\\.\""'
rm -rf "$tmp"

echo "# agent hook"
tmp=$(mktemp -d); FACTREE_HOME="$tmp/.factree" bash $EVENT task.waiting 059-x '{"task":"T2","reason":"shares lines with T3"}' 2>/dev/null
check "event.sh accepts task.waiting [parallel-build#R4.S3]" 'grep -q "\"type\":\"task.waiting\",\"work\":\"059-x\"" "$tmp/.factree/events.jsonl"'
rm -rf "$tmp"
AH="$(pwd)/$P/scripts/agent-hook.sh"
tmp=$(mktemp -d); mkdir -p "$tmp/.factree"
ah() { printf "{\"session_id\":\"s1\",\"hook_event_name\":\"PreToolUse\",\"cwd\":\"$1\",\"tool_name\":\"Agent\",\"tool_input\":{\"description\":\"$2\",\"prompt\":\"do it\",\"subagent_type\":\"general-purpose\",\"model\":\"sonnet\"}}" | bash "$AH"; }
out=$(ah "$tmp" "Review 059-x T5")
check "a reviewer start is logged with role, task and model [parallel-build#R7.S1]" '[ -z "$out" ] && grep -q "\"type\":\"agent.started\",\"work\":\"059-x\".*\"data\":{\"role\":\"review\",\"task\":\"T5\",\"model\":\"sonnet\"}" "$tmp/.factree/events.jsonl"'
ah "$tmp" "Explore the auth code"; ah "$tmp" "Reviewing 059-x T5"
check "other subagents log nothing [parallel-build#R7.S2]" '[ $(wc -l < "$tmp/.factree/events.jsonl") -eq 1 ]'
ah "$tmp" "Build 059-x T5"; check "a builder start is logged as build [parallel-build#R7.S1]" 'grep -q "\"role\":\"build\",\"task\":\"T5\"" "$tmp/.factree/events.jsonl"'
ah "$tmp" "Review 061-x branch"; ah "$tmp" "Review 061-x branched"
check "the branch reviewer is recorded [build-visibility#R5.S1]" '[ $(grep -c "\"work\":\"061-x\"" "$tmp/.factree/events.jsonl") -eq 1 ] && grep -q "\"work\":\"061-x\".*\"data\":{\"role\":\"review\",\"task\":\"branch\",\"model\":\"sonnet\"}" "$tmp/.factree/events.jsonl"'
FACTREE_HOME="$tmp/.factree" bash $EVENT task.fixing 061-x '{"task":"branch","round":1,"cause":"x"}'; FACTREE_HOME="$tmp/.factree" bash $EVENT branch.reviewed 061-x '{"verdict":"ready","must":0,"should":1}'
check "event.sh logs task.fixing and branch.reviewed on the work [build-visibility#R5.S2]" 'grep -q "\"type\":\"task.fixing\",\"work\":\"061-x\"" "$tmp/.factree/events.jsonl" && grep -q "\"type\":\"branch.reviewed\",\"work\":\"061-x\"" "$tmp/.factree/events.jsonl"'
rm -rf "$tmp"; tmp=$(mktemp -d); mkdir -p "$tmp/repo"
out=$(cd "$tmp/repo" && ah "$tmp/repo" "Review 059-x T5" 2>&1)
check "no workspace, nothing written or printed [parallel-build#R7.S3]" '[ -z "$out" ] && [ -z "$(find "$tmp" -name events.jsonl)" ] && [ ! -e "$tmp/repo/.factree" ]'
rm -rf "$tmp"
rm -rf "$tmp"

echo "# verify"
VR="$(pwd)/$P/scripts/verify-record.sh"
tmp=$(mktemp -d); cp -R tests/verify/fixture/. "$tmp/"
out=$(FACTREE_HOME="$tmp/.factree" bash "$VR" demo "$tmp" < tests/verify/results.txt)
ev=$(grep '"type":"spec.verified"' "$tmp/.factree/events.jsonl")
check "a passing test proves its scenario [verify#R2.S1]" 'echo "$ev" | grep -q "\"R1.S1\":{\"status\":\"proved\""'
check "a test citing two scenarios counts for both [verify#R1.S2]" 'echo "$ev" | grep -q "\"R1.S1\":{\"status\":\"proved\",\"evidence\":\"[^\"]*shared with another spec"'
check "one failure makes it failing [verify#R2.S2]" 'echo "$ev" | grep -q "\"R1.S2\":{\"status\":\"failing\",\"evidence\":\"failing: second of two"'
check "no test, unverified [verify#R2.S3]" 'echo "$ev" | grep -q "\"R2.S1\":{\"status\":\"unverified\",\"evidence\":\"no test cites it\"}"'
check "manual case not run since the build, unverified [verify#R2.S4]" 'echo "$ev" | grep -q "\"R2.S2\":{\"status\":\"unverified\",\"evidence\":\"manual case not run since the build\"}"'
check "manual case passed after the build, proved [verify#R2.S5]" 'echo "$ev" | grep -q "\"R2.S3\":{\"status\":\"proved\",\"evidence\":\"manual case 2 passed 2026-11-12\"}"'
check "one event with counts, nothing else changed [verify#R3.S1]" '[ $(echo "$ev" | wc -l) -eq 1 ] && echo "$ev" | grep -q "\"proved\":2,\"failing\":1,\"unverified\":2" && echo "$out" | grep -q "^demo: 2 proved · 1 failing · 2 unverified$" && diff -r tests/verify/fixture/.factree/specs "$tmp/.factree/specs" >/dev/null'
check "unknown spec is refused" '! FACTREE_HOME="$tmp/.factree" bash "$VR" nope "$tmp" < /dev/null 2>/dev/null'
rm -rf "$tmp"
tmp=$(mktemp -d); cp -R tests/verify/fixture/. "$tmp/"
printf 'pass\tpasses [demo#R1.S1]\nunchecked\tdemo#R1.S1\n' | FACTREE_HOME="$tmp/.factree" bash "$VR" demo "$tmp" > "$tmp/out1"
check "a citation that doesn't check THEN leaves it unverified [verifying#R1.S2]" 'grep -q "^  R1.S1 unverified: cited, doesn'"'"'t check THEN" "$tmp/out1"'
printf 'pass\tpasses [demo#R1.S1]\nbuild\tpass\tnpm run typecheck\n' | FACTREE_HOME="$tmp/.factree" bash "$VR" demo "$tmp" > "$tmp/out2"
check "a citing test that checks THEN proves it [verifying#R1.S1]" '! grep -q "R1.S1 " "$tmp/out2" && grep -q "^demo: 2 proved" "$tmp/out2" && tail -n1 "$tmp/.factree/events.jsonl" | grep -q "\"build\":\"passing\""'
printf 'pass\tpasses [demo#R1.S1]\nbuild\tfail\tnpm run typecheck: src/App.tsx(3,1): error TS2322\n' | FACTREE_HOME="$tmp/.factree" bash "$VR" demo "$tmp" > "$tmp/out3"
check "a failing build makes the spec failing [verifying#R2.S1]" 'head -n1 "$tmp/out3" | grep -q "^demo: failing build: npm run typecheck: src/App.tsx(3,1): error TS2322$" && tail -n1 "$tmp/.factree/events.jsonl" | grep -q "\"build\":\"failing\""'
rm -rf "$tmp"

echo "# companion decisions reach Claude"
tmp=$(mktemp -d); mkdir -p "$tmp/ws/.factree/sessions" "$tmp/ws/repo"
echo '{"id":"s5","state":"your_turn","event":"Stop","message":"","cwd":"'"$tmp"'/ws/repo","transcript":"","started":"2026-11-17T09:00:00Z","updated":"2026-11-17T10:00:00Z"}' > "$tmp/ws/.factree/sessions/s5.json"
cat > "$tmp/ws/.factree/events.jsonl" <<'JSONL'
{"ts":"2026-11-17T09:30:00Z","type":"question.answered","spec":"link-report","data":{"n":2,"answer":"old answer","by":"John Doe","via":"companion"}}
{"ts":"2026-11-17T10:05:00Z","type":"question.answered","spec":"link-report","data":{"n":3,"answer":"Beside each scenario id","by":"John Doe","via":"companion"}}
{"ts":"2026-11-17T10:06:00Z","type":"question.answered","spec":"link-report","data":{"n":4,"answer":"in chat","by":"John Doe"}}
{"ts":"2026-11-17T10:07:00Z","type":"decision.feedback","spec":"verify","data":{"work":"016-verify","note":"split T4","by":"John Doe","via":"companion"}}
{"ts":"2026-11-17T10:08:00Z","type":"spec.approved","spec":"version-check","data":{"by":"John Doe (via companion)","via":"companion"}}
JSONL
prompt() { echo "{\"session_id\":\"s5\",\"hook_event_name\":\"UserPromptSubmit\",\"cwd\":\"$tmp/ws/repo\"}" | bash $HOOK; }
out=$(prompt)
check "decisions made in the companion come with the next prompt [companion-decisions#R8.S4]" 'echo "$out" | grep -q "^Decided in the Factree companion since your last turn:$" && echo "$out" | grep -q "^- link-report question 3: Beside each scenario id (John Doe)$" && echo "$out" | grep -q "^- 016-verify changes requested: split T4 (John Doe)$" && echo "$out" | grep -q "^- version-check spec approved (John Doe (via companion))$" && ! echo "$out" | grep -q "old answer\|in chat"'
out=$(prompt)
check "nothing new, nothing added [companion-decisions#R8.S5]" '[ -z "$out" ]'
(cd "$tmp/ws/repo" && bash $EVENT review.restacked 062-x '{"pr":"12","repo":"backend","task":"T3","base":"main","sha":"abc1234"}')
check "event.sh accepts review.restacked on the work [multi-repo#R7]" 'grep -q "\"type\":\"review.restacked\",\"work\":\"062-x\"" "$tmp/ws/.factree/events.jsonl"'
check "event.sh accepts decision.feedback" '(cd "$tmp/ws/repo" && bash $EVENT decision.feedback demo "{\"note\":\"x\"}" 2>/dev/null)'
rm -rf "$tmp"

echo "# root lookup"
tmp=$(mktemp -d); mkdir -p "$tmp/ws/api/src"; (cd "$tmp/ws/api" && git init -q)
out=$(bash $ROOT "$tmp/ws/api/src"); code=$?
check "no workspace: proposes repo root, exit 1" '[ "$out" = "$tmp/ws/api/.factree" ] && [ $code -eq 1 ]'
mkdir "$tmp/ws/.factree"
out=$(bash $ROOT "$tmp/ws/api/src"); code=$?
check "parent .factree is found from a nested folder" '[ "$out" = "$tmp/ws/.factree" ] && [ $code -eq 0 ]'
out=$(FACTREE_HOME="$tmp/central" bash $ROOT "$tmp/ws/api")
check "FACTREE_HOME wins" '[ "$out" = "$tmp/central" ]'
rm -rf "$tmp"

echo "# every change through the factory"
check "the spec skill never sizes a request as no spec [factory-flow#R7.S3]" '! grep -qE "No spec\\.|no spec\\)" plugins/factree/skills/spec/SKILL.md README.md'

echo "# short output, detail folded"
# The pull request template in the review skill: from the fence after "The description" to the closing fence.
tpl=$(awk '/The description \(R2\)/{f=1; next} f && /^```/{n++; if(n==2) exit; next} f && n==1' plugins/factree/skills/review/SKILL.md)
check "the pull request opens with a short summary [concise-output#R3.S1]" '[ -n "$tpl" ] && [ $(printf "%s\n" "$tpl" | awk "/<details>/{exit} NF{c++} END{print c+0}") -le 6 ] && ! printf "%s\n" "$tpl" | awk "/<details>/{f=1} f" | grep -q "^## "'
check "every section is still there, folded [concise-output#R4.S1]" 'for s in "Spec:" "What changed" "Where to look" "Calls Claude made" "How to test"; do printf "%s\n" "$tpl" | grep -q "<details><summary>$s" || echo missing; done | grep -q missing; [ $? -ne 0 ]'

echo "# codebase health"
check "script helpers once [codebase-health#R4.S1]" '[ "$(grep -lE "^(esc|fieldof|field|json_escape|json_field)\(\)" $P/scripts/*.sh $P/skills/*/scripts/*.sh)" = "$P/scripts/lib.sh" ]'
check "script settings in config [codebase-health#R2.S1]" '! grep -lE "4747|28800" $P/scripts/*.sh $P/skills/*/scripts/*.sh | grep -v "/config.sh$"'
check "no script over 300 lines [codebase-health#R5.S1]" '[ -z "$(wc -l $P/scripts/*.sh $P/skills/*/scripts/*.sh | awk "\$2 != \"total\" && \$1 > 300")" ]'


echo "# readme"
img=$(grep -o '<img src="[^"]*\.gif"' README.md | head -1 | sed 's/<img src="//; s/"$//')   # the recording; the logo comes first (logo R1)
check "the recording at the top names a file that exists [readme#R1.S1]" '[ "$img" = "docs/factree-demo.gif" ] && [ -s "$img" ]'
check "the documented record command exists [readme#R1.S2]" 'grep -q "npm run demo" README.md && grep -q "\"demo\": \"node scripts/record-demo.mjs" apps/companion/package.json && [ -f apps/companion/scripts/record-demo.mjs ]'

D=examples/.factree
out=$(bash $P/skills/spec/scripts/validate.sh $D/specs/url-shortener.md 2>&1); s=$?; out2=$(bash $P/skills/plan/scripts/validate-plan.sh $D/work/001-url-shortener 2>&1); s2=$?
check "the demo's spec and plan pass with no errors or warnings [readme#R1.S3]" '[ $s -eq 0 ] && [ $s2 -eq 0 ] && echo "$out" | grep -q "0 error(s), 0 warning(s)" && echo "$out2" | grep -q "9/9 in-scope" && echo "$out2" | grep -q "0 error(s), 0 warning(s)" && grep -q "examples/.factree" apps/companion/scripts/record-demo.mjs'


echo "# clean install"
# The committer's own name, home folder and email appear in no tracked file, the license included [clean-install#R1.S1].
me=$(git config user.name); mail=$(git config user.email)
# A code owner's handle is public on purpose (ci R2): only a committer who isn't one is checked.
grep -qiE "@${me}( |$)" .github/CODEOWNERS 2>/dev/null && me="" && mail=""
hits=$(git ls-files | grep -v -E '\.(gif|png|jpg)$' | while read -r f; do
  { [ -n "$me" ] && [ "$me" != "John Doe" ] && grep -qiF "${me%% *}" "$f"; } || grep -qF "$HOME/" "$f" || { [ -n "$mail" ] && grep -qiF "$mail" "$f"; } && echo "$f"; done)
check "no one's name, home folder or email in tracked files, the license included; a code owner's handle is allowed [clean-install#R1.S1] [clean-install#R1.S2]" '[ -z "$hits" ] || { echo "$hits" | head -5; false; }'
# Everything the tests and the recorder need is tracked [clean-install#R2.S3].
check "the demo workspace is tracked [clean-install#R2.S3]" '[ -n "$(git ls-files examples/.factree/specs/url-shortener.md)" ] && [ -n "$(git ls-files examples/.factree/work/001-url-shortener/plan.md)" ]'
# The plugin folder alone, in a new repo with no workspace (clean-install R2).
tmp=$(mktemp -d); cp -R $P "$tmp/plugin"; mkdir "$tmp/repo"; (cd "$tmp/repo" && git init -q)
I="$tmp/plugin"
init_out=$(cd "$tmp/repo" && env -u FACTREE_HOME bash "$I/scripts/init.sh" 2>&1); init_code=$?
mkdir -p "$tmp/repo/.factree/specs" && cp tests/fixtures/workspace/specs/link-report.md "$tmp/repo/.factree/specs/"   # as the spec skill does (its step 2)
val_out=$(bash "$I/skills/spec/scripts/validate.sh" "$tmp/repo/.factree/specs/link-report.md" 2>&1); val_code=$?
(cd "$tmp/repo" && env -u FACTREE_HOME bash "$I/scripts/state.sh" link-report write >/dev/null 2>&1 && env -u FACTREE_HOME bash "$I/scripts/state.sh" link-report approve by="John Doe" >/dev/null 2>&1); ev_code=$?
hook_out=$(printf '{"session_id":"fresh1","hook_event_name":"SessionStart","cwd":"%s"}' "$tmp/repo" | env -u FACTREE_HOME bash "$I/scripts/session-hook.sh" 2>&1); hook_code=$?
check "skills' scripts work in a new repo [clean-install#R2.S1]" '[ $init_code -eq 0 ] && [ -d "$tmp/repo/.factree" ] && grep -qx ".factree/" "$tmp/repo/.git/info/exclude" && [ $val_code -eq 0 ] && [ $ev_code -eq 0 ] && grep -q "\"type\":\"spec.approved\"" "$tmp/repo/.factree/events.jsonl" && [ $hook_code -eq 0 ] && [ -f "$tmp/repo/.factree/sessions/fresh1.json" ]'
port=$((4800 + RANDOM % 150))
ui_out=$(cd "$tmp/repo" && env -u FACTREE_HOME bash "$I/scripts/ui.sh" --port $port 2>&1); ui_code=$?
page=$(curl -s -m 5 "http://localhost:$port/"); state=$(curl -s -m 5 "http://localhost:$port/api/state")
stop_out=$(cd "$tmp/repo" && env -u FACTREE_HOME bash "$I/scripts/ui.sh" --stop 2>&1); sleep 1
check "the UI works in a new repo [clean-install#R2.S2]" '[ $ui_code -eq 0 ] && echo "$page" | grep -q "<div id=\"root\">" && echo "$state" | grep -q "\"link-report\"" && echo "$stop_out" | grep -q "Stopped" && ! curl -s -m 2 "http://localhost:$port/" >/dev/null'
rm -rf "$tmp"


echo "# one example"
readers=$(git grep -l 'examples/' -- ':!examples' ':!README.md' ':!CLAUDE.md' ':!apps/companion/scripts/record-demo.mjs' ':!tests/run.sh' 2>/dev/null)
check "only the README and the demo read the example [examples#R1.S1]" '[ -z "$readers" ] || { echo "$readers"; false; }'   # tests/run.sh is left out: it holds the example's own checks
check "no CSV example left [examples#R1.S2]" '[ -z "$(git ls-files examples | grep -v url-shortener)" ] && [ -z "$(git grep -l -i "csv-[e]xport\|credentials to [C]SV" -- . ":!plugins/factree/ui")" ]'


echo "# amended plans"
amend=$(awk '/^\*\*Amending an approved plan\*\*/{f=1} f{print} f && /^$/{exit}' $P/skills/plan/SKILL.md)
check "the plan skill approves an amended plan again [planning#R6.S1]" 'echo "$amend" | grep -q "plan.approved" && echo "$amend" | grep -q "flow: no open decisions"'
check "a new pattern in an amendment is asked first [planning#R6.S2]" 'echo "$amend" | grep -q "new pattern, dependency or lens"'


echo "# checks on every pull request"
wf=.github/workflows/checks.yml
check "the workflow runs the repo's checks on pull requests and main [ci#R1.S1]" '[ -f $wf ] && grep -q "pull_request" $wf && grep -q "branches: \[main\]" $wf && grep -q "npm run typecheck" $wf && grep -q "npm test" $wf && grep -q "npm run build" $wf && grep -q "bash tests/run.sh" $wf'
check "a stale built UI fails the checks [ci#R1.S2]" 'grep -q "git diff --exit-code -- plugins/factree/ui" $wf'
check "every file has a code owner [ci#R2.S1]" 'grep -qE "^\* +@factree-ai-dev$" .github/CODEOWNERS'

echo "# readme commands"
cmds_missing=$(for c in spec plan build review ui init; do awk '/^## Commands/{f=1;next} /^## /{f=0} f' README.md | grep -q "/factree:$c\`" || echo "$c"; done)
check "the README lists the commands, no How it works [readme#R2.S1]" '! grep -q "^## How it works" README.md && grep -q "^## Commands" README.md && [ -z "$cmds_missing" ] && ! grep -q "/factree:verify" README.md'

echo "# verify paused"
check "verify is not a skill, and is kept [verify-paused#R1.S1]" '[ ! -e $P/skills/verify ] && [ -f $P/paused/verify/SKILL.md ]'
echo "# multi-repo"
REPOS="$(pwd)/$P/scripts/repos.sh"; MAKE="$(pwd)/tests/fixtures/multi/make.sh"
mtmp() { tmp=$(mktemp -d); tmp=$(cd "$tmp" && pwd -P); bash "$MAKE" "$tmp/company"; }
mtmp; co="$tmp/company"; rm -rf "$co/origins"
out=$(cd "$co" && env -u FACTREE_HOME bash "$INIT"); code=$?
check "a folder holding three repos gets a workspace listing them [multi-repo#R1.S1]" '[ $code -eq 0 ] && [ "$(echo "$out" | tail -n1)" = "$co/.factree" ] && [ "$(sort "$co/.factree/repos.md" | tr "\n" " ")" = "backend frontend infra " ]'
out=$(cd "$co/backend" && env -u FACTREE_HOME bash "$INIT"); code=$?
check "a command inside a repo finds the workspace above [multi-repo#R1.S3]" '[ $code -eq 0 ] && [ "$out" = "$co/.factree" ] && [ ! -d "$co/backend/.factree" ]'
before=$(cat "$co/.factree/repos.md"); out=$(cd "$co" && bash "$REPOS" of backend/src/x.ts); code=$?
check "repos.sh of finds the repo and never writes [multi-repo#R1]" '[ $code -eq 0 ] && [ "$out" = "backend" ] && [ "$(cat "$co/.factree/repos.md")" = "$before" ]'
out=$(cd "$co" && bash "$REPOS" of docs/x.md); code=$?
check "repos.sh of outside every repo exits 1 [multi-repo#R1]" '[ $code -eq 1 ] && [ -z "$out" ]'
out=$(cd "$co" && bash "$REPOS" list)
check "repos.sh list prints the repos" '[ "$(echo "$out" | wc -l | tr -d " ")" = 3 ]'
git init -q "$co/mobile"; (cd "$co" && bash "$REPOS" add mobile; bash "$REPOS" add mobile)
check "repos.sh add appends a newly cloned repo once [multi-repo#R1.S4]" '[ "$(grep -cx mobile "$co/.factree/repos.md")" = 1 ] && [ "$(wc -l < "$co/.factree/repos.md" | tr -d " ")" = 4 ]'
mkdir "$co/notes"; (cd "$co" && bash "$REPOS" add notes 2>/dev/null)
check "repos.sh add refuses a folder that is not a repo" '! grep -qx notes "$co/.factree/repos.md"'
rm -rf "$tmp"
tmp=$(mktemp -d); tmp=$(cd "$tmp" && pwd -P); mkdir -p "$tmp/a" "$tmp/b"
out=$(cd "$tmp" && env -u FACTREE_HOME bash "$INIT" 2>&1); code=$?
check "no repos anywhere creates nothing [multi-repo#R1.S2]" '[ $code -eq 3 ] && [ ! -d "$tmp/.factree" ] && echo "$out" | grep -q "/factree:init"'
rm -rf "$tmp"
fresh; (cd "$tmp/shop" && env -u FACTREE_HOME bash "$INIT" >/dev/null)
check "a workspace inside one repo lists . [multi-repo#R1]" '[ "$(cat "$tmp/shop/.factree/repos.md")" = "." ] && [ "$(cd "$tmp/shop" && bash "$REPOS" of src/a.ts)" = "." ]'
rm -rf "$tmp"
mtmp; co="$tmp/company"; mkdir "$tmp/home"
out=$(cd "$co" && FACTREE_HOME="$tmp/home" bash "$INIT")
check "FACTREE_HOME still wins [multi-repo#R1]" '[ "$(echo "$out" | tail -n1)" = "$tmp/home" ] && [ ! -d "$co/.factree" ]'
rm -rf "$tmp"
tmp=$(mktemp -d); tmp=$(cd "$tmp" && pwd -P); ln -s "$tmp" "$tmp-link"; co="$tmp-link/co"; mkdir -p "$co/a" "$co/ab" "$co/a b"
for r in a "a b"; do git init -q "$co/$r"; done
(cd "$co" && env -u FACTREE_HOME bash "$INIT" >/dev/null; git init -q a/inner; bash "$REPOS" add a/inner)
of() { (cd "$co" && bash "$REPOS" of "$1"); }
check "a path in a folder not created yet, through a symlink, finds its repo [multi-repo#R1]" '[ "$(of "a b/new/dir/x.ts")" = "a b" ] && [ "$(of "$tmp/co/a/new/x.ts")" = "a" ]'
check "a repo folder matches on a / boundary only [multi-repo#R1]" '! of ab/x.ts >/dev/null && [ "$(of a/x.ts)" = "a" ]'
check "the longest repo wins for a nested repo [multi-repo#R1]" '[ "$(of a/inner/new/x.ts)" = "a/inner" ]'
(cd "$co" && bash "$REPOS" add "$tmp/elsewhere" 2>/dev/null); mkdir "$tmp/out"; git init -q "$tmp/out"; (cd "$co" && bash "$REPOS" add "$tmp/out" 2>/dev/null); code=$?
check "add refuses a folder outside the workspace's folder [multi-repo#R1]" '! grep -q out "$co/.factree/repos.md"'
rm -rf "$tmp" "$tmp-link"

echo "# one repo per task"
PREPOS="$(pwd)/$P/scripts/plan-repos.sh"
tmp=$(mktemp -d); tmp=$(cd "$tmp" && pwd -P); bash "$MAKE" "$tmp/ws"; mkdir -p "$tmp/ws/.factree/work" "$tmp/ws/.factree/specs"
cp -R tests/validate-plan/verticals/plan "$tmp/ws/.factree/work/007-widget-export"; cp tests/validate-plan/verticals/widget-export.md "$tmp/ws/.factree/specs/"
W="$tmp/ws/.factree/work/007-widget-export"; printf 'frontend\nbackend\ninfra\n' > "$tmp/ws/.factree/repos.md"
sed -i.bak 's#`src/x.ts`#`backend/src/x.ts`#' "$W/backend/tasks.md"; sed -i.bak 's#`src/x.ts`#`frontend/src/x.ts` (the page)#' "$W/frontend/tasks.md"; rm -f "$W"/*/*.bak
out=$(bash "$PREPOS" "$W" 2>&1); code=$?
check "a task in one repo has that repo [multi-repo#R2.S1]" 'echo "$out" | grep -q "^T1	backend$" && echo "$out" | grep -q "^T2	frontend$"'
check "a clean multi-repo plan passes" '[ $code -eq 0 ] && bash $PLANV "$W" 2>&1 | grep -q "0 error(s)"'
sed -i.bak 's#`backend/src/x.ts`#`backend/src/x.ts`, `frontend/y.ts`#' "$W/backend/tasks.md"; rm -f "$W"/*/*.bak
out=$(bash "$PREPOS" "$W" 2>&1 >/dev/null); code=$?
check "a task spanning two repos is an error naming both [multi-repo#R2.S2]" '[ $code -eq 1 ] && echo "$out" | grep -q "^T3 spans repos backend, frontend$" && bash $PLANV "$W" 2>&1 | grep -q "^ERROR .*T3 spans repos backend, frontend"'
sed -i.bak 's#`frontend/src/x.ts`#`docs/notes.md`#' "$W/frontend/tasks.md"; rm -f "$W"/*/*.bak
out=$(bash "$PREPOS" "$W" 2>&1 >/dev/null)
check "a file outside every repo is an error [multi-repo#R2.S4]" 'echo "$out" | grep -q "^T2: docs/notes.md is in no repo$"'
rm "$tmp/ws/.factree/repos.md"
out=$(bash "$PREPOS" "$W" 2>&1); code=$?
check "a single-repo workspace's tasks pass [multi-repo#R2.S3]" '[ $code -eq 0 ] && [ "$(echo "$out" | grep -c "	\.$")" -eq 3 ]'
check "validate-plan.sh stays under 300 lines [multi-repo#R2]" '[ $(wc -l < $PLANV) -lt 300 ]'
rm -rf "$tmp"

echo "# pull request plan"
PRP="$(pwd)/$P/scripts/pr-plan.sh"
tmp=$(mktemp -d); tmp=$(cd "$tmp" && pwd -P); bash "$MAKE" "$tmp/ws"; W="$tmp/ws/.factree/work/009-demo"; mkdir -p "$W" "$tmp/ws/.factree/profiles"
printf 'frontend\nbackend\ninfra\n' > "$tmp/ws/.factree/repos.md"
# mk <id> <repo> <depends> <est>: append a task to $W/tasks.md
mk() { printf '### T%s: t\n\n**Depends on:** %s\n**Est. diff:** ~%s lines\n\n**Files**\n- Create: `%s/x%s.ts`\n\n' "$1" "$3" "$4" "$2" "$1" >> "$W/tasks.md"; }
plan() { printf -- '---\nreview_budget: %s\n---\n' "${1:-300}" > "$W/plan.md"; : > "$W/tasks.md"; }
for r in frontend backend infra; do git -C "$tmp/ws/$r" remote set-head origin -a >/dev/null; done
plan; mk 1 backend none 180; mk 2 frontend none 150
out=$(bash "$PRP" "$W"); code=$?
check "independent tasks in two repos each get a PR on their base [multi-repo#R5.S1]" '[ $code -eq 0 ] && [ "$out" = "$(printf "T1\tbackend\tfactree/009-demo-T1\tmain\t-\nT2\tfrontend\tfactree/009-demo-T2\tdevelop\t-")" ]'
plan; mk 1 backend none 280; mk 3 backend "T1 (needs it)" 280
out=$(bash "$PRP" "$W")
check "a dependency in the repo stacks the PR on its branch [multi-repo#R5.S2]" '[ "$out" = "$(printf "T1\tbackend\tfactree/009-demo-T1\tmain\t-\nT3\tbackend\tfactree/009-demo-T3\tfactree/009-demo-T1\t-")" ]'
plan; mk 1 backend none 200; mk 2 backend none 200; mk 3 backend none 200; mk 4 backend "T2, T3" 200
out=$(bash "$PRP" "$W")
check "two dependencies stack on the highest and name the other [multi-repo#R5.S3]" 'echo "$out" | grep -q "^T4	backend	factree/009-demo-T4	factree/009-demo-T3	factree/009-demo-T2$" && [ "$(echo "$out" | tail -1 | cut -f1)" = T4 ]'
plan; mk 5 infra none 40; mk 6 infra "T5" 60
out=$(bash "$PRP" "$W")
check "a small chain shares one PR within review_budget [multi-repo#R5.S4]" '[ "$out" = "$(printf "T5,T6\tinfra\tfactree/009-demo-T6\tmain\t-")" ]'
plan 90; mk 5 infra none 40; mk 6 infra "T5" 60; out=$(bash "$PRP" "$W")
check "a chain over review_budget is split [multi-repo#R5.S4]" '[ "$(echo "$out" | wc -l | tr -d " ")" = 2 ]'
plan; mk 1 backend none 40; mk 2 backend T1 40; mk 3 backend T2 40; mk 4 backend T2 40
out=$(bash "$PRP" "$W")
check "a middle task with another dependent ends its PR [multi-repo#R5.S4]" '[ "$out" = "$(printf "T1,T2\tbackend\tfactree/009-demo-T2\tmain\t-\nT3\tbackend\tfactree/009-demo-T3\tfactree/009-demo-T2\t-\nT4\tbackend\tfactree/009-demo-T4\tfactree/009-demo-T2\t-")" ]'
plan; mk 7 backend none 40; mk 8 backend "T7" 40; mk 9 backend "T7" 40
out=$(bash "$PRP" "$W")
check "a task others depend on does not share a PR [multi-repo#R5.S4]" '[ "$(echo "$out" | wc -l | tr -d " ")" = 3 ]'
plan; mk 1 backend none 100; mk 2 infra none 100; mk 3 frontend "T1, T2" 100
out=$(bash "$PRP" "$W")
check "a task depending only on other repos starts from its base and names them [multi-repo#R5.S3]" 'echo "$out" | grep -q "^T3	frontend	factree/009-demo-T3	develop	backend#T1,infra#T2$"'
printf 'base: trunk\n' > "$tmp/ws/.factree/profiles/backend.md"

out=$(bash "$PRP" "$W")
check "each repo's base branch comes from its profile, else its default [multi-repo#R5.S6]" 'echo "$out" | grep -q "^T1	backend	[^	]*	trunk" && echo "$out" | grep -q "^T2	infra	[^	]*	main" && echo "$out" | grep -q "	frontend	[^	]*	develop"'
git -C "$tmp/ws/frontend" remote set-head origin -d; out=$(bash "$PRP" "$W")
check "without origin/HEAD the base is the remote's default branch [multi-repo#R5.S6]" 'echo "$out" | grep -q "	frontend	[^	]*	develop"'
rm "$tmp/ws/.factree/repos.md"; plan; mk 1 a none 100; mk 2 b none 100; mk 3 c none 100
out=$(bash "$PRP" "$W")
check "a single-repo plan gets one PR per task and no integration branch [multi-repo#R5.S5]" '[ "$(echo "$out" | wc -l | tr -d " ")" = 3 ] && ! echo "$out" | cut -f3,4 | tr "\t" "\n" | grep -qx "factree/009-demo"'
check "pr-plan.sh stays under 300 lines [multi-repo#R5]" '[ $(wc -l < $PRP) -lt 300 ]'
rm -rf "$tmp"

echo "# state"
ST="$(pwd)/$P/scripts/state.sh"
# A workspace with spec link-report (draft) and plan 002-link-report (draft, 5 tasks).
sw() { tmp=$(mktemp -d); W="$tmp/.factree"; WK="$W/work/002-link-report"; SF="$W/state/link-report.json"; mkdir -p "$W/specs" "$WK/backend"; : > "$W/events.jsonl"
  sed 's/^status: approved$/status: draft/' tests/fixtures/workspace/specs/link-report.md > "$W/specs/link-report.md"
  sed 's/^status: approved$/status: draft/' tests/fixtures/workspace/work/002-link-report/plan.md > "$WK/plan.md"
  for n in 1 2 3 4 5; do printf '### T%s: task %s\n' $n $n; done > "$WK/backend/tasks.md"; }
st() { FACTREE_HOME="$W" bash "$ST" "$@" 2>&1; }
snap() { cksum "$SF" "$W/events.jsonl" "$W/specs/link-report.md" "$WK/plan.md"; }
jsonok() { awk '{ L[NR] = $0 } END { if (L[1] != "{" || L[NR] != "}") exit 1; for (i = 2; i < NR - 1; i++) if (L[i] !~ /^  "[^"]+": "[^"]*",$/) exit 1; if (L[NR-1] !~ /^  "[^"]+": "[^"]*"$/) exit 1 }' "$1"; }
sw; st link-report write >/dev/null; out=$(st link-report approve by="flow: no open decisions"); code=$?
check "approve from writing records approved, the spec's status line and spec.approved [status-state#R2.S1]" '[ $code -eq 0 ] && grep -q "\"spec\": \"approved\"" "$SF" && grep -q "^status: approved$" "$W/specs/link-report.md" && grep -q "\"type\":\"spec.approved\",\"spec\":\"link-report\".*\"by\":\"flow: no open decisions\"" "$W/events.jsonl" && jsonok "$SF"'
before=$(snap); out=$(st link-report approve); code=$?
check "approve twice: no change, 'already approved', exit 0 [status-state#R2.S3]" '[ $code -eq 0 ] && [ "$out" = "link-report is already approved" ] && [ "$before" = "$(snap)" ]'
FACTREE_HOME="$W" bash $EVENT spec.step link-report '{"step":"checking"}'
check "a spec.step after approve leaves it approved [status-state#R3.S1]" 'st link-report show | grep -q "\"spec\": \"approved\""'
st link-report plan work=002-link-report >/dev/null; st link-report plan-approve work=002-link-report >/dev/null
check "plan-approve sets the plan approved and its status line" 'grep -q "\"plan.002-link-report\": \"approved\"" "$SF" && grep -q "^status: approved$" "$WK/plan.md" && grep -q "\"type\":\"plan.approved\",\"work\":\"002-link-report\"" "$W/events.jsonl"'
before=$(snap); out=$(st link-report implemented work=002-link-report); code=$?
check "implemented with 0 of 5 tasks done prints the reason, changes nothing, exit 3 [status-state#R2.S2]" '[ $code -eq 3 ] && [ "$out" = "002-link-report can'"'"'t be implemented: 0 of 5 tasks done" ] && [ "$before" = "$(snap)" ]'
for t in T1 T2 T3 T4 T5; do st link-report task-done work=002-link-report task=$t >/dev/null; done; out=$(st link-report task-done work=002-link-report task=T2)
check "task-done counts each task once" '[ "$out" = "T2 is already done in 002-link-report" ] && grep -q "\"tasks.002-link-report\": \"T1 T2 T3 T4 T5\"" "$SF" && grep -q "\"total.002-link-report\": \"5\"" "$SF" && st link-report implemented work=002-link-report >/dev/null && grep -q "\"plan.002-link-report\": \"implemented\"" "$SF"'
st link-report hold stage=review reason="acceptance run on SHORT-43" >/dev/null; held=$(cat "$SF"); st link-report release stage=review >/dev/null
check "hold then release per work [status-state#R3.S3]" 'echo "$held" | grep -q "\"hold.002-link-report\": \"review acceptance run on SHORT-43\"" && echo "$held" | grep -q "\"hold_since.002-link-report\": \"20" && ! grep -q "hold" "$SF" && grep -q "\"type\":\"stage.released\",\"work\":\"002-link-report\"" "$W/events.jsonl"'
before=$(snap); out=$(st link-report hold stage=review 'reason=a"b'); code=$?
check "a value with \" is refused, naming the field" '[ $code -eq 3 ] && echo "$out" | grep -q "reason" && [ "$before" = "$(snap)" ]'
rm -rf "$tmp"
sw; st link-report write >/dev/null; st link-report approve >/dev/null; st link-report plan work=002-link-report >/dev/null; st link-report plan-approve work=002-link-report >/dev/null
for t in T1 T2 T3 T4 T5; do st link-report task-done work=002-link-report task=$t >/dev/null; done; st link-report implemented work=002-link-report >/dev/null
st link-report review-open work=002-link-report pr=0123 >/dev/null; code=$?
check "review-open pr=0123 logs pr as a string and every event line is valid JSON [status-state#R3.S4]" '[ $code -eq 0 ] && grep -q "\"type\":\"review.opened\".*\"pr\":\"0123\"" "$W/events.jsonl" && ! grep -vq "^{.*\"data\":{.*}}$" "$W/events.jsonl" && ! grep -Eq "\"(pr|commit)\":[0-9]*0[0-9]*[,}]" "$W/events.jsonl" && grep -q "\"prs.002-link-report\": \"0123\"" "$SF"'
rm -rf "$tmp"
sw; st link-report write >/dev/null; for w in a b c d e f; do st link-report hold work=$w stage=build reason="r $w" >/dev/null & done; wait
check "two writers at once: both moves applied, valid JSON, both events [status-state#R2.S4]" 'jsonok "$SF" && [ $(grep -c "\"hold\.[a-f]\": \"build r [a-f]\"" "$SF") -eq 6 ] && [ $(grep -c "\"type\":\"stage.held\"" "$W/events.jsonl") -eq 6 ] && grep -q "\"seq\": \"7\"" "$SF"'
rm -rf "$tmp"
sw; mkdir -p "$W/state/.lock-link-report"; touch -t 202001010000 "$W/state/.lock-link-report"; out=$(st link-report write); code=$?
check "a lock older than 30 s is taken over" '[ $code -eq 0 ] && grep -q "\"spec\": \"writing\"" "$SF" && [ ! -d "$W/state/.lock-link-report" ]'
sw; sh -c 'exit 0' & dead=$!; wait $dead; mkdir -p "$W/state/.lock-link-report"; echo $dead > "$W/state/.lock-link-report/pid"; out=$(st link-report write); code=$?
check "a lock whose process is gone is taken over at once" '[ $code -eq 0 ] && grep -q "\"spec\": \"writing\"" "$SF" && [ ! -d "$W/state/.lock-link-report" ] && ! ls -a "$W/state" | grep -q stale'
mkdir "$W/state/.lock-link-report"; echo $$ > "$W/state/.lock-link-report/pid"; before=$(snap); out=$(st link-report approve); code=$?
check "a lock held by a running process: exit 4, nothing changed" '[ $code -eq 4 ] && [ "$before" = "$(snap)" ]'
rmdir "$W/state/.lock-link-report" 2>/dev/null; rm -rf "$W/state/.lock-link-report"
before=$(snap); out=$(st link-report hold stage=Review reason=x); c1=$?; out2=$(st link-report task-done work=002-link-report "task=T1 T2"); c2=$?; out3=$(st link-report hold stage=review reason=x pr="1 2"); c3=$?
check "an upper-case stage and spaces in task or pr are refused, naming the field" '[ $c1 -eq 3 ] && echo "$out" | grep -q stage && [ $c2 -eq 3 ] && echo "$out2" | grep -q task && [ $c3 -eq 3 ] && echo "$out3" | grep -q pr && [ "$before" = "$(snap)" ]'
echo 'garbage' >> "$SF"; before=$(snap); out=$(st link-report approve); code=$?; n=$(wc -l < "$SF" | tr -d " ")
check "an unreadable state line refuses the move and names it" '[ $code -eq 3 ] && [ "$out" = "state/link-report.json line $n is not readable; fix or remove it" ] && [ "$before" = "$(snap)" ]'
rm -rf "$tmp"
# Staleness by what the plan covers (002-link-report: R5, R6).
mg() { FACTREE_HOME="$1" bash "$ST" migrate >/dev/null 2>&1; }
spec_edit() { awk "$1" "$W/specs/link-report.md" > "$tmp/s" && cp "$tmp/s" "$W/specs/link-report.md"; }
sw; st link-report approve >/dev/null; st link-report plan work=002-link-report >/dev/null; st link-report plan-approve work=002-link-report >/dev/null
check "plan-approve stores a sum per covered requirement" '[ $(grep -c "\"cover\.002-link-report\.R[56]\": \"[0-9]* [0-9]*\"" "$SF") -eq 2 ] && ! grep -q "cover\.002-link-report\.R[1-4]" "$SF" && jsonok "$SF"'
spec_edit '/^### Requirement: R1 /{skip=1} /^### Requirement: R2 /{skip=0} !skip{sub(/^retired: \[\]$/, "retired: [R1]"); print}'; out=$(st link-report stale); code=$?
check "retiring an uncovered requirement leaves plan, build and review not stale [status-state#R4.S1]" '[ $code -eq 0 ] && [ -z "$out" ]'
spec_edit '/^## Purpose/{print; getline; print "A changed word. " $0; next} {print}'; out=$(st link-report stale)
check "a Purpose edit makes nothing stale [status-state#R4.S3]" '[ -z "$out" ] && grep -q "^A changed word" "$W/specs/link-report.md"'
spec_edit '{print} /^### Requirement: R5 /{print "#### Scenario: S3 New"; print "- **THEN** more"}'; out=$(st link-report stale)
st link-report plan-approve work=002-link-report >/dev/null; out2=$(st link-report stale); out3=$(st link-report plan-approve work=002-link-report)
check "a covered requirement gaining a scenario makes the plan stale until plan-approve [status-state#R4.S2]" '[ "$out" = 002-link-report ] && [ -z "$out2" ] && [ $(grep -c "\"type\":\"plan.approved\"" "$W/events.jsonl") -eq 2 ] && [ "$out3" = "002-link-report is already approved" ]'
spec_edit '/^Source: JIRA-517/{print "Source: JIRA-999"; next} {print}'; out=$(st link-report stale)
check "a Source: line or spacing change makes nothing stale" '[ -z "$out" ]'
spec_edit '/^### Requirement: R6 /{skip=1} /^## Code/{skip=0} !skip{print}'; out=$(st link-report stale)
check "a covered requirement retired makes the plan stale" '[ "$out" = 002-link-report ]'
for t in T1 T2 T3 T4 T5; do st link-report task-done work=002-link-report task=$t >/dev/null; done
st link-report implemented work=002-link-report >/dev/null; st link-report review-open work=002-link-report pr=1 >/dev/null; st link-report merged work=002-link-report >/dev/null; out=$(st link-report stale)
spec_edit '{print} /^### Requirement: R5 /{print "#### Scenario: S4 Newer"}'; out2=$(st link-report stale)
check "a merged plan is not stale for a retired requirement, only for a changed one [status-state D6]" 'grep -q "\"review.002-link-report\": \"merged\"" "$SF" && [ -z "$out" ] && [ "$out2" = 002-link-report ]'
rm -rf "$tmp"
sw; st link-report approve >/dev/null; st link-report plan-approve work=002-link-report >/dev/null
awk '{ printf "%s\r\n", $0 }' "$W/specs/link-report.md" > "$tmp/s" && cp "$tmp/s" "$W/specs/link-report.md"; out=$(st link-report stale)
check "line endings changed to CRLF make nothing stale" '[ -z "$out" ] && grep -q "$(printf "\r")" "$W/specs/link-report.md"'
rm -rf "$tmp"
sw; sed 's/^status: draft$/status: approved/' "$W/specs/link-report.md" > "$tmp/s" && cp "$tmp/s" "$W/specs/link-report.md"
mv "$WK/plan.md" "$tmp/plan.md"; st link-report write >/dev/null; st link-report approve >/dev/null; mv "$tmp/plan.md" "$WK/plan.md"
out=$(st link-report plan work=002-link-report); code=$?
check "plan after the plan skill wrote plan.md records planned, sets plan and logs plan.created" '[ $code -eq 0 ] && [ "$out" = "link-report: plan" ] && grep -q "\"plan\": \"002-link-report\"" "$SF" && grep -q "\"plan.002-link-report\": \"planned\"" "$SF" && grep -q "\"type\":\"plan.created\",\"work\":\"002-link-report\"" "$W/events.jsonl"'
chmod 200 "$W/events.jsonl"; out=$(st link-report hold stage=build reason=x); code=$?; chmod 644 "$W/events.jsonl"
check "a move on a state that lacks no plan doesn't read events.jsonl" '[ $code -eq 0 ] && [ "$out" = "link-report: hold" ]'
rm -rf "$tmp"
sw; for i in 1 2 3 4; do mg "$W" & done; for w in a b c d e f g h i j k l; do st link-report hold work=$w stage=build reason=r >/dev/null & done; wait
check "migrates in parallel with moves lose nothing" 'jsonok "$SF" && [ $(grep -c "\"hold\.[a-l]\": \"build r\"" "$SF") -eq 12 ] && [ $(grep -c "\"type\":\"stage.held\"" "$W/events.jsonl") -eq 12 ] && grep -q "\"seq\": \"12\"" "$SF"'
rm -rf "$tmp"
# Migrate: the test fixture, then a copy of this repo's own workspace (local only, so skipped where there is none).
tmp=$(mktemp -d); W="$tmp/.factree"; cp -R tests/fixtures/workspace "$W"; ev=$(cksum < "$W/events.jsonl"); mg "$W"; code=$?
check "migrate on a copy of the test fixture writes one state file per spec [status-state#R6.S1]" '[ $code -eq 0 ] && [ "$(ls "$W/state")" = link-report.json ] && jsonok "$W/state/link-report.json" && [ "$ev" = "$(cksum < "$W/events.jsonl")" ]'
check "migrate maps files and events, and snapshots only plans not stale today" 'SF="$W/state/link-report.json"; grep -q "\"spec\": \"approved\"" "$SF" && grep -q "\"plan\": \"002-link-report\"" "$SF" && grep -q "\"plan.001-link-report\": \"approved\"" "$SF" && grep -q "\"cover.002-link-report.R5\"" "$SF" && ! grep -q "cover.001-link-report.R" "$SF" && grep -q "\"cover.001-link-report.stale\"" "$SF" && [ "$(st link-report stale)" = 001-link-report ]'
rm -rf "$tmp"
sw; out=$(st link-report plan-approve work=002-link-report); code=$?
check "plan-approve on an unmigrated workspace succeeds" '[ $code -eq 0 ] && grep -q "\"plan.002-link-report\": \"approved\"" "$SF" && grep -q "^status: approved$" "$WK/plan.md" && grep -q "cover.002-link-report.R6" "$SF"'
rm -rf "$tmp"
tmp=$(mktemp -d); W="$tmp/.factree"; cp -R tests/fixtures/workspace "$W"; cp -R tests/fixtures/workspace "$tmp/m"; mg "$tmp/m"
out=$(st link-report plan-approve work=002-link-report); code=$?
check "an unmigrated plan approved on disk answers already approved" '[ $code -eq 0 ] && [ "$out" = "002-link-report is already approved" ] && [ ! -f "$W/state/link-report.json" ]'
st link-report hold work=002-link-report stage=build reason=x >/dev/null
check "a move on a spec with no state file seeds it like migrate" '[ "$(grep -v -e "\"seq\"" -e "hold" "$W/state/link-report.json")" = "$(grep -v "\"seq\"" "$tmp/m/state/link-report.json")" ] && grep -q "\"seq\": \"1\"" "$W/state/link-report.json"'
rm -rf "$tmp"
tmp=$(mktemp -d); W="$tmp/.factree"; cp -R tests/fixtures/workspace "$W"
for e in 'review.opened {"pr":"15"}' 'review.opened {"pr":"17"}' 'review.state {"pr":"17","state":"MERGED"}' 'review.opened {"pr":"3"}' 'review.state {"pr":"3","state":"CLOSED"}'; do
  w=002-link-report; case "$e" in *'"3"'*) w=001-link-report ;; esac; FACTREE_HOME="$W" bash $EVENT ${e%% *} $w "${e#* }"; done; mg "$W"
check "review stage as the UI reads it: an unstated PR superseded by a later merged one, a closed one alone" 'grep -q "\"review.002-link-report\": \"merged\"" "$W/state/link-report.json" && grep -q "\"review.001-link-report\": \"closed\"" "$W/state/link-report.json"'
rm -rf "$tmp"
own="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)/.factree"
if [ -d "$own/specs" ]; then
  tmp=$(mktemp -d); W="$tmp/.factree"; mkdir -p "$W"; cp -R "$own/specs" "$own/work" "$own/events.jsonl" "$W/"
  n=$(ls "$W/specs"/*.md | wc -l | tr -d " "); mg "$W"; code=$?; m=$(ls "$W/state"/*.json | wc -l | tr -d " ")
  ok=1; for f in "$W/state"/*.json; do jsonok "$f" || ok=0; done
  check "migrate on this repo's workspace writes one state file per spec ($n) [status-state#R6.S1]" '[ $code -eq 0 ] && [ "$m" = "$n" ] && [ $ok = 1 ]'
  check "after migrate, releases reads approved and no build-status plan is stale, the row's 065 included [status-state#R6.S1, D6]" 'grep -q "\"spec\": \"approved\"" "$W/state/releases.json" && grep -q "\"plan\": \"065-release-0-18-1\"" "$W/state/build-status.json" && [ -z "$(st build-status stale)" ]'
  check "a pull request with no state is superseded by a later merged one (spec-flow 032: 15, 17) [status-state#R6.S3]" 'grep -q "\"review.032-flow-tab-link\": \"merged\"" "$W/state/spec-flow.json"'
  before=$(cksum "$W/state"/*.json "$W/events.jsonl" "$W/specs"/*.md); mg "$W"
  check "migrate twice changes nothing [status-state#R6.S2]" '[ "$before" = "$(cksum "$W/state"/*.json "$W/events.jsonl" "$W/specs"/*.md)" ]'
  rm -rf "$tmp"
else echo "skip migrate on this repo's workspace: none at $own"; fi
check "state.sh stays under 300 lines" '[ $(wc -l < "$ST") -lt 300 ]'

echo "# releases"
VB="$PWD/tests/version-bump.sh"
tmp=$(mktemp -d); r="$tmp/r"; mkdir -p "$r/$P/.claude-plugin" "$r/.factree" "$r/tests"
cp $P/.claude-plugin/plugin.json "$r/$P/.claude-plugin/"; cp README.md "$r/"
g() { git -C "$r" -c user.name=t -c user.email=t@t "$@"; }
git -C "$r" init -q -b main; echo a > "$r/$P/x"; g add -A; g commit -qm base
g checkout -qb change; echo b >> "$r/$P/x"; g commit -qam change
out=$(cd "$r" && bash "$VB" main 2>&1); code=$?
check "plugin changed with the version unchanged fails with the message [releases#R2.S1]" '[ $code -eq 1 ] && [ "$out" = "$P changed but the version is still $V; bump it in plugin.json and the README badge" ]'
sed "s/\"version\": \"$V\"/\"version\": \"99.0.0\"/" "$r/$P/.claude-plugin/plugin.json" > "$tmp/pj"; cp "$tmp/pj" "$r/$P/.claude-plugin/plugin.json"
sed "s/badge\/version-$V-/badge\/version-99.0.0-/" "$r/README.md" > "$tmp/rd"; cp "$tmp/rd" "$r/README.md"; g commit -qam bump
out=$(cd "$r" && bash "$VB" main 2>&1); code=$?
check "plugin changed and the version bumped passes [releases#R2.S2]" '[ $code -eq 0 ]'
g checkout -q main; g checkout -qb docs; echo c > "$r/.factree/n"; echo d > "$r/tests/t"; g add -A; g commit -qm docs
out=$(cd "$r" && bash "$VB" main 2>&1); code=$?
check "only .factree and tests changed passes [releases#R2.S3]" '[ $code -eq 0 ]'
B=$(sed -n 's/.*badge\/version-\([^-]*\)-.*/\1/p' README.md | head -n1)
check "README badge matches plugin.json [releases#R3.S1]" '[ "$B" = "$V" ]'
sed "s/badge\/version-$V-/badge\/version-0.0.1-/" "$r/README.md" > "$tmp/rd"; cp "$tmp/rd" "$r/README.md"
out=$(cd "$r" && bash "$VB" main 2>&1); code=$?
check "a stale README badge fails, naming both versions [releases#R3.S1]" '[ $code -eq 1 ] && echo "$out" | grep -q "0.0.1" && echo "$out" | grep -q "$V"'
check "CLAUDE.md states the versioning rule [releases#R1.S1]" 'grep -q "bumps the version in .plugin.json. and the README badge together" CLAUDE.md'
rm -rf "$tmp"

exit $fail
