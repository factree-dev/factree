// The spec page's open questions, the user's own first (spec spec-tabs).

import type { Spec } from "../../../shared/types.ts";
import { Inline, CopyCommand } from "../bits.tsx";
import { firstName, cap } from "../../../shared/names.ts";

export function Questions({ spec, user }: { spec: Spec; user: string }) {
  const mine = (o: string) => Boolean(user) && firstName(o) === firstName(user);
  const anyMine = spec.questions.some((q) => mine(q.owner));
  return (
    <section className={`panel${anyMine ? " attention" : ""}`}>
      {spec.questions.length === 0 && <span className="count">None</span>}
      {spec.questions.map((q) => (
        <div key={q.id} id={`ref-${q.id}`} className={`oq${mine(q.owner) ? " mine" : ""}`}>
          <span className="who">{q.id} · {mine(q.owner) ? "you" : cap(q.owner || "no owner")} · {q.blocks.length ? <Inline text={`blocks ${q.blocks.join(", ")}`} /> : "blocks nothing"}</span>
          <span><Inline text={q.text} /></span>
          {mine(q.owner) && (
            <div style={{ marginTop: 6 }}>
              <CopyCommand command={`/factree:spec ${spec.id} resolve ${q.id}`} label="Copy" />
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
