// The spec list: a row per spec, the empty state, and the resizable border beside it (specs spec-row, companion-layout).

import type { PointerEvent as ReactPointerEvent } from "react";
import type { SpecSummary } from "../../shared/types.ts";
import { CopyCommand, ActivityLine } from "./bits.tsx";
import { MiniLine } from "./LoopLine.tsx";
import { waitingLabel } from "../status.ts";
import { progressOf } from "../progress.ts";
import { heldSub } from "../stages.ts";
import { keyWidth, MIN_SIDEBAR, MAX_SIDEBAR } from "../layout.ts";

export function SpecLink({ s, active, waiting = 0 }: { s: SpecSummary; active: boolean; waiting?: number }) {
  const w = waitingLabel(waiting);
  const r = progressOf(s, null, waiting);   // the same place the line reads where the spec is (spec-row R1, D2)
  const held = r.current ? heldSub(s, r.current) : null;   // a hold wins over a live activity on the row too (build-status R4.S1)
  return (
    <a className={`spec-link${active ? " active" : ""}`} href={`/work/${s.id}`} title={s.title} aria-current={active ? "page" : undefined}>
      <MiniLine summary={s} waiting={waiting} /><span className="id">{s.id}{w && <span className="waiting-count">{w}</span>}</span>
      {s.status === "needs_you" || waiting > 0
        ? <span className="stage-line">Asking you</span>
        : held ? <span className="stage-line">{held}</span>
        : r.live
          ? <span className="stage-line activity"><ActivityLine a={r.live} /></span>
          : <span className="stage-line">{r.centre}</span>}
    </a>
  );
}

export function Empty() {
  return (
    <div className="empty">
      <h1>No specs yet</h1>
      <p>Start one in Claude Code with a ticket, a page or a description:</p>
      <CopyCommand command="/factree:spec " />
    </div>
  );
}

// The border between the spec list and the main section (companion-layout R2): drag, arrow keys, double-click to reset.
export function Resizer({ width, onChange, onReset }: { width: number; onChange: (px: number) => void; onReset: () => void }) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX, startW = width;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const move = (ev: PointerEvent) => onChange(startW + ev.clientX - startX);
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing");
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  return (
    <div
      className="resizer" role="separator" aria-orientation="vertical" aria-label="Resize the spec list" tabIndex={0}
      aria-valuenow={width} aria-valuemin={MIN_SIDEBAR} aria-valuemax={MAX_SIDEBAR}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={(e) => { const w = keyWidth(width, e.key); if (w !== null) { e.preventDefault(); onChange(w); } }}
    />
  );
}
