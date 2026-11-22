import type { ReviewComment, SpecDetail } from "../../shared/types.ts";
import { VERIFY_ON } from "../features.ts";
import { CopyCommand } from "./bits.tsx";
import { refHref } from "../links.ts";
import { reviewLabel } from "../words.ts";

// The Review stage's own view (review R8): the newest plan's pull request, its state, and each review comment
// with how Claude handled it. The companion never talks to GitHub; all of this comes from the event log.
export function ReviewView({ detail }: { detail: SpecDetail }) {
  const { summary } = detail;
  const p = summary.plan;
  const r = p?.review ?? null;
  const multi = Boolean(r?.prs?.some((x) => x.repo));
  return (
    <div className="content">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="crumbs">Specs / <a href={refHref(summary.id)} className="mono">{summary.id}</a> / Review</div>
        <h1 className="title">Review: {summary.title}</h1>
        {r && !multi && (
          <div className="meta">
            <a href={r.url} target="_blank" rel="noreferrer">Pull request {r.url.replace(/^.*\/pull\//, "#")}</a>
            <span aria-hidden="true">·</span><span className={`review-state ${r.state.toLowerCase()}`}>{reviewLabel(r.state)}</span>
            {p && <><span aria-hidden="true">·</span><span className="mono">factree/{p.work}</span></>}
          </div>
        )}
      </div>
      {!r ? (
        <div className="notice">No pull request yet. {VERIFY_ON ? "It opens after a clean verify, or in Claude Code:" : "Open it in Claude Code:"} {p ? <CopyCommand command={`/factree:review ${p.work}`} /> : "plan and build it first"}</div>
      ) : multi && r.prs ? (
        <div className="review-repos">
          {r.prs.map((x) => (
            <section key={`${x.repo}#${x.number}`} aria-label={x.repo}>
              <h2 className="mono">{x.repo || "repo"}</h2>
              <div className="meta">
                <a href={x.url} target="_blank" rel="noreferrer">#{x.number}</a>
                {x.tasks.length > 0 && <><span aria-hidden="true">·</span><span className="mono">{x.tasks.join(", ")}</span></>}
                {x.after.length > 0 && <><span aria-hidden="true">·</span><span>after <span className="mono">{x.after.join(", ")}</span></span></>}
                {x.base && <><span aria-hidden="true">·</span><span>base <span className="mono">{x.base}</span></span></>}
                <span aria-hidden="true">·</span><span className={`review-state ${x.state.toLowerCase()}`}>{reviewLabel(x.state)}</span>
              </div>
              <Comments comments={x.comments} />
            </section>
          ))}
        </div>
      ) : (
        <Comments comments={r.comments} />
      )}
    </div>
  );
}

function Comments({ comments }: { comments: ReviewComment[] }) {
  if (comments.length === 0) return <div className="notice">No review comments yet.</div>;
  return (
    <ol className="list review-comments" aria-label="Review comments">
      {comments.map((c, i) => (
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
  );
}
