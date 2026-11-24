// Plans and the loop's state for a spec: its plans and their build, newest plan, verify result, pull request, stale stages
// and round (specs plan-view, build, verify, review, spec-ring R4).

import type { FactreeEvent, Plan, PlanBrief, Session, Spec, TaskBuild, VerifyCounts, VerifyResult, ReviewInfo, PullRequest, LoopState, BranchReview } from "../shared/types.ts";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePlan, type PlanFiles } from "./parse-plan.ts";
import { parseFrontMatter } from "./parse-spec.ts";
import { readText, isDir } from "./read.ts";
import { sessionsFor } from "./live.ts";
import { VERIFY_ON } from "../src/features.ts";
import { PAUSED_AFTER_MS } from "../shared/config.ts";

/** The latest spec.verified event for a spec, as counts or with every scenario's result (verify R4). */
export function latestVerify(id: string, events: FactreeEvent[], withResults: true): VerifyResult | null;
export function latestVerify(id: string, events: FactreeEvent[], withResults: false): VerifyCounts | null;
export function latestVerify(id: string, events: FactreeEvent[], withResults: boolean): VerifyResult | VerifyCounts | null {
  const e = [...events].reverse().find((x) => x.spec === id && x.type === "spec.verified");
  if (!e) return null;
  const results = (e.data.results ?? {}) as VerifyResult["results"];
  const manual = Object.values(results).filter((r) => r.status === "unverified" && /^manual case not run/.test(r.evidence)).length;
  const counts = { proved: Number(e.data.proved ?? 0), failing: Number(e.data.failing ?? 0), unverified: Number(e.data.unverified ?? 0), manual, at: e.ts };
  if (!withResults) return counts;
  return { ...counts, results };
}

/** An update that adds, changes or retires a requirement; a note or a decision alone isn't going back (spec-ring R4.S7). */
const specChanges = (e: FactreeEvent) => ["added", "changed", "retired"].some((k) => Array.isArray(e.data[k]) && (e.data[k] as unknown[]).length > 0);

/** The spec changed after the plan was last approved (plan-view R10), by the same rule as the line's stale Plan
 *  (spec-ring R4.S9): a build finished after the change took it in. Without events, by the dates in the files. */
export function isStale(plan: Plan, events: FactreeEvent[], spec: Spec | undefined): boolean {
  const last = (pred: (e: FactreeEvent) => boolean) => [...events].reverse().find(pred)?.ts;
  const made = last((e) => e.work === plan.work && e.type === "plan.approved") ?? last((e) => e.work === plan.work && e.type === "plan.created");
  const built = last((e) => e.work === plan.work && e.type === "plan.implemented");
  const changed = last((e) => e.type === "spec.updated" && e.spec === plan.spec && specChanges(e));
  if (made) return Boolean(changed && changed > made && !(built && built >= changed));
  return Boolean(spec?.updated && plan.specUpdated && spec.updated > plan.specUpdated);
}

export function brief(plans: Plan[], events: FactreeEvent[] = []): PlanBrief | null {
  const p = plans[0];
  if (!p) return null;
  const builds = Object.values(p.build);
  return { work: p.work, status: p.status, approvedAt: p.approvedAt, others: plans.length - 1,
    tasks: builds.length, done: builds.filter((b) => b.status === "done").length, implemented: Boolean(p.implementedAt),
    review: reviewOf(p.work, events), ...(p.branchReview ? { branchReview: p.branchReview } : {}) };
}

/** The plan's pull requests, keyed by repo and number (multi-repo R9): state and comments with how each was handled
 *  (review R8). No repo means the workspace's only repo. The top-level fields are the newest pull request's. */
