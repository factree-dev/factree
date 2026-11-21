// A requirement on the spec page: its statement, source, tasks and scenarios (spec spec-view).

import { useContext, useEffect, useState } from "react";
import type { Requirement } from "../../../shared/types.ts";
import { Inline, LinkContext } from "../bits.tsx";
import { planHref, refHref } from "../../links.ts";

export function RequirementCard({ r, target, n, tasks, severalPlans }: { r: Requirement; target: string | null; n: number; tasks: { work: string; task: string; vertical: string }[]; severalPlans: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { specId } = useContext(LinkContext);
  // A link to one of this card's scenarios opens it.
  useEffect(() => {
    const sid = target?.startsWith(`${r.id}.`) ? target.slice(r.id.length + 1) : null;
    if (sid) setOpen((o) => (o[sid] ? o : { ...o, [sid]: true }));
  }, [target, n, r.id]);
  return (
    <article className="card" id={`ref-${r.id}`}>
      <div className="req-head">
        <a className="req-id" href={refHref(specId, r.id)}>{r.id}</a>
        <h3 className="req-name">{r.name}</h3>
        {r.blockedBy.length > 0 && <span className="blocked">Blocked by <Inline text={r.blockedBy.join(", ")} /></span>}
        <span className="count" style={{ marginLeft: "auto" }}>{r.scenarios.length} scenario{r.scenarios.length === 1 ? "" : "s"}</span>
      </div>
      <p className="req-statement"><Inline text={r.statement} /></p>
      {r.source && <span className="req-source">Source: <Inline text={r.source} /></span>}
      {tasks.length > 0 && (
        <span className="req-tasks">Tasks: {tasks.map((t, i) => (
          <span key={`${t.work}-${t.task}`}>{i > 0 && " · "}<a className="ref" href={planHref(specId, t.work, t.vertical, t.task)}>{severalPlans ? `${t.work} ` : ""}{t.task}</a> <span className="count">({t.vertical === "general" ? "General" : t.vertical})</span></span>
        ))}</span>
      )}
      <div className="scenarios">
        {r.scenarios.map((s) => {
          const key = s.id;
          const isOpen = Boolean(open[key]);
          return (
            <div className="scenario" key={key} id={`ref-${r.id}.${s.id}`}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [key]: !isOpen })}>
                <span className="s-id">{s.id}</span>
                <span className="s-name">{s.name}</span>
                <span className="caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div className="s-steps">
                  {s.steps.map((st, i) => <span key={i}><b>{st.kind}</b><Inline text={st.text} /></span>)}
                  {s.steps.length === 0 && <span>No steps.</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
