import { useEffect, useRef, useState } from "react";
import type { DecisionCard } from "../../shared/types.ts";
import { ResumeButton } from "./bits.tsx";
import { ago } from "../api.ts";
import { DECISIONS_PATH, specPath } from "../links.ts";

// Decision cards (spec companion-decisions): each decision a spec waits on, in that spec's Decisions tab, settled in a
// keystroke or handed to the Claude Code session that holds the work.

export type DecisionBody =
  | { kind: "answer"; spec: string; n: number; answer: string }
  | { kind: "approve-spec"; spec: string }
  | { kind: "approve-plan"; work: string }
  | { kind: "feedback"; spec: string; work?: string; note: string }
  | { kind: "approve-lesson" | "reject-lesson"; spec: string; key: string };

/** The decision a card's primary action makes: the recommendation, an approval, or nothing when it needs Claude. */
export function primaryDecision(c: DecisionCard): DecisionBody | null {
  if (!c.approvable) return null;
  if (c.kind === "question") return c.recommendation ? { kind: "answer", spec: c.spec, n: c.n!, answer: c.recommendation } : null;
  if (c.kind === "spec") return { kind: "approve-spec", spec: c.spec };
  if (c.kind === "plan" && c.work) return { kind: "approve-plan", work: c.work };
  if (c.kind === "lesson" && c.lesson) return { kind: "approve-lesson", spec: c.spec, key: c.lesson.key };
  return null;
}

/** The answer for option k (1 = the recommendation, then the other options), or null (R3, R9). */
export function optionDecision(c: DecisionCard, k: number): DecisionBody | null {
  if (c.kind !== "question") return null;
  const choices = [c.recommendation, ...c.options].filter((x): x is string => Boolean(x));
  const pick = choices[k - 1];
  return pick ? { kind: "answer", spec: c.spec, n: c.n!, answer: pick.split(" — ")[0]!.trim() } : null;
}

export type InboxAction =
  | { t: "move"; to: number }
  | { t: "decide"; body: DecisionBody }
  | { t: "note" }
  | { t: "claude" }
  | { t: "none" };

/** The inbox keyboard (R9, decide-focus R3): j/k or the arrows move, Enter takes the recommendation or approves, 1–9 pick, r notes, c hands to Claude. */
export function inboxKey(key: string, selected: number, cards: DecisionCard[]): InboxAction {
  const c = cards[selected];
  if (key === "j" || key === "ArrowRight") return { t: "move", to: Math.min(selected + 1, Math.max(cards.length - 1, 0)) };
  if (key === "k" || key === "ArrowLeft") return { t: "move", to: Math.max(selected - 1, 0) };
  if (!c) return { t: "none" };
  if (key === "Enter") { const b = primaryDecision(c); return b ? { t: "decide", body: b } : { t: "claude" }; }
  if (/^[1-9]$/.test(key)) { const b = optionDecision(c, Number(key)); return b ? { t: "decide", body: b } : { t: "none" }; }
  if (key === "r") return { t: "note" };
  if (key === "c") return { t: "claude" };
  if (key === "x" && c.kind === "lesson" && c.lesson) return { t: "decide", body: { kind: "reject-lesson", spec: c.spec, key: c.lesson.key } };
  return { t: "none" };
}

/** Where to continue in Claude Code, from the session's state (R7). */
export function sessionLine(c: DecisionCard): { text: string; resume: string | null } {
  const s = c.session;
  if (!s) return { text: "No Claude Code session is recorded for this. Start one in the repo.", resume: null };
  const short = s.id.slice(0, 8);
  if (s.state === "working") return { text: `Claude is working in session ${short}`, resume: null };
  if (s.state === "your_turn" || s.state === "waiting") return { text: `Open in your terminal: session ${short} is waiting for you`, resume: null };
  return { text: `The session ${s.state === "ended" ? "has ended" : "isn't running"}. Resume it:`, resume: `claude --resume ${s.id}` };
}

const KIND_LABEL = { question: "Question", spec: "Approve spec", plan: "Approve plan", task: "Build task", lesson: "Lesson" } as const;

/** One decision at a time (decide-focus R1–R3): the question, the recommendation as the primary action, the other
 *  options numbered from 2, and a bar of how far through the waiting decisions the user is. `done` counts the ones
 *  decided in this visit, since a decided card leaves `cards`. */