function reviewOf(work: string, events: FactreeEvent[]): ReviewInfo | null {
  const mine = events.filter((e) => e.work === work && e.type.startsWith("review."));
  const key = (e: FactreeEvent) => `${String(e.data.repo ?? "")}#${String(e.data.pr ?? "")}`;
  const order: string[] = [];
  for (const e of mine) if (e.type === "review.opened") { const k = key(e); const i = order.indexOf(k); if (i >= 0) order.splice(i, 1); order.push(k); }
  if (!order.length) return null;
  const prs: PullRequest[] = order.map((k) => {
    const ofPr = mine.filter((e) => key(e) === k);
    const opened = [...ofPr].reverse().find((e) => e.type === "review.opened")!;
    const state = [...ofPr].reverse().find((e) => e.type === "review.state")?.data.state;
    // A restacked pull request was retargeted: its base is the newest of review.opened and review.restacked (R7).
    const based = [...ofPr].reverse().find((e) => (e.type === "review.opened" || e.type === "review.restacked") && e.data.base) ?? opened;
    const replies = new Map<string, FactreeEvent>();
    for (const e of ofPr) if (e.type === "review.reply") replies.set(String(e.data.comment ?? ""), e);
    const handled = (id: string) => {
      const r = replies.get(id);
      if (!r) return null;
      if (r.data.kind === "fixed") return `fixed in ${String(r.data.commit ?? "")}`;
      if (r.data.kind === "spec") return `changed in the spec${r.data.commit ? `, ${String(r.data.commit)}` : ""}`;
      return "replied";
    };
    const comments = ofPr.filter((e) => e.type === "review.comment").map((e) => ({
      author: String(e.data.author ?? ""), path: String(e.data.path ?? ""), line: String(e.data.line ?? ""),
      body: String(e.data.body ?? ""), handled: handled(String(e.data.id ?? "")),
    }));
    const t = opened.data.tasks;
    const tasks = Array.isArray(t) ? t.map(String) : t ? String(t).split(/[,\s]+/).filter(Boolean) : [];
    const af = opened.data.after;
    const after = Array.isArray(af) ? af.map(String) : af ? String(af).split(/[,\s]+/).filter(Boolean) : [];
    return { repo: String(opened.data.repo ?? ""), number: String(opened.data.pr ?? ""), url: String(opened.data.url ?? ""),
      base: String(based.data.base ?? ""), tasks, after, state: String(state ?? "OPEN"), comments };
  });
  const last = prs[prs.length - 1]!;
  return { url: last.url, state: last.state, comments: last.comments, prs };
}

/** Stale stages and the round (spec-ring R4). A stage after Spec is stale when it last finished before the latest spec
 *  change and hasn't finished since. A spec change starts a new round only once the work went out for review since
 *  the round began; each request for changes is a round too. */
export function loopOf(id: string, works: Set<string>, events: FactreeEvent[], verifyOn: boolean = VERIFY_ON): LoopState {
  const finished: Record<string, string> = {};
  let round = 1, reviewed = false, updated: string | null = null;
  for (const e of events) {
    if (e.spec !== id && !(e.work && works.has(e.work))) continue;
    if (e.type === "plan.approved") finished.plan = e.ts;
    else if (e.type === "plan.implemented") finished.build = e.ts;
    else if (e.type === "spec.verified") finished.verify = e.ts;
    else if (e.type === "review.opened") { finished.review = e.ts; reviewed = true; }
    // Going back is a new round only once the work went out for review; edits during the build are one round (R4.S6).
    else if (e.type === "spec.updated" && specChanges(e)) { if (reviewed) { round++; reviewed = false; } updated = e.ts; }
    else if (e.type === "review.state" && e.data.state === "CHANGES_REQUESTED") round++;
    if (e.type === "review.state" && e.data.state === "MERGED") finished.merged = e.ts;
  }
  // Staleness carries forward: once a stage is stale, every later stage that had finished is stale too, so the ring
  // never shows a gap (spec-ring R4.S5). An open pull request is fresh again once Verify is; a merged one is not.
  const before = (k: string) => Boolean(updated && finished[k] && finished[k]! < updated);
  const stale = [false];
  let carry = false;
  // The plan stays fresh if the build finished after the change: building took the change in (R4.S8). A verify alone
  // doesn't: it checks old code against the new spec (R4.S5).
  const builtAfter = Boolean(updated && finished.build && finished.build >= updated);
  (verifyOn ? ["plan", "build", "verify"] : ["plan", "build"]).forEach((k, i) => { const st: boolean = carry ? Boolean(finished[k]) : before(k) && !(i === 0 && builtAfter); stale.push(st); carry ||= st; });
  stale.push(Boolean(finished.review) && (carry || (before("merged") && before("review"))));
  // Re-planned after the change: the stages after Plan belong to the new plan and show its progress, not stale (R4.S2).
  if (updated && finished.plan && finished.plan >= updated) for (let i = 2; i < stale.length; i++) stale[i] = false;
  return { stale, round };
}

