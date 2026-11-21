import { useContext, useEffect, useMemo } from "react";
import { FlowView } from "./FlowView.tsx";
import type { SpecDetail, DecisionCard } from "../../shared/types.ts";
import { Inline, SourceLink, LinkContext, StatusBadge, SessionChip } from "./bits.tsx";
import { refsOf } from "../links.ts";
import { tasksByRequirement } from "../plan.ts";
import { resolveSpecTab, specTabHref, specTabs } from "../tabs.ts";
import { cap } from "../../shared/names.ts";
import { DecisionsTab, type Decide } from "./spec/DecisionsTab.tsx";
import { RequirementCard } from "./spec/Requirements.tsx";
import { Questions } from "./spec/Questions.tsx";
import { activityShown, Activity } from "./spec/Activity.tsx";

export function SpecView({ detail, user, focus, tab = null, cards, onDecide }: { detail: SpecDetail; user: string; focus: { ref: string | null; n: number } | null; tab?: string | null; cards?: DecisionCard[]; onDecide?: Decide }) {
  const { summary, spec } = detail;
  const parent = useContext(LinkContext);
  const links = useMemo(() => ({ ...parent, specId: summary.id, refs: spec ? refsOf(spec) : new Set<string>() }), [parent, summary.id, spec]);
  const target = focus?.ref ?? null;
  const byReq = useMemo(() => tasksByRequirement(detail.plans), [detail.plans]);
  const severalPlans = detail.plans.length > 1;
  const current = resolveSpecTab(tab, target);
  const tabs = spec ? specTabs(spec, activityShown(detail.activity).length + detail.sessions.length, user, cards ? cards.length : detail.summary.live.pending.length) : [];

  // Jump to the linked item once it's on screen; scenarios open first (RequirementCard), so wait a frame.
  useEffect(() => {
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(`ref-${target}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("flash");
      void el.offsetWidth;   // restart the highlight animation
      el.classList.add("flash");
    });
    return () => cancelAnimationFrame(frame);
  }, [target, focus?.n, Boolean(spec), current]);

  return (
    <LinkContext.Provider value={links}>
    <div className="content">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="crumbs">Specs / <span className="mono">{summary.id}</span></div>
        <h1 className="title">{summary.title}</h1>
        {spec?.purpose && <p className="purpose"><Inline text={spec.purpose} /></p>}
        <div className="meta">
          <StatusBadge status={summary.status} />
          {spec?.owner && <><span>Owner {cap(spec.owner)}</span><span aria-hidden="true">·</span></>}
          {spec?.approvedBy && <><span>Approved by {spec.approvedBy}{spec.approvedAt ? `, ${spec.approvedAt}` : ""}</span><span aria-hidden="true">·</span></>}
          {spec && spec.sources.length > 0 && (
            <span>Sources {spec.sources.map((s, i) => <span key={s}>{i > 0 && ", "}<SourceLink source={s} /></span>)}</span>
          )}
          {detail.sessions[0] && <><span aria-hidden="true">·</span><SessionChip id={detail.sessions[0].id} state={detail.sessions[0].state} /></>}
        </div>
      </div>

      {!spec && (
        <div className="notice">
          No file yet.
        </div>
      )}
      {spec && spec.problems.length > 0 && (
        <div className="notice problems" role="status">
          <strong>Couldn't read:</strong> {spec.problems.join("; ")}
        </div>
      )}

      {/* Before the file exists, decisions asked while writing it still need a place (companion-decide R1). */}
      {!spec && cards && cards.length > 0 && (
        <div className="tabbed">
          <nav className="tabs" aria-label="Spec sections">
            <a className="tab attention" href={specTabHref(summary.id, "decisions")} aria-current="page">
              Decisions<span className="count">{cards.length}</span>
            </a>
          </nav>
          <div className="tab-body"><DecisionsTab detail={detail} cards={cards} onDecide={onDecide} /></div>
        </div>
      )}

      {spec && (
        <div className="tabbed">
          <nav className="tabs" aria-label="Spec sections">
            {tabs.map((tb) => (
              <a key={tb.id} className={`tab${tb.attention ? " attention" : ""}`} href={specTabHref(summary.id, tb.id)} aria-current={current === tb.id ? "page" : undefined}>
                {tb.label}{tb.count !== null && <span className="count">{tb.count}</span>}
              </a>
            ))}
          </nav>
          <div className="tab-body">
            {current === "requirements" && (
              <section className="col-main" aria-label="Requirements">
                <span className="count">{summary.scenarios} scenarios</span>
                {spec.requirements.length === 0 && <p className="purpose">None</p>}
                {spec.requirements.map((r) => <RequirementCard key={r.id} r={r} target={target} n={focus?.n ?? 0} tasks={byReq.get(r.id) ?? []} severalPlans={severalPlans} />)}
              </section>
            )}
            {current === "scope" && (
              <section className="panel">
                <dl className="scope">
                  <dt>Covers</dt><dd>{spec.scope.in ? <Inline text={spec.scope.in} /> : "Not stated"}</dd>
                  <dt>Doesn't cover</dt><dd>{spec.scope.out ? <Inline text={spec.scope.out} /> : "Not stated"}</dd>
                  {spec.scope.anti && <><dt>Must not</dt><dd><Inline text={spec.scope.anti} /></dd></>}
                </dl>
              </section>
            )}
            {current === "questions" && <Questions spec={spec} user={user} />}
            {current === "decisions" && <DecisionsTab detail={detail} cards={cards} onDecide={onDecide} />}
            {current === "observations" && (
              <section className="panel">
                <span className="count">What the code does today</span>
                <ul className="list obs">
                  {spec.observations.map((o) => <li key={o.id} id={`ref-${o.id}`}><span className="id">{o.id}</span><Inline text={o.text} /></li>)}
                </ul>
              </section>
            )}
            {current === "flow" && spec.flow && <section className="panel"><FlowView spec={spec} verify={detail.verify} /></section>}
            {current === "sketch" && spec.sketch && <section className="panel"><pre className="sketch" aria-label="Sketch">{spec.sketch}</pre></section>}
            {current === "code" && (
              <section className="panel">
                <ul className="list">{spec.code.map((c, i) => <li key={i}><Inline text={c} /></li>)}</ul>
              </section>
            )}
            {current === "activity" && <Activity events={detail.activity} sessions={detail.sessions} />}
          </div>
        </div>
      )}
    </div>
    </LinkContext.Provider>
  );
}