export function Inbox({ cards, onDecide, done: done0 = 0 }: { cards: DecisionCard[]; onDecide: (b: DecisionBody) => Promise<string | null>; done?: number }) {
  const [selected, setSelected] = useState(0);
  const [done, setDone] = useState(done0);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [claudeFor, setClaudeFor] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const sel = Math.min(selected, Math.max(cards.length - 1, 0));
  const c = cards[sel];

  const run = async (body: DecisionBody) => {
    const err = await onDecide(body);
    setFlash(err ? { text: err, ok: false } : null);
    if (!err) setDone((d) => d + 1);
    setNoteFor(null); setNote("");
  };
  const openNote = () => { if (c) { setNoteFor(c.id); setTimeout(() => noteRef.current?.focus(), 0); } };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = inboxKey(e.key, sel, cards);
      if (a.t === "none") return;
      e.preventDefault();
      if (a.t === "move") setSelected(a.to);
      else if (a.t === "decide" && c) void run(a.body);
      else if (a.t === "note") openNote();
      else if (a.t === "claude" && c) setClaudeFor(claudeFor === c.id ? null : c.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!c) return null;
  const total = done + cards.length, at = done + sel;
  const primary = primaryDecision(c);
  const others = c.kind === "question" ? c.options : [];
  const first = c.recommendation ? 2 : 1;   // option keys follow the recommendation (key 1, or Enter)
  const sl = sessionLine(c);
  const links = c.links.filter((l) => l.href !== specPath(c.spec));   // not the page the user is on (decide-focus R4)
  const approveLabel = c.kind === "spec" ? "Approve spec" : c.kind === "lesson" ? "Approve" : "Approve plan";
  return (
    <div className="focus">
      <div className="focus-bar" aria-label={`${at} of ${total} decided`}>
        {Array.from({ length: total }, (_, i) => <span key={i} className={`seg${i < done ? " done" : i === at ? " now" : ""}`} />)}
      </div>
      <div className="focus-where">
        <span className={`dkind ${c.kind}`}>{KIND_LABEL[c.kind]}</span>
        <span>{at + 1} of {total}</span>
        <span className="count">waiting {ago(c.since)}</span>
      </div>
      {flash && <div className="notice problems" role="status">{flash.text}</div>}

      <div className="focus-q">{c.title}</div>
      {c.kind === "question" && c.recommendation && <div className="focus-rec">→ <b>{c.recommendation}</b> <span className="count">(recommended)</span></div>}
      {c.feedback && <div className="dfeedback">Changes requested: {c.feedback}</div>}
      {c.lesson && <div className="dchange">Adds to <span className="mono">.factree/{c.lesson.file}</span>: <span className="mono">{c.lesson.change}</span></div>}
      {c.why && <details className="focus-why"><summary>Why</summary><p>{c.why}</p></details>}

      <div className="dactions">
        {primary
          ? <button type="button" className="btn primary" onClick={() => void run(primary)}>{c.kind === "question" ? c.recommendation : approveLabel} <kbd>Enter</kbd></button>
          : c.kind !== "question" && <span className="dblocked">{c.blockedReason ?? "Needs Claude"}</span>}
        {others.map((o, k) => {
          const [label, effect] = o.split(" — ");
          return <button key={k} type="button" className="btn" title={effect} onClick={() => { const b = optionDecision(c, k + first); if (b) void run(b); }}>{label} <kbd>{k + first}</kbd></button>;
        })}
        {c.kind === "lesson" && c.lesson && <button type="button" className="btn" onClick={() => void run({ kind: "reject-lesson", spec: c.spec, key: c.lesson!.key })}>Not this <kbd>x</kbd></button>}
        <button type="button" className="btn ghost" onClick={openNote}>Something else <kbd>r</kbd></button>
        <button type="button" className="btn ghost" onClick={() => setClaudeFor(claudeFor === c.id ? null : c.id)}>Continue in Claude <kbd>c</kbd></button>
      </div>

      {noteFor === c.id && (
        <div className="dnote">
          <textarea ref={noteRef} rows={2} placeholder={c.kind === "question" ? "Your answer" : "What should change? e.g. split T4"} value={note} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              const v = note.trim();
              if (e.key === "Enter" && !e.shiftKey && v) {
                e.preventDefault();
                void run(c.kind === "question" && c.n ? { kind: "answer", spec: c.spec, n: c.n, answer: v } : { kind: "feedback", spec: c.spec, ...(c.work ? { work: c.work } : {}), note: v });
              }
              if (e.key === "Escape") setNoteFor(null);
            }} />
          <span className="count">Enter sends it · Esc cancels</span>
        </div>
      )}
      {(claudeFor === c.id || (!primary && c.kind !== "question")) && (
        <div className="dclaude">{sl.text} {sl.resume && <ResumeButton id={c.session!.id} />}</div>
      )}

      {(links.length > 0 || (c.newPatterns?.length ?? 0) > 0) && (
        <div className="dlinks">
          {c.newPatterns?.map((p) => <a key={p.id} href={p.href} title={p.text}>{p.id} {p.text}</a>)}
          {links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </div>
      )}
      <div className="focus-keys count"><b>←</b>/<b>→</b> move · <b>Enter</b> recommended · <b>2–9</b> option · <b>r</b> something else · <b>c</b> Claude</div>
    </div>
  );
}

export { DECISIONS_PATH };
