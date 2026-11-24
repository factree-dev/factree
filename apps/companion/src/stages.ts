// The stage rules (specs stage-spine, plan-view, build, verify, review, spec-row): for each stage of a spec, its status
// in words, where it opens and whether it's done, and where the spec is now. The loop line and the list both use them.

import type { SpecSummary, Spec } from "../shared/types.ts";
import { PLAN_LABEL, reviewLabel } from "./words.ts";
import { planHref, verifyHref } from "./links.ts";
import { VERIFY_ON } from "./features.ts";

/** The Review stage (stage-spine R3, review R8): opens once a built plan's verify is clean, or it has a pull request,
 *  and otherwise says why not; done when the pull request is merged. */
/** Review comments not yet handled on a pull request still open (spec-ring R1.S10). */
export const toHandle = (r: { state: string; comments?: { handled?: string | null }[] }) =>
  r.state === "MERGED" || r.state === "CLOSED" ? 0 : (r.comments ?? []).filter((c) => !c.handled).length;

export function reviewStage(s: SpecSummary, verifyOn: boolean = VERIFY_ON): { sub: string; href: string | null; done: boolean } {
  const r = s.plan?.review;
  const href = `/work/${s.id}/review`;
  const open = r ? toHandle(r) : 0;
  if (r) return { sub: open ? `${open} comment${open === 1 ? "" : "s"} to handle` : reviewLabel(r.state), href, done: r.state === "MERGED" };
  // Verify paused: the pull request opens once the plan is implemented (verify-paused R4).
  if (!verifyOn) return s.plan?.implemented ? { sub: "Open the pull request", href, done: false } : { sub: "Build it first", href: null, done: false };
  if (!s.plan?.implemented || !s.verify) return { sub: "Verify it first", href: null, done: false };
  if (s.verify.failing > 0) return { sub: "Fix what's failing first", href: null, done: false };
  return { sub: "No pull request yet", href, done: false };
}

/** A held stage's label (build-status R4, D3): the reason and how long, over the station's usual label. */
export function heldSub(s: SpecSummary, key: string, now = Date.now()): string | null {
  const h = s.plan?.hold;
  if (!h || h.stage !== key) return null;
  const m = Math.max(0, Math.floor((now - Date.parse(h.since)) / 60000));
  return `Held: ${h.reason} · ${m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`}`;
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The Plan stage (plan-view R1): the newest plan's status, or why there is none. */
export function planStage(s: SpecSummary, spec: Spec | null): { sub: string; href: string | null; done: boolean } {
  const p = s.plan;
  if (p) {
    const base = p.status === "approved" && p.approvedAt ? `Approved · ${shortDate(p.approvedAt)}` : PLAN_LABEL[p.status];
    const more = p.others > 0 ? ` · +${p.others} more plan${p.others === 1 ? "" : "s"}` : "";
    return { sub: base + more, href: planHref(s.id, p.work), done: p.status === "approved" };
  }
  if (spec?.status === "live") return { sub: "No plan recorded", href: null, done: false };
  if (spec?.status === "approved") return { sub: "No plan yet", href: planHref(s.id, ""), done: false };
  return { sub: "Approve the spec first", href: null, done: false };
}

/** The Build stage (build R8, build-visibility R1): selectable once the newest plan is approved; done only when it is
 *  implemented and its branch review ended with no must-fix open (or logged no branch events at all, as older plans). */
export function buildStage(s: SpecSummary): { sub: string; href: string | null; done: boolean } {
  const p = s.plan;
  if (!p || p.status !== "approved") return { sub: "Approve a plan first", href: null, done: false };
  const href = planHref(s.id, p.work, "build");
  const br = p.branchReview;
  if (br?.phase === "ended" && br.must > 0) return { sub: `branch review: ${br.must} must-fix open`, href, done: false };
  if (p.implemented && (!br || br.phase === "ended")) return { sub: "Implemented", href, done: true };
  const merged = `${p.done}/${p.tasks} merged`;
  if (br?.phase === "fixing") return { sub: `branch review: ${br.findings.filter((f) => /^should/i.test(f.severity)).length} should-fix, fixing`, href, done: false };
  if (br) return { sub: `${merged} · branch review: probing`, href, done: false };
  if (p.done > 0) return { sub: merged, href, done: false };
  return { sub: "Not started", href, done: false };
}

/** The Verify stage: opens once the newest plan is built, or to show a result it already has (stage-spine R1);
 *  done only for a clean result on a built plan (R2). */
export function verifyStage(s: SpecSummary): { sub: string; href: string | null; done: boolean } {
  const v = s.verify;
  const built = Boolean(s.plan?.implemented);
  if (!v) return built ? { sub: "Not verified", href: verifyHref(s.id), done: false } : { sub: "Build it first", href: null, done: false };
  // Done once only scenarios a person must check are left unverified (stage-spine R4).
  const manual = v.manual ?? 0, gaps = v.unverified - manual;
  const parts = [`${v.proved} proved`, v.failing ? `${v.failing} failing` : "", gaps ? `${gaps} unverified` : "", manual ? `${manual} need a person` : ""].filter(Boolean);
  return { sub: parts.join(" · "), href: verifyHref(s.id), done: built && v.failing === 0 && gaps === 0 };
}

