// The spec page's Activity tab: what happened, and the sessions that worked on it (specs spec-activity, spec-sessions).

import type { FactreeEvent, SessionRef } from "../../../shared/types.ts";
import { Inline, ResumeButton } from "../bits.tsx";
import { clock } from "../../api.ts";

const EVENT_TEXT: Record<string, (e: FactreeEvent) => string> = {
  "spec.created": (e) => `Spec created${e.data.requirements ? ` with ${e.data.requirements} requirements` : ""}`,
  "spec.updated": (e) => `Spec updated${Array.isArray(e.data.added) && e.data.added.length ? ` · added ${(e.data.added as string[]).join(", ")}` : ""}${Array.isArray(e.data.changed) && e.data.changed.length ? ` · changed ${(e.data.changed as string[]).join(", ")}` : ""}`,
  "spec.approved": (e) => `Approved by ${String(e.data.by ?? e.actor ?? "someone")}`,
  "spec.step": (e) => `Step: ${String(e.data.step ?? "")}${e.data.note ? ` · ${String(e.data.note)}` : ""}`,
  "question.asked": (e) => `Claude asked: ${String(e.data.text ?? "")}`,
  "question.answered": (e) => `Answered: ${String(e.data.answer ?? "")}`,
  "question.opened": (e) => `Open question ${String(e.data.id ?? "")} added`,
  "question.resolved": (e) => `${String(e.data.id ?? "")} resolved${e.data.by ? ` as ${String(e.data.by)}` : ""}`,
  "decision.recorded": (e) => `${String(e.data.id ?? "")} decided by ${String(e.data.by ?? e.actor ?? "someone")}`,
};

export function activityShown(events: FactreeEvent[]) { return events.filter((e) => EVENT_TEXT[e.type]).slice(0, 12); }

export function Activity({ events, sessions }: { events: FactreeEvent[]; sessions: SessionRef[] }) {
  const shown = activityShown(events);
  if (shown.length === 0 && sessions.length === 0) return null;
  return (
    <section className="panel">
      {sessions.length > 0 && (
        <ol className="list sessions" aria-label="Sessions">
          {sessions.map((s) => (
            <li key={s.id}><time dateTime={s.last}>{clock(s.last)}</time><ResumeButton id={s.id} /></li>
          ))}
        </ol>
      )}
      <ol className="list activity">
        {shown.map((e, i) => (
          <li key={`${e.ts}-${i}`}><time dateTime={e.ts}>{clock(e.ts)}</time><span><Inline text={EVENT_TEXT[e.type]!(e)} /></span></li>
        ))}
      </ol>
    </section>
  );
}
