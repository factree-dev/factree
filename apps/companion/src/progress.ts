// The loop's progress (spec spec-ring R1, R3, R4): how far each of the five stages has come, its state, the percentage
// and what's happening, from the same stage rules the list uses, so the line and the list never disagree.

import type { Activity, Spec, SpecSummary } from "../shared/types.ts";
import { STALE, UP_NEXT, NOT_STARTED } from "./words.ts";
import { planStage, buildStage, verifyStage, reviewStage, toHandle, heldSub } from "./stages.ts";
import { activityText } from "./status.ts";
import { VERIFY_ON } from "./features.ts";

export type StageState = "done" | "running" | "waiting" | "stale" | "idle";
export interface StageProgress { key: string; name: string; fill: number; state: StageState; href: string | null; sub: string }
export interface Progress { stages: StageProgress[]; pct: number; centre: string; round: number; current: string | null; live: Activity | null }

const STEP_FILL: Record<string, number> = { gaps: 0.15, observe: 0.3, questions: 0.45, writing: 0.65, checking: 0.8, approval: 0.9 };
// The stage an activity runs on: self-review is part of Build.
const ACTIVITY_STAGE: Record<string, string> = { spec: "spec", plan: "plan", build: "build", "self-review": "build", verify: "verify", review: "review" };
// While a stage runs, it shows at least its step's share, so a stage that has just started is never an empty segment (R1.S5).
const PLAN_STEP: Record<string, number> = { starting: 0.1, "reading the repo": 0.25, designing: 0.5, "writing tasks": 0.75, checking: 0.9 };
const REVIEW_FILL: Record<string, number> = { OPEN: 0.4, CHANGES_REQUESTED: 0.4, CLOSED: 0.4, APPROVED: 0.8, MERGED: 1 };

