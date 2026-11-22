// The plan's Build tab: each task's status as it builds (spec build R8).

import { verticalLabel } from "../../words.ts";
import type { Plan, TaskBuild, BranchReview } from "../../../shared/types.ts";
import { CopyCommand } from "../bits.tsx";
import { planHref } from "../../links.ts";

// The Build tab (build R8): every task in build order with its status, and the commit and lines once done.
const BUILD_LABEL = { waiting: "Waiting", running: "Running", done: "Done", failed: "Failed", blocked: "Blocked" } as const;

// The row's live state from the build entry's phase (build-visibility R2).
function stateText(b: TaskBuild, waitingOn: string[]): string {
  if (b.status !== "running" && b.status !== "waiting") return "";
  if (b.phase === "fixing") return `Fix round ${b.round ?? 1}${b.cause ? `: ${b.cause}` : ""}`;
  if (b.phase === "reviewing") return b.verdict === "pass/pass" && b.reviewerRecorded ? "Reviewed ✓, merging" : "Reviewing";
  if (b.phase === "building") return `Building${b.model ? ` (${b.model})` : ""}`;
  if (b.status === "waiting" && b.reason) return `Waiting: ${b.reason}`;
  return waitingOn.length ? `on ${waitingOn.join(", ")}` : "";
}
// Verdict, findings and suggestions not built, as small notes under the evidence.
function reviewNotes(b: TaskBuild): string[] {
  const n: string[] = [];
  if (b.verdict && b.status === "done") n.push(b.verdict === "pass/pass" && b.reviewerRecorded ? "reviewed ✓" : !b.reviewerRecorded ? "review not recorded" : `review ${b.verdict}`);
  if (b.findings || b.suggestions) n.push(`${b.findings ?? 0} finding${b.findings === 1 ? "" : "s"} · ${b.suggestions ?? 0} suggestion${b.suggestions === 1 ? "" : "s"} not built`);
  if (b.status === "done" && b.model) n.push(b.model);
  return n;
}
const SEVERITY = ["must-fix", "should-fix", "minor"];
const rank = (s: string) => { const i = SEVERITY.indexOf(s); return i < 0 ? SEVERITY.length : i; };

// The whole-branch review once it starts (build-visibility R3).
function BranchPanel({ r }: { r: BranchReview }) {
  const findings = [...r.findings].sort((a, b) => rank(a.severity) - rank(b.severity));
  return (
    <section className="branch-review" aria-label="Branch review">
      <h3>Branch review{r.phase === "probing" && <span className="count"> · Probing</span>}{r.phase === "fixing" && <span className="count"> · Fixing</span>}</h3>
      {findings.length > 0 && <ul className="br-findings">{findings.map((f, i) => (
        <li key={i}><span className={`sev ${f.severity}`}>{f.severity}</span> {f.text}{f.evidence && <div className="evidence"><code>{f.evidence}</code></div>}</li>
      ))}</ul>}
      {r.notProbed.length > 0 && <><h4>Not probed</h4><ul>{r.notProbed.map((n, i) => <li key={i}><strong>{n.area}</strong>: {n.reason}</li>)}</ul></>}
      {r.rounds.length > 0 && <ul>{r.rounds.map((x) => <li key={x.round}>Fix round {x.round}: {x.cause}</li>)}</ul>}
      {r.phase === "ended" && <p className="br-outcome"><strong>{r.must === 0 ? "Ready: 0 must-fix open" : `${r.must} must-fix open`}</strong></p>}
    </section>
  );
}

export function BuildTab({ plan, specId }: { plan: Plan; specId: string }) {
  const tasks = plan.verticals.flatMap((v) => (v.tasks ?? []).map((t) => ({ t, v: v.name })))
    .sort((a, b) => Number(a.t.id.slice(1)) - Number(b.t.id.slice(1)));
  const started = Object.values(plan.build).some((b) => b.status !== "waiting");
  return (
    <section className="md" aria-label="Build">
      {plan.implementedAt
        ? <div className="notice"><strong>Implemented</strong> {plan.implementedAt.slice(0, 10)}: every task is done. <code>factree/{plan.work}</code> is ready for review.</div>
        : !started && <div className="notice">Not built yet. In Claude Code: <CopyCommand command={`/factree:build ${plan.work}`} /></div>}
      <table className="md-table build-table">
        <thead><tr><th>Task</th><th>Vertical</th><th>Status</th><th>Evidence</th></tr></thead>
        <tbody>
          {tasks.map(({ t, v }) => {
            const b = plan.build[t.id] ?? { status: "waiting" as const };
            const waitingOn = b.status === "waiting" ? t.dependsOn.filter((d) => plan.build[d]?.status !== "done") : [];
            return (
              <tr key={t.id}>
                <td><a className="ref" href={planHref(specId, plan.work, v, t.id)}>{t.id}</a> {t.title}</td>
                <td>{verticalLabel(v)}</td>
                <td><span className={`build-status ${b.status}`}>{BUILD_LABEL[b.status]}</span>{stateText(b, waitingOn) && <span className="count"> {stateText(b, waitingOn)}</span>}</td>
                <td>{b.status === "done" ? <><code>{b.commit}</code> · {b.lines} lines</> : b.status === "waiting" ? "" : b.reason ?? ""}{reviewNotes(b).length > 0 && <div className="count">{reviewNotes(b).join(" · ")}</div>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {plan.branchReview && <BranchPanel r={plan.branchReview} />}
    </section>
  );
}
