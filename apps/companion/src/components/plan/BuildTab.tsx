// The plan's Build tab: each task's status as it builds (spec build R8).

import { verticalLabel } from "../../words.ts";
import type { Plan } from "../../../shared/types.ts";
import { CopyCommand } from "../bits.tsx";
import { planHref } from "../../links.ts";

// The Build tab (build R8): every task in build order with its status, and the commit and lines once done.
const BUILD_LABEL = { waiting: "Waiting", running: "Running", done: "Done", failed: "Failed", blocked: "Blocked" } as const;
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
                <td><span className={`build-status ${b.status}`}>{BUILD_LABEL[b.status]}</span>{waitingOn.length > 0 && <span className="count"> on {waitingOn.join(", ")}</span>}</td>
                <td>{b.status === "done" ? <><code>{b.commit}</code> · {b.lines} lines</> : b.reason ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
