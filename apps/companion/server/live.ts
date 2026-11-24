// What's live on a spec: its session, its writing status and what's running now (specs spec-status, live-activity).

import { LIVE_WINDOW_MS, PAUSED_AFTER_MS } from "../shared/config.ts";
import { sep } from "node:path";
import { VERIFY_ON } from "../src/features.ts";
import type { AskedQuestion, DisplayStatus, FactreeEvent, Live, Plan, Session, SessionRef, SessionState, Spec, SpecStatus, WritingStep, Activity } from "../shared/types.ts";

/** Sessions that logged matching events, newest first, each with its last event time (spec-sessions R2–R4). */
const STEPS: WritingStep[] = ["gaps", "observe", "questions", "writing", "checking", "approval"];

export function sessionsFor(events: FactreeEvent[], match: (e: FactreeEvent) => boolean, live: Session[] = []): SessionRef[] {
  const last = new Map<string, string>();
  for (const e of events) if (e.session && match(e)) last.set(e.session, e.ts);   // events are in time order
  const states = new Map(live.map((s) => [s.id, s.state]));
  return [...last].map(([id, ts]) => ({ id, last: ts, state: refState(states.get(id)) })).sort((a, b) => b.last.localeCompare(a.last));
}

// An open session (idle or between turns) is the user's turn; readSessions already drops stale ones.
function refState(s: SessionState | undefined): SessionRef["state"] {
  if (s === "working" || s === "waiting" || s === "ended") return s;
  if (s === "your_turn" || s === "idle") return "your_turn";
  return "unknown";
}

