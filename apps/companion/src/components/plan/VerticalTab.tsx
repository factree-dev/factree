// One vertical of a plan: its design or its tasks, each task with its scenarios and files (spec plan-view R12).

import { verticalLabel } from "../../words.ts";
import type { Plan, PlanTask, Spec } from "../../../shared/types.ts";
import { Inline } from "../bits.tsx";
import { Blocks } from "../Blocks.tsx";
import { planHref, refsOf } from "../../links.ts";
import { backing, planLocal } from "../../plan.ts";

// "**P2 Area:** …" → ref-P2, so a link to P2 lands on it (plan-view R5.S6).
const patternAnchor = (text: string) => { const m = /^\*\*([PN]\d+)\b/.exec(text); return m ? `ref-${m[1]}` : undefined; };

// A vertical's Design and Tasks as sub-tabs, each full width (plan-view R12).
export function VerticalTab({ plan, spec, specId, name, view }: { plan: Plan; spec: Spec | null; specId: string; name: string; view: "design" | "tasks" }) {
  const v = plan.verticals.find((x) => x.name === name)!;
  const refs = spec ? refsOf(spec) : new Set<string>();
  const unbackedComponents = spec ? v.components.filter((c) => !backing(c.serves, null, refs, spec.id).backed) : [];
  const steps = v.tasks ? `${v.tasks.reduce((n, t) => n + t.stepsDone, 0)}/${v.tasks.reduce((n, t) => n + t.stepsTotal, 0)} steps` : "";
  return (
    <div className="plan-vertical">
      <nav className="subtabs" aria-label={`${verticalLabel(name)} sections`}>
        <a className="subtab" href={planHref(specId, plan.work, name, undefined, "design")} aria-current={view === "design" ? "page" : undefined}>Design</a>
        <a className="subtab" href={planHref(specId, plan.work, name, undefined, "tasks")} aria-current={view === "tasks" ? "page" : undefined}>
          Tasks <span className="count">{v.tasks?.length ?? 0}{steps && ` · ${steps}`}</span>
        </a>
      </nav>
      {view === "tasks" ? (
      <section className="md" aria-label={`${verticalLabel(name)} tasks`}>
        {v.tasks === null && <p className="md-p">No tasks yet.</p>}
        {v.tasks?.map((t) => <TaskCard key={t.id} task={t} plan={plan} spec={spec} specId={specId} />)}
      </section>
      ) : (
      <section className="md plan-design" aria-label={`${verticalLabel(name)} design`}>
        {unbackedComponents.length > 0 && (
          <div className="notice problems" role="status">
            <strong>Not backed by the spec:</strong> {unbackedComponents.map((c) => {
              const unknown = backing(c.serves, null, refs, spec!.id).unknown;
              return `${c.path} (${unknown.length ? `${unknown.join(", ")} not in the spec` : "serves nothing in the spec"})`;
            }).join("; ")}
          </div>
        )}
        {v.design ? v.design.map((s) => (
          <div key={s.name} className="md-section">
            <h3 className="md-section-h">{s.name}</h3>
            <Blocks blocks={s.blocks} anchors={s.name === "Patterns" ? patternAnchor : undefined} />
          </div>
        )) : <p className="md-p">No design yet.</p>}
      </section>
      )}
    </div>
  );
}

function TaskCard({ task, plan, spec, specId }: { task: PlanTask; plan: Plan; spec: Spec | null; specId: string }) {
  const b = spec ? backing(task.proves, task.foundation, refsOf(spec), spec.id) : { backed: true, unknown: [] };
  const local = planLocal(plan);
  return (
    <article className="card task" id={`ref-${task.id}`}>
      <div className="req-head">
        <a className="req-id" href={planHref(specId, plan.work, task.vertical, task.id)}>{task.id}</a>
        <h3 className="req-name">{task.title}</h3>
        <span className="count" style={{ marginLeft: "auto" }}>{task.estDiff && `${task.estDiff} · `}{task.stepsDone}/{task.stepsTotal} steps</span>
      </div>
      <div className="task-fields">
        <span><b>Proves</b> {task.proves.length
          ? <Inline text={task.proves.join(", ")} />
          : task.foundation ? <span className="foundation">Foundation · {task.foundation}</span> : <span>nothing</span>}</span>
        {!b.backed && <span className="flag">Not backed by the spec{b.unknown.length ? `: ${b.unknown.join(", ")} not in the spec` : ""}</span>}
        <span><b>Depends on</b> {task.dependsOn.length
          ? task.dependsOn.map((d, i) => <span key={d}>{i > 0 && ", "}{local.has(d) ? <a className="ref" href={local.get(d)}>{d}</a> : d}</span>)
          : "none"}</span>
      </div>
      {task.body.map((s) => (
        <details key={s.name} className="task-part" open={s.name !== "Interfaces"}>
          <summary>{s.name}</summary>
          <Blocks blocks={s.blocks} />
        </details>
      ))}
    </article>
  );
}
