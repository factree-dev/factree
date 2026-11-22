// The plan page's overview and plan picker: context, coverage, verticals and what lies outside the plan (spec plan-view).

import { PLAN_LABEL, verticalLabel } from "../../words.ts";
import type { Plan, Spec } from "../../../shared/types.ts";
import { Inline } from "../bits.tsx";
import { Blocks } from "../Blocks.tsx";
import { planHref, refHref } from "../../links.ts";
import { coverage, notBacked, outsideScope, unproved } from "../../plan.ts";

export function PlanPicker({ plans, current, specId }: { plans: Plan[]; current: string; specId: string }) {
  return (
    <div className="chips" aria-label="Plans for this spec">
      {plans.map((p) => (
        <a key={p.work} className={`chip plan-chip${p.work === current ? " current" : ""}`} href={planHref(specId, p.work)} aria-current={p.work === current ? "page" : undefined}>
          <span className="mono">{p.work}</span> · {p.scope.join(", ") || "no scope"} · {PLAN_LABEL[p.status]}
        </a>
      ))}
    </div>
  );
}

export function Overview({ plan, spec, specId }: { plan: Plan; spec: Spec | null; specId: string }) {
  const section = (name: string) => plan.overview.find((s) => s.name === name);
  const rows = spec ? coverage(plan, spec) : [];
  const missing = spec ? unproved(plan, spec) : [];
  const outside = spec ? outsideScope(plan, spec) : [];
  const unbacked = spec ? notBacked(plan, spec) : [];
  const context = section("Context");
  const order = section("Order");
  return (
    <div className="columns">
      <section className="col-main" aria-label="Plan overview">
        {context && <div className="md"><Blocks blocks={context.blocks} /></div>}
        <div className="section-head"><h2 className="section">Coverage</h2><span className="count">{rows.length - missing.length}/{rows.length} in-scope scenarios covered</span></div>
        {rows.length > 0 ? (
          <div className="md-table-wrap">
            <table className="md-table">
              <thead><tr><th>Scenario</th><th>Task</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ref}>
                    <td><a className="ref" href={refHref(specId, r.ref)}>{r.ref}</a> {r.name}</td>
                    <td>{r.tasks.length
                      ? r.tasks.map((t, i) => <span key={t.id}>{i > 0 && ", "}<a className="ref" href={planHref(specId, plan.work, t.vertical, t.id)}>{t.id}</a> <span className="count">({verticalLabel(t.vertical)})</span></span>)
                      : <span className="flag">Not proved by any task</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="md-p">{spec ? "No in-scope scenarios." : "Spec file missing."}</p>}
        {order && <><div className="section-head"><h2 className="section">Order</h2></div><div className="md"><Blocks blocks={order.blocks} /></div></>}
      </section>
      <aside className="col-side" aria-label="Verticals and gaps">
        <section className="panel">
          <h2>Verticals</h2>
          <ul className="list">
            {plan.verticals.map((v) => (
              <li key={v.name}>
                <a href={planHref(specId, plan.work, v.name)}>{verticalLabel(v.name)}</a>{" "}
                <span className="count">{v.tasks ? `${v.tasks.length} task${v.tasks.length === 1 ? "" : "s"}` : "no tasks"}{v.design ? "" : " · no design"}</span>
              </li>
            ))}
          </ul>
        </section>
        {missing.length > 0 && (
          <section className="panel attention">
            <h2>Not proved by any task <span>{missing.length}</span></h2>
            <ul className="list">{missing.map((m) => <li key={m.ref}><a className="ref" href={refHref(specId, m.ref)}>{m.ref}</a> {m.name}</li>)}</ul>
          </section>
        )}
        {unbacked.length > 0 && (
          <section className="panel attention">
            <h2>Not backed by the spec <span>{unbacked.length}</span></h2>
            <ul className="list">
              {unbacked.map((u) => (
                <li key={`${u.kind}-${u.id}`}>
                  {u.kind === "task" ? <a className="ref" href={planHref(specId, plan.work, u.vertical, u.id)}>{u.id}</a> : <Inline text={`\`${u.id}\``} />}
                  {" "}<span className="count">{verticalLabel(u.vertical)} · {u.unknown.length ? `${u.unknown.join(", ")} not in spec` : "cites nothing"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {outside.length > 0 && (
          <section className="panel">
            <h2>Outside this plan <span>{outside.length}</span></h2>
            <ul className="list">{outside.map((r) => <li key={r.id}><a className="ref" href={refHref(specId, r.id)}>{r.id}</a> {r.name}</li>)}</ul>
          </section>
        )}
        {section("Spec updates") && (
          <section className="panel">
            <h2>Spec updates</h2>
            <Blocks blocks={section("Spec updates")!.blocks} />
          </section>
        )}
      </aside>
    </div>
  );
}