/** Each task's build status from its task.* events, latest first wins; tasks never started are waiting (build R8). */
export function buildStatus(plan: Plan, events: FactreeEvent[]): Record<string, TaskBuild> {
  const out: Record<string, TaskBuild> = {};
  for (const v of plan.verticals) for (const t of v.tasks ?? []) out[t.id] = { status: "waiting" };
  for (const e of events) {
    if (e.work !== plan.work || !(e.type.startsWith("task.") || e.type === "agent.started")) continue;
    const id = String(e.data.task ?? "");
    if (!(id in out)) continue;
    const b = out[id]!, role = e.data.role;
    if (e.type === "agent.started") {
      if (role === "build") out[id] = { ...b, phase: "building", model: String(e.data.model ?? ""), reviewerRecorded: false };
      else if (role === "review") out[id] = { ...b, phase: "reviewing", reviewerRecorded: true };
    }
    else if (e.type === "task.waiting") out[id] = { ...b, phase: "waiting", reason: String(e.data.reason ?? "") };
    else if (e.type === "task.fixing") {
      const round = Number(e.data.round ?? 0), cause = String(e.data.cause ?? ""), history = b.history ?? [];
      out[id] = { ...b, phase: "fixing", round, cause, reviewerRecorded: false, history: history.some((h) => h.kind === "fix" && h.round === round) ? history : [...history, { kind: "fix", round, cause }] };
    }
    else if (e.type === "task.reviewed") {
      const fs = Array.isArray(e.data.findings) ? (e.data.findings as { beyond_sources?: boolean }[]) : [];
      const history = b.history ?? [];
      if (e.data.spec === undefined && e.data.quality === undefined) {   // an old fix-round marker: no verdict (build-status D3)
        const round = Number(e.data.round ?? 0);
        out[id] = { ...b, round, cause: String(e.data.cause ?? ""), history: history.some((h) => h.kind === "fix" && h.round === round) ? history : [...history, { kind: "fix", round, cause: String(e.data.cause ?? "") }] };
      } else {
        const findings = fs.filter((f) => !f.beyond_sources).length, suggestions = fs.filter((f) => f.beyond_sources).length, verdict = `${String(e.data.spec ?? "")}/${String(e.data.quality ?? "")}`;
        out[id] = { ...b, verdict, findings, suggestions, history: [...history, { kind: "review", verdict, findings, suggestions }] };
      }
    }
    else if (e.type === "task.started") out[id] = { ...b, status: "running", phase: "building" };
    else if (e.type === "task.done") out[id] = { ...b, status: "done", phase: "merged", commit: String(e.data.commit ?? ""), lines: Number(e.data.lines ?? 0) };
    else if (e.type === "task.failed" || e.type === "task.blocked") out[id] = { status: e.type === "task.failed" ? "failed" : "blocked", reason: String(e.data.reason ?? "") };
  }
  return out;
}

/** The branch review of the plan's latest run: a new branch reviewer starts a fresh run, so its findings replace the last's (build-visibility R3).
 *  A run opens on the branch reviewer, a branch fix round, or the build's self-review step (D7). Older builds logged the
 *  self-review step and the branch findings but no fix round and no branch.reviewed, so they never open a run: a
 *  self-review step (with any findings after it) stays a run only if a branch reviewer, fix round or branch.reviewed
 *  comes next, or it is the newest and still inside the paused window (R1.S5). */
