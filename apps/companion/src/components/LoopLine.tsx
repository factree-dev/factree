// The loop line at the top of every spec page, and its 36px version in the spec list (spec spec-ring R1, R2, R5).

import type { SpecSummary, Spec } from "../../shared/types.ts";
import { STALE } from "../words.ts";
import { progressOf } from "../progress.ts";
import { specTabHref } from "../tabs.ts";
import { ActivityLine } from "./bits.tsx";

/** The loop line (spec-ring R1, R2, R4, D13): the five stages as stations on one track across the top, the track into each
 *  filled by its progress, each a link to its stage once it can open; the round, percentage and what's happening beside it. */
export function LoopLine({ summary, spec, view, waiting = 0 }: { summary: SpecSummary; spec: Spec | null; view: string; waiting?: number }) {
  const r = progressOf(summary, spec, waiting);
  return (
    <section className="loop-line" aria-label={`${summary.id}: ${r.pct}% · ${r.centre}`}>
      <div className="loop-bar">
        {r.stages.map((st) => {
          const inner = (
            <>
              <span className="loop-stop">
                <span className="loop-track"><span className={`loop-seg ${st.state}`} style={{ width: `${Math.round(st.fill * 100)}%` }} /></span>
                <span className={`loop-node ${st.state}`} />
              </span>
              <span className={`loop-label ${st.state}`}>{st.name}{view === st.key && <span className="loop-open" aria-hidden="true" />}</span>
            </>
          );
          const title = `${st.name} · ${st.state === "stale" ? STALE : st.sub}`;
          return st.href
            ? <a key={st.key} className={`loop-link ${st.state}`} data-stage={st.key} href={st.href} title={title} aria-current={view === st.key ? "step" : undefined}>{inner}</a>
            : <div key={st.key} className={`loop-link ${st.state}`} data-stage={st.key} aria-disabled="true" title={title}>{inner}</div>;
        })}
      </div>
      <div className="loop-summary">
        <span className="loop-pct">{r.pct}<small>%</small></span>
        <span className={`loop-now${waiting > 0 ? " waiting" : ""}`}>{r.live ? <ActivityLine a={r.live} /> : r.centre}</span>
        {r.round > 1 && <span className="loop-now loop-round">{`Round ${r.round}`}</span>}
        {waiting > 0 && <a className="btn primary small" href={specTabHref(summary.id, "decisions")}>Decide</a>}
      </div>
    </section>
  );
}

/** A 36px line for a spec's row in the list, from the same numbers as the one at the top (spec-ring R5, D9). */
export function MiniLine({ summary, waiting = 0 }: { summary: SpecSummary; waiting?: number }) {
  const r = progressOf(summary, null, waiting);
  return (
    <span className="mini-line" aria-hidden="true">
      {r.stages.map((st) => <span key={st.key} className="mini-track"><span className={`mini-seg ${st.state}`} style={{ width: `${Math.round(st.fill * 100)}%` }} /></span>)}
    </span>
  );
}
