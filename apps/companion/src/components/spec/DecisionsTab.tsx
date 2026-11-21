// The spec page's Decisions tab: what waits on the user, the spec's decisions and Claude's calls (spec decisions-view).

import { useState } from "react";
import type { Spec, SpecDetail, DecisionCard } from "../../../shared/types.ts";
import { Inbox, type DecisionBody } from "../Inbox.tsx";
import { Inline } from "../bits.tsx";
import { decisionGroups, type DecisionItem } from "../../decisions.ts";
import { clock } from "../../api.ts";

export type Decide = (b: DecisionBody) => Promise<string | null>;
// The Decisions tab (decisions-view): waiting on you, the spec's decisions, approvals, Claude's calls.
function CopyButton({ text, label, title }: { text: string; label: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn small" title={title}
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}>
      {copied ? "Copied" : label}
    </button>
  );
}

export function DecisionsTab({ detail, cards, onDecide }: { detail: SpecDetail; cards?: DecisionCard[]; onDecide?: Decide }) {
  const g = decisionGroups(detail);
  // Every row: label | text, with who and when under it | one action, in the same columns across all groups.
  const item = (d: DecisionItem) => (
    <li key={`${d.id}-${d.text}`} className="decision">
      <span className="id" title={d.id}>{d.id}</span>
      <div className="dbody">
        <span><Inline text={d.text} /></span>
        {d.recommendation && <span className="proposal">Recommended: <Inline text={d.recommendation} /></span>}
        <span className="who">{[d.decider, d.when && clock(d.when)].filter(Boolean).join(" · ")}</span>
      </div>
      {d.override && <CopyButton text={d.override} label="Copy override" title="Copy a message that changes this call, to paste in Claude Code" />}
    </li>
  );
  return (
    <>
      {cards && onDecide ? cards.length > 0 && (
        <section className="panel attention" aria-label="Waiting on you">
          <h3 className="dgroup">Waiting on you</h3>
          <Inbox cards={cards} onDecide={onDecide} />
        </section>
      ) : g.waiting.length > 0 && (
        <section className="panel attention" aria-label="Waiting on you">
          <h3 className="dgroup">Waiting on you <span>answer in Claude Code</span></h3>
          <ol className="list">{g.waiting.map(item)}</ol>
        </section>
      )}
      {detail.spec && (
        <section className="panel" aria-label="Decisions">
          <h3 className="dgroup">Decisions</h3>
          <Decisions spec={detail.spec} />
        </section>
      )}
      {g.approvals.length > 0 && (
        <section className="panel" aria-label="Approvals">
          <h3 className="dgroup">Approvals</h3>
          <ol className="list">{g.approvals.map(item)}</ol>
        </section>
      )}
      {g.calls.length > 0 && (
        <section className="panel" aria-label="Claude's calls">
          <h3 className="dgroup">Claude's calls <span>made without asking; copy an override to change one</span></h3>
          <ol className="list">{g.calls.map(item)}</ol>
        </section>
      )}
    </>
  );
}

export function Decisions({ spec }: { spec: Spec }) {
  if (spec.decisions.length === 0) return <span className="count">None</span>;
  const newestFirst = [...spec.decisions].reverse();
  return (
    <>
      <ol className="list">
        {newestFirst.map((d) => (
          <li key={d.id} id={`ref-${d.id}`} className={`decision${d.superseded ? " superseded" : ""}`}>
            <span className="id">{d.id}</span>
            <div className="dbody">
              <span><Inline text={d.text} /></span>
              {(d.who || d.date) && <span className="who">{[d.who, d.date && clock(d.date)].filter(Boolean).join(" · ")}</span>}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
