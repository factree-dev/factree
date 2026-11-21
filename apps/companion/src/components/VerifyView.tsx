import type { SpecDetail } from "../../shared/types.ts";
import { CopyCommand } from "./bits.tsx";
import { clock } from "../api.ts";
import { refHref } from "../links.ts";

// The Verify stage's own view (verify R4): every scenario with its status and the evidence behind it,
// each linking back to the scenario in the spec. The spec page keeps only the spec's sections.
export function VerifyView({ detail }: { detail: SpecDetail }) {
  const { summary, spec, verify: v } = detail;
  return (
    <div className="content">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="crumbs">Specs / <a href={refHref(summary.id)} className="mono">{summary.id}</a> / Verify</div>
        <h1 className="title">Verify: {summary.title}</h1>
        {v && <div className="meta"><span>{v.proved} proved · {v.failing} failing · {v.unverified} unverified</span><span aria-hidden="true">·</span><span>{clock(v.at)}</span></div>}
      </div>
      {!v || !spec ? (
        <div className="notice">Not verified yet. In Claude Code: <CopyCommand command={`/factree:verify ${summary.id}`} /></div>
      ) : (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead><tr><th>Scenario</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>
              {spec.requirements.flatMap((r) => r.scenarios.map((s) => {
                const id = `${r.id}.${s.id}`;
                const res = v.results[id] ?? { status: "unverified" as const, evidence: "not in the last run" };
                return (
                  <tr key={id}>
                    <td><a className="ref" href={refHref(summary.id, id)}>{id}</a> {s.name}</td>
                    <td><span className={`verify-status ${res.status}`}>{res.status}</span></td>
                    <td>{res.evidence}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