export function branchReviewOf(work: string, events: FactreeEvent[], now: number = Date.now()): BranchReview | null {
  const fresh = (phase: BranchReview["phase"]): BranchReview => ({ phase, findings: [], notProbed: [], rounds: [], passes: [], verdict: "", must: 0, should: 0 });
  let br: BranchReview | null = null;
  let pending: { since: string; before: BranchReview | null } | null = null;   // a self-review step nothing branch-era has followed yet
  for (const e of events) {
    const d = e.data, branch = d.task === "branch";
    const selfReview = e.type === "stage.step" && d.stage === "self-review" && (d.work === work || e.work === work);
    if (e.work !== work && !selfReview) continue;
    const reviewer = e.type === "agent.started" && d.role === "review" && branch;
    if (pending) {
      if (reviewer || (e.type === "task.fixing" && branch) || e.type === "branch.reviewed") pending = null;
      else if (!(e.type === "task.reviewed" && branch && d.round === undefined)) { br = pending.before; pending = null; }   // an older build: its self-review step opened nothing
    }
    if (selfReview) { pending = { since: e.ts, before: br }; br = fresh("probing"); }
    else if (reviewer) {
      if (br?.phase === "fixing") br.phase = "probing";   // the re-review after a fix round keeps the rounds and findings
      else br = fresh("probing");
    } else if (e.type === "task.reviewed" && branch) {
      if (!br || br.phase === "ended") continue;   // no run open: an older build's findings, which never ended a run
      br.phase = "probing";
      if (d.round !== undefined && !Array.isArray(d.findings)) { if (!br.rounds.some((r) => r.round === Number(d.round))) br.rounds.push({ round: Number(d.round), cause: String(d.cause ?? "") }); }   // an old marker
      else {
        br.findings = (Array.isArray(d.findings) ? d.findings as Record<string, unknown>[] : []).map((f) => ({ severity: String(f.severity ?? ""), text: String(f.text ?? ""), evidence: String(f.evidence ?? "") }));
        if (Array.isArray(d.findings)) br.passes.push({ findings: br.findings });   // each review with a findings array is a pass (build-status D3)
        br.notProbed = (Array.isArray(d.not_probed) ? d.not_probed as Record<string, unknown>[] : []).map((n) => ({ area: String(n.area ?? ""), reason: String(n.reason ?? "") }));
      }
    } else if (e.type === "task.fixing" && branch) {
      br ??= fresh("fixing");
      br.phase = "fixing";
      br.rounds = [...br.rounds.filter((r) => r.round !== Number(d.round)), { round: Number(d.round ?? 0), cause: String(d.cause ?? "") }];
      const last = br.passes[br.passes.length - 1];
      if (last) last.fix = { round: Number(d.round ?? 0), cause: String(d.cause ?? "") };
    } else if (e.type === "branch.reviewed") {
      br = { ...(br ?? fresh("ended")), phase: "ended", verdict: String(d.verdict ?? ""), must: Number(d.must ?? 0), should: Number(d.should ?? 0) };
    }
  }
  if (pending && now - Date.parse(pending.since) > PAUSED_AFTER_MS) br = pending.before;   // quiet too long: nothing started
  return br;
}

/** Every plan in `work/`, newest (highest number) first. A folder with no plan, design or task file isn't a plan (plan-view R11.S3). */
export function readPlans(root: string, events: FactreeEvent[] = [], specs: Map<string, Spec> = new Map(), live: Session[] = []): Plan[] {
  const dir = join(root, "work");
  if (!existsSync(dir)) return [];
  const out: Plan[] = [];
  for (const work of readdirSync(dir).sort().reverse()) {
    const folder = join(dir, work);
    if (!/^[\w.-]+$/.test(work) || !isDir(folder)) continue;
    const text = (f: string) => readText(join(folder, f)) ?? undefined;
    const plan = text("plan.md");
    let files: PlanFiles;
    if (plan !== undefined) {
      const listed = parseFrontMatter(plan).fm.verticals;
      const names = Array.isArray(listed) ? listed : listed ? [listed] : readdirSync(folder).filter((f) => isDir(join(folder, f))).sort();
      files = { plan, verticals: Object.fromEntries(names.map((v) => [v, { design: text(`${v}/design.md`), tasks: text(`${v}/tasks.md`) }])) };
    } else {
      const design = text("design.md"), tasks = text("tasks.md");
      if (design === undefined && tasks === undefined) continue;
      files = { verticals: { general: { design, tasks } } };
    }
    const p = parsePlan(work, files);
    p.stale = isStale(p, events, specs.get(p.spec));
    p.sessions = sessionsFor(events, (e) => e.work === work, live);
    p.build = buildStatus(p, events);
    p.branchReview = branchReviewOf(work, events);
    out.push(p);
  }
  return out;
}