function within(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/** The session that most likely ran an event: same or enclosing folder, active around that time. */
function sessionFor(cwd: string | undefined, sessions: Session[]): Session | null {
  if (!cwd) return null;
  const candidates = sessions.filter((s) => s.cwd && (within(cwd, s.cwd) || within(s.cwd, cwd)));
  return candidates[0] ?? null;
}

export function liveFor(specId: string, spec: Spec | undefined, events: FactreeEvent[], sessions: Session[], now = Date.now()): Live {
  const mine = events.filter((e) => e.spec === specId);
  // A run starts at the most recent spec.step that follows the last approval.
  const lastApproval = [...mine].reverse().find((e) => e.type === "spec.approved");
  const runEvents = mine.filter((e) => !lastApproval || e.ts > lastApproval.ts);
  const stepEvents = runEvents.filter((e) => e.type === "spec.step");
  const lastStep = stepEvents[stepEvents.length - 1];
  const lastAny = runEvents[runEvents.length - 1];
  const recent = lastAny ? now - Date.parse(lastAny.ts) < LIVE_WINDOW_MS : false;
  void spec;
  const open = Boolean(lastStep) && recent;

  const asked = new Map<number, AskedQuestion>();
  for (const e of runEvents) {
    const n = Number(e.data.n);
    if (!Number.isFinite(n)) continue;
    if (e.type === "question.asked") {
      asked.set(n, {
        n, text: String(e.data.text ?? ""), why: String(e.data.why ?? ""),
        proposal: String(e.data.proposal ?? ""), askedAt: e.ts,
      });
    } else if (e.type === "question.answered") {
      const q = asked.get(n);
      if (q) q.answer = String(e.data.answer ?? "");
    }
  }
  const all = [...asked.values()].sort((a, b) => a.n - b.n);
  const pending = open ? [...all].reverse().find((q) => q.answer === undefined) ?? null : null;

  const steps = stepEvents
    .map((e) => ({ step: String(e.data.step ?? "") as WritingStep, note: String(e.data.note ?? ""), at: e.ts }))
    .filter((s) => STEPS.includes(s.step));
  const step = open && lastStep ? (String(lastStep.data.step ?? "") as WritingStep) : null;

  return {
    open,
    step: step && STEPS.includes(step) ? step : null,
    stepNote: open && lastStep ? String(lastStep.data.note ?? "") : "",
    steps: open ? steps : [],
    pendingQuestion: pending,
    pending: open ? all.filter((q) => q.answer === undefined) : [],
    answered: open ? all.filter((q) => q.answer !== undefined) : [],
    session: open ? sessionFor(lastAny?.cwd, sessions) : null,
    reopened: runEvents.some((e) => e.type === "question.asked" || e.type === "spec.updated"),
  };
}

/** What the UI shows for a spec (spec-status R2–R5). */
export function displayStatus(fileStatus: SpecStatus | null, live: Live, lastMoved: string | null, now: number): DisplayStatus {
  if ((fileStatus === "approved" || fileStatus === "live") && !live.reopened) return fileStatus;   // an approved file is not reopened by a run that only logged steps (spec-status R1)
  if (live.open) {
    const working = live.session?.state === "working";
    const blocked = live.pendingQuestion || live.step === "approval" || live.session?.state === "waiting";
    if (blocked && !working) return "needs_you";
    const recent = lastMoved !== null && now - Date.parse(lastMoved) < PAUSED_AFTER_MS;
    if (recent || working) return "writing";
  }
  return fileStatus ?? "draft";   // a paused run keeps the file status; no file yet reads as a draft
}

const WRITING_STEP: Record<string, string> = { gaps: "finding gaps", observe: "reading the code", questions: "asking questions", writing: "", checking: "checking", approval: "finishing" };
const STAGE_LABEL: Record<string, [Activity["stage"], string]> = {
  plan: ["plan", "Planning"], build: ["build", "Building"], "self-review": ["build", "Probing the branch"], verify: ["verify", "Verifying"], review: ["review", "Opening the pull request"],
};
const ENDS = new Set(["spec.approved", "plan.approved", "task.failed", "task.blocked", "spec.verified", "review.opened", "branch.reviewed"]);

/** What's running on a spec now: the newest progress event that nothing has ended since (live-activity R1–R3). */
export function activityOf(id: string, events: FactreeEvent[], plans: Plan[], now: number): Activity | null {
  const works = new Set(plans.map((p) => p.work));
  let cur: Activity | null = null;
  let before: Activity | null = null;   // what was running when a question was asked
  const builders = new Set<string>(), reviewers = new Set<string>();   // tasks with an agent running (build-visibility R4)
  let probing = false;   // the branch reviewer was recorded and no branch.reviewed followed
  const idle = () => { cur = null; before = null; builders.clear(); reviewers.clear(); probing = false; };
  for (const e of events) {
    if (e.spec !== id && !(e.work && works.has(e.work))) continue;
    // A built plan with no branch review in progress is finished; one still probing carries on until branch.reviewed (D7).
    if (ENDS.has(e.type) || (e.type === "plan.implemented" && !probing)) { idle(); continue; }
    if (e.type === "plan.implemented") continue;
    if (e.type === "agent.started") {
      const task = String(e.data.task ?? ""), role = String(e.data.role ?? "");
      if (role === "review" && task === "branch") probing = true;
      else if (role === "review") { builders.delete(task); reviewers.add(task); }
      else if (role === "build") { reviewers.delete(task); builders.add(task); }
      else continue;
      if (!cur?.asking) cur = { stage: "build", label: "Building", step: "", since: e.ts, paused: false, asking: false };
      continue;
    }
    if (e.type === "spec.step") cur = { stage: "spec", label: "Writing", step: WRITING_STEP[String(e.data.step)] ?? "", since: e.ts, paused: false, asking: false };
    else if (e.type === "stage.step") {
      const [stage, label] = !VERIFY_ON && e.data.stage === "verify" ? [] : STAGE_LABEL[String(e.data.stage)] ?? [];   // paused: an old verify step shows nothing
      if (e.data.stage === "self-review") probing = true;   // the branch review starts with the self-review step (D7)
      if (stage && label) cur = { stage, label, step: e.data.stage === "review" ? "" : String(e.data.step ?? ""), since: e.ts, paused: false, asking: false };
    } else if (e.type === "task.started" || e.type === "task.done") {
      const t = String(e.data.task ?? "");
      if (e.type === "task.done") { builders.delete(t); reviewers.delete(t); }
      if (!cur || !probing) cur = { stage: "build", label: "Building", step: "", since: e.ts, paused: false, asking: false };
    } else if (e.type === "question.asked" && cur) { before = cur.asking ? before : cur; cur = { ...(cur as Activity), label: "Asking you", step: "", since: e.ts, asking: true }; }
    else if (e.type === "question.answered" && cur?.asking && before) { cur = { ...(before as Activity), since: e.ts }; before = null; }
  }
  if (!cur) return null;
  const list = (x: Set<string>) => [...x].sort().join(", ");
  if (!cur.asking && cur.stage === "build") {
    if (probing) { cur.label = "Probing the branch"; cur.step = ""; }
    else if (builders.size) { cur.label = "Building"; cur.step = list(builders) + (reviewers.size ? ` · Reviewing ${list(reviewers)}` : ""); }
    else if (reviewers.size) { cur.label = "Reviewing"; cur.step = list(reviewers); }
  }
  if (cur.label === "Building" && !cur.step) {
    const p = plans[0];
    const running = p ? Object.entries(p.build).find(([, b]) => b.status === "running")?.[0] : undefined;
    if (p && running) cur.step = `${running} of ${Object.keys(p.build).length}`;
  }
  cur.paused = !cur.asking && now - Date.parse(cur.since) > PAUSED_AFTER_MS;
  return cur;
}