export function progressOf(s: SpecSummary, spec: Spec | null, waiting = 0, verifyOn: boolean = VERIFY_ON): Progress {
  const specDone = s.status === "approved" || s.status === "live";
  const p = planStage(s, spec), b = buildStage(s), v = verifyStage(s), rv = reviewStage(s, verifyOn);
  // A stage is done only when it and every stage before it are done (stage-spine R2).
  // A stale stage isn't done (spec-ring R4.S4), so the line, the stage pages and the row agree.
  // Off, every per-stage array drops the Verify slot (index 3), so the line is four wide (verify-paused D6).
  const keep = <T,>(a: T[]): T[] => (verifyOn ? a : a.filter((_, i) => i !== 3));
  const st0 = s.loop?.stale ?? [];
  const st1 = !verifyOn && st0.length === 5 ? keep(st0) : st0, n = verifyOn ? 5 : 4, ri = n - 1;
  const own = keep([specDone, p.done && !st1[1], b.done && !st1[2], v.done && !st0[3], rv.done && !st1[ri]]);
  const done = own.map((_, i) => own.slice(0, i + 1).every(Boolean));
  const keys = keep(["spec", "plan", "build", "verify", "review"]), names = keep(["Spec", "Plan", "Build", "Verify", "Review"]);
  const currentIdx = done.findIndex((d) => !d);
  const plan = s.plan, vr = s.verify;
  const fills = keep([
    specDone ? 1 : s.status === "writing" || s.status === "paused" || s.status === "needs_you" ? STEP_FILL[s.live.step ?? ""] ?? 0.1 : s.hasFile ? 0.1 : 0,
    !plan ? 0 : plan.status === "approved" ? 1 : plan.status === "design-approved" ? 0.66 : 0.33,
    !plan || plan.status !== "approved" ? 0 : plan.implemented ? 1 : plan.tasks ? plan.done / plan.tasks : 0,
    v.done ? 1 : vr && plan?.implemented ? (() => { const n = vr.proved + vr.failing + vr.unverified - (vr.manual ?? 0); return n > 0 ? vr.proved / n : 0; })() : 0,
    plan?.review ? REVIEW_FILL[plan.review.state] ?? 0.4 : 0,
  ]);
  const stale = st1.length ? st1 : keep([false, false, false, false, false]);
  const running = s.activity && !s.activity.paused && !s.activity.asking ? ACTIVITY_STAGE[s.activity.stage] ?? null : null;
  if (running === "plan") fills[1] = Math.max(fills[1]!, PLAN_STEP[s.activity!.step] ?? 0.1);
  if (running === "build" && plan?.tasks && !plan.implemented) fills[2] = Math.max(fills[2]!, 0.5 / plan.tasks);   // at least half a task, so T1 shows
  if (verifyOn && running === "verify") fills[3] = Math.max(fills[3]!, 0.5);
  if (running === "review") fills[ri] = Math.max(fills[ri]!, 0.2);
  // No gaps (spec-ring R4.S5): a stage shows progress only once every stage ahead of it is complete or stale.
  for (let i = 1, open = true; i < n; i++) { open &&= fills[i - 1]! >= 1 || Boolean(stale[i - 1]); if (!open && !stale[i]) fills[i] = 0; }
  // An open pull request is the stage in progress; a comment to handle or a request for changes needs attention (R1.S9, S10).
  const rvState = plan?.review?.state ?? "";
  const reviewWaits = Boolean(plan?.review && (toHandle(plan.review) > 0 || rvState === "CHANGES_REQUESTED"));
  const reviewOpen = rvState === "OPEN" || rvState === "APPROVED";
  const subs = keep([specDone ? "Approved" : s.status === "draft" ? "Draft" : "Writing", p.sub, b.sub, v.sub, rv.sub]);
  const hrefs = keep([`/work/${s.id}/spec`, p.href, b.href, v.href, rv.href]);
  const stages: StageProgress[] = keys.map((key, i) => {
    const state: StageState = stale[i] ? "stale"
      : fills[i]! >= 1 ? "done"
      : i === currentIdx ? (waiting > 0 || s.activity?.asking || (key === "review" && reviewWaits) ? "waiting" : running === key || (key === "review" && reviewOpen) ? "running" : "idle")
      : fills[i]! > 0 ? "done" : "idle";
    const sub = stale[i] ? STALE : heldSub(s, key) ?? (i === currentIdx && NOT_STARTED.has(subs[i]!) ? UP_NEXT : subs[i]!);
    return { key, name: names[i]!, fill: stale[i] ? 1 : Math.round(fills[i]! * 100) / 100, state, href: hrefs[i] ?? null, sub };
  });
  // Stale stages don't count: the percentage is this round's progress.
  const pct = Math.round(stages.reduce((n, st, i) => n + (stale[i] ? 0 : st.fill), 0) / n * 100);
  const current = currentIdx < 0 ? null : keys[currentIdx]!;
  // What runs shows unless it runs ahead of an unfinished or stale stage, which then wins (R1.S4): work on the current
  // stage, or on one before it (re-planning a built spec), shows.
  const liveAt = s.activity ? keys.indexOf(ACTIVITY_STAGE[s.activity.stage] ?? "spec") : -1;
  const live = waiting === 0 && s.activity && (currentIdx < 0 || liveAt <= currentIdx) ? s.activity : null;
  const centre = waiting > 0 ? `${waiting} decision${waiting === 1 ? "" : "s"} waiting`
    : live ? activityText(live)
    : currentIdx < 0 ? (plan?.review?.state === "MERGED" ? "Merged" : "Done")
    : `${names[currentIdx]} · ${stages[currentIdx]!.sub}`;
  return { stages, pct, centre, round: s.loop?.round ?? 1, current, live };
}

/** Where a spec opens from the list: the stage its work is at now (spec-ring R3). */
export function currentStageHref(summary: SpecSummary, spec: Spec | null): string {
  const r = progressOf(summary, spec);
  const st = r.stages.find((x) => x.key === (r.current ?? "review"));
  return st?.href ?? `/work/${summary.id}/spec`;
}

/** Where to send a spec's own address (/work/<spec>), or null: only once that spec is the one loaded, so switching specs
 *  never sends the user back to the spec they came from (spec-ring R3.S3). */
export function openCurrentHref(pathname: string, summary: SpecSummary, spec: Spec | null): string | null {
  const m = /^\/work\/([^/]+)\/?$/.exec(pathname);
  return m && m[1] === summary.id ? currentStageHref(summary, spec) : null;
}
