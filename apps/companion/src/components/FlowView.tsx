import { useState } from "react";
import type { Spec, VerifyResult, ScenarioStatus } from "../../shared/types.ts";
import { VERIFY_ON } from "../features.ts";
import { layoutFlow, type FlowArrow } from "../flow.ts";

// The Flow tab (spec spec-flow R2–R4): the spec's flow laid out for reading, each arrow coloured by the scenarios that
// prove it, the steps no scenario covers listed, and any scenario played along its path.

type Coverage = "ok" | "bad" | "none" | "gap" | "neutral";
const RANK: Record<ScenarioStatus, number> = { failing: 2, unverified: 1, proved: 0 };

/** The worst status among an arrow's scenarios, or a gap when it cites none (R3). */
function coverage(a: FlowArrow, verify: VerifyResult | null): Coverage {
  if (!a.cites.length) return "gap";
  if (!VERIFY_ON) return "neutral";   // verify paused: no proved or failing colours (verify-paused R4.S3)
  const worst = Math.max(...a.cites.map((id) => RANK[verify?.results[id]?.status ?? "unverified"]));
  return worst === 2 ? "bad" : worst === 1 ? "none" : "ok";
}

/** A scenario's GIVEN, WHEN and THEN, with each AND folded into the step before it. */
function steps(spec: Spec, id: string) {
  const [rid, sid] = id.split(".");
  const s = spec.requirements.find((r) => r.id === rid)?.scenarios.find((x) => x.id === sid);
  const out: Record<"GIVEN" | "WHEN" | "THEN", string[]> = { GIVEN: [], WHEN: [], THEN: [] };
  let last: keyof typeof out = "GIVEN";
  for (const st of s?.steps ?? []) { if (st.kind !== "AND") last = st.kind; out[last].push(st.text); }
  return { name: s?.name ?? "", ...out };
}

const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");

export function FlowView({ spec, verify, playing: playing0 = null, step: step0 = 0 }: { spec: Spec; verify: VerifyResult | null; playing?: string | null; step?: number }) {
  const [playing, setPlaying] = useState<string | null>(playing0);
  const [step, setStep] = useState(step0);
  const lines = spec.flow ?? [];
  const l = layoutFlow(lines);
  const cited = [...new Set(lines.flatMap((x) => x.cites))];
  const gaps = l.arrows.filter((a) => !a.cites.length);

  // A scenario's path: the arrows citing it, in flow order; the states it passes through, start to end (R4).
  const route = playing ? l.arrows.filter((a) => a.cites.includes(playing)) : [];
  const states = route.length ? [route[0]!.from, ...route.map((a) => a.to)] : [];
  const at = Math.min(step, Math.max(states.length - 1, 0));
  const lit = new Set(states.slice(0, at + 1)), litArrows = new Set(route.slice(0, at));
  const sc = playing ? steps(spec, playing) : null;
  const pick = (id: string) => { setPlaying(id); setStep(0); };

  return (
    <div className="flow-view">
      <div className="flow-canvas">
        <svg width={l.width} height={l.height} role="img" aria-label="Flow">
          <defs>
            <marker id="arrowhead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker>
          </defs>
          {l.arrows.map((a, i) => (
            <path key={i} className={`edge ${coverage(a, verify)}${litArrows.has(a) ? " lit" : ""}`} d={path(a.points)} markerEnd="url(#arrowhead)"><title>{`${a.action}${a.cites.length ? ` · ${a.cites.join(", ")}` : " · no scenario"}`}</title></path>
          ))}
          {l.cards.map((c) => (
            <g key={c.name} className={`fcard${playing && states.length ? (c.name === states[at] ? " now" : lit.has(c.name) ? " lit" : " dim") : ""}`}>
              <rect x={c.x} y={c.y} width={c.w} height={c.h} rx="10" />
              <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 5} textAnchor="middle">{c.name}</text>
            </g>
          ))}
          {l.arrows.map((a, i) => a.action && (
            <g key={i} className={`flabel ${coverage(a, verify)}`}>
              <rect x={a.labelBox.x} y={a.labelBox.y} width={a.labelBox.w} height={a.labelBox.h} rx="4" />
              <text x={a.label[0]} y={a.label[1] + 4} textAnchor="middle">{a.action}</text>
            </g>
          ))}
        </svg>
      </div>

      <div className="flow-side">
        <section>
          <h3 className="dgroup">Scenarios</h3>
          <ul className="flow-scns">
            {cited.map((id) => {
              const st = VERIFY_ON ? verify?.results[id]?.status ?? "unverified" : "";
              return <li key={id}><button type="button" className={`flow-scn${playing === id ? " sel" : ""}`} onClick={() => pick(id)}><i className={`fdot ${st}`} /><span className="mono">{id}</span><span>{steps(spec, id).name}</span></button></li>;
            })}
          </ul>
        </section>
        {gaps.length > 0 && (
          <section>
            <h3 className="dgroup">Not covered</h3>
            <ul className="flow-gaps">{gaps.map((g, i) => <li key={i}>{`${g.from} → ${g.to}${g.action ? `: ${g.action}` : ""}`}</li>)}</ul>
          </section>
        )}
      </div>

      {sc && (
        <div className="flow-strip">
          {(["GIVEN", "WHEN", "THEN"] as const).map((k, i) => (
            <div key={k} className={`fstep${i <= at ? " on" : ""}`}><b>{k}</b><span>{sc[k].join("; ")}</span></div>
          ))}
          <div className="fcontrols">
            <button type="button" className="btn primary" onClick={() => setStep(at >= states.length - 1 ? 0 : at + 1)}>{at >= states.length - 1 ? "Replay" : "Next"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
