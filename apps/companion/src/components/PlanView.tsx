/** The plan page (spec plan-view): header, then the overview or one vertical's design and tasks. */

import { useContext, useEffect, useMemo } from "react";
import { PLAN_LABEL, verticalLabel } from "../words.ts";
import type { SpecDetail } from "../../shared/types.ts";
import { CopyCommand, Inline, LinkContext, SessionChip } from "./bits.tsx";
import { planHref, refHref, refsOf, type LinkEnv } from "../links.ts";
import { planLocal, planResolver, planView } from "../plan.ts";
import { PlanPicker, Overview } from "./plan/Overview.tsx";
import { VerticalTab } from "./plan/VerticalTab.tsx";
import { BuildTab } from "./plan/BuildTab.tsx";

export function PlanView({ detail, work, tab, view = null, focus }: { detail: SpecDetail; work: string | null; tab: string | null; view?: string | null; focus: { ref: string | null; n: number } | null }) {
  const { summary, spec, plans } = detail;
  const found = plans.find((p) => p.work === work);
  const plan = found ?? (work ? null : plans[0] ?? null);
  const missing = Boolean(work && !found);
  const current = plan && tab && (tab === "build" || plan.verticals.some((v) => v.name === tab)) ? tab : "overview";
  const parent = useContext(LinkContext);
  const links = useMemo<LinkEnv>(() => plan ? {
    ...parent,
    specId: plan.spec || summary.id,
    refs: spec ? refsOf(spec) : new Set<string>(),
    local: planLocal(plan),
    resolve: planResolver(plan, current === "overview" ? "" : current),
  } : parent, [parent, plan, spec, summary.id, current]);
  const target = focus?.ref ?? null;
  const sub = planView(view, target);

  // Jump to the linked task or pattern once its tab is on screen (plan-view R5.S2, S6).
  useEffect(() => {
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(`ref-${target}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    });
    return () => cancelAnimationFrame(frame);
  }, [target, focus?.n, current, plan?.work, sub]);

  if (missing) {
    return (
      <div className="content">
        <div className="notice"><strong>Plan {work} wasn't found.</strong> <a href={refHref(summary.id)}>Back to {summary.id}</a></div>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="content">
        <div className="crumbs">Specs / <a href={refHref(summary.id)} className="mono">{summary.id}</a> / Plan</div>
        <h1 className="title">No plan yet</h1>
        {spec?.status === "approved"
          ? <div className="notice">Plan it: <CopyCommand command={`/factree:plan ${summary.id}`} /></div>
          : spec?.status === "live"
            ? <div className="notice">No plan recorded.</div>
            : <div className="notice">Approve the spec first.</div>}
      </div>
    );
  }

  return (
    <LinkContext.Provider value={links}>
      <div className="content">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="crumbs">Specs / <a href={refHref(summary.id)} className="mono">{summary.id}</a> / Plan <span className="mono">{plan.work}</span></div>
          <h1 className="title">Plan: {summary.title}</h1>
          <div className="meta">
            <span className={`status-badge ${plan.status === "approved" ? "approved" : "draft"}`}>{PLAN_LABEL[plan.status]}</span>
            {plan.approvedBy && <><span>Approved by {plan.approvedBy}{plan.approvedAt ? `, ${plan.approvedAt}` : ""}</span><span aria-hidden="true">·</span></>}
            {!plan.approvedBy && plan.designApprovedBy && <><span>Design approved by {plan.designApprovedBy}{plan.designApprovedAt ? `, ${plan.designApprovedAt}` : ""}</span><span aria-hidden="true">·</span></>}
            <span>Scope <Inline text={plan.scope.join(", ") || "not set"} /></span>
            {plan.sessions[0] && <><span aria-hidden="true">·</span><SessionChip id={plan.sessions[0].id} state={plan.sessions[0].state} /></>}
          </div>
          {plans.length > 1 && <PlanPicker plans={plans} current={plan.work} specId={summary.id} />}
        </div>

        {plan.stale && (
          <div className="notice problems" role="status">
            <strong>Spec changed since this plan.</strong> Re-plan: <CopyCommand command={`/factree:plan ${summary.id}`} />
          </div>
        )}
        {plan.problems.length > 0 && (
          <div className="notice problems" role="status">
            <strong>Couldn't read:</strong> {plan.problems.join("; ")}
          </div>
        )}

        <div className="tabbed">
        <nav className="tabs" aria-label="Plan sections">
          <a className="tab" href={planHref(summary.id, plan.work, "overview")} aria-current={current === "overview" ? "page" : undefined}>Overview</a>
          {plan.verticals.map((v) => (
            <a key={v.name} className="tab" href={planHref(summary.id, plan.work, v.name)} aria-current={current === v.name ? "page" : undefined}>
              {verticalLabel(v.name)} <span className="count">{v.tasks?.length ?? 0}</span>
            </a>
          ))}
          <a className="tab" href={planHref(summary.id, plan.work, "build")} aria-current={current === "build" ? "page" : undefined}>
            Build <span className="count">{Object.values(plan.build).filter((b) => b.status === "done").length}/{Object.keys(plan.build).length}</span>
          </a>
        </nav>

        <div className="tab-body">
          {current === "overview"
            ? <Overview plan={plan} spec={spec} specId={summary.id} />
            : current === "build"
            ? <BuildTab plan={plan} specId={summary.id} />
            : <VerticalTab plan={plan} spec={spec} specId={summary.id} name={current} view={sub} />}
        </div>
        </div>
      </div>
    </LinkContext.Provider>
  );
}
