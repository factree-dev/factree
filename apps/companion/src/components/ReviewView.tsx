import type { SpecDetail } from "../../shared/types.ts";
import { CopyCommand } from "./bits.tsx";
import { refHref } from "../links.ts";
import { reviewLabel } from "../words.ts";

// The Review stage's own view (review R8): the newest plan's pull request, its state, and each review comment
// with how Claude handled it. The companion never talks to GitHub; all of this comes from the event log.
export function ReviewView({ detail }: { detail: SpecDetail }) {
  const { summary } = detail;
  const p = summary.plan;
  const r = p?.review ?? null;
  return (
    <div className="content">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="crumbs">Specs / <a href={refHref(summary.id)} className="mono">{summary.id}</a> / Review</div>
        <h1 className="title">Review: {summary.title}</h1>
        {r && (
          <div className="meta">
            <a href={r.url} target="_blank" rel="noreferrer">Pull request {r.url.replace(/^.*\/pull\//, "#")}</a>
            <span aria-hidden="true">·</span><span className={`review-state ${r.state.toLowerCase()}`}>{reviewLabel(r.state)}</span>
            {p && <><span aria-hidden="true">·</span><span className="mono">factree/{p.work}</span></>}
          </div>
        )}
      </div>
      {!r ? (
        <div className="notice">No pull request yet. It opens after a clean verify, or in Claude Code: {p ? <CopyCommand command={`/factree:review ${p.work}`} /> : "plan and build it first"}</div>
      ) : r.comments.length === 0 ? (
        <div className="notice">No review comments yet.</div>
      ) : (
        <ol className="list review-comments" aria-label="Review comments">
          {r.comments.map((c, i) => (
            <li key={i} className="decision">
              <span className="id">{c.author}</span>
              <div className="dbody">
                {c.path && <span className="mono">{c.path}{c.line ? `:${c.line}` : ""}</span>}
                <span>{c.body}</span>
                <span className="who">{c.handled ?? "Not handled yet"}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
