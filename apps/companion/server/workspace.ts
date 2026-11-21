// Read a Factree workspace: specs, events and sessions, and work out what's live.

import { readdirSync, statSync, existsSync } from "node:fs";
import { firstName } from "../shared/names.ts";
import { join } from "node:path";
import type { FactreeEvent, Plan, RepoLink, Session, Spec, SpecDetail, SpecSummary, WaitingItem, WorkspaceState } from "../shared/types.ts";
import { waitingDecisions } from "./decisions.ts";
import { readEvents, readSessions, readSpecs, isDir } from "./read.ts";
import { sessionsFor, liveFor, displayStatus, activityOf } from "./live.ts";
import { latestVerify, brief, loopOf, readPlans } from "./loop.ts";

/** A spec's summary, or null for a run that has gone quiet without ever writing a file. */
function summarize(id: string, spec: Spec | undefined, events: FactreeEvent[], sessions: Session[], now: number, plans: Plan[] = []): SpecSummary | null {
  const live = liveFor(id, spec, events, sessions, now);
  if (!spec && !live.open) return null;
  const mine = events.filter((e) => e.spec === id);
  const firstStep = mine.find((e) => e.type === "spec.step" && e.data.title);
  const lastMoved = mine[mine.length - 1]?.ts ?? null;
  // Activity counts the spec's plans too, so a spec being built moves up (spec-order R1, D1).
  const works = new Set(plans.map((p) => p.work));
  let lastActivity: string | null = null;
  for (const e of events) if ((e.spec === id || (e.work && works.has(e.work))) && (!lastActivity || e.ts > lastActivity)) lastActivity = e.ts;
  lastActivity ??= spec?.updated || null;
  return {
    id,
    title: spec?.title ?? String(firstStep?.data.title ?? id),
    status: displayStatus(spec?.status ?? null, live, lastMoved, now),
    lastMoved,
    lastActivity,
    activity: activityOf(id, events, plans, now),
    hasFile: Boolean(spec),
    requirements: spec?.requirements.length ?? 0,
    scenarios: spec?.requirements.reduce((n, r) => n + r.scenarios.length, 0) ?? 0,
    openQuestions: spec?.questions.length ?? 0,
    live,
    plan: brief(plans, events),
    verify: latestVerify(id, events, false),
    loop: loopOf(id, works, events),
  };
}


/** a is a later version than b, comparing x.y.z number by number (0.10.0 > 0.9.0). */
export function newerVersion(a: string, b: string): boolean {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

export function workspaceState(root: string, user: string, now = Date.now(), repo: RepoLink | null = null, running = ""): WorkspaceState {
  const specs = readSpecs(root);
  const events = readEvents(root);
  const sessions = readSessions(root, now);
  const plans = readPlans(root, events, specs, sessions);

  const ids = new Set<string>(specs.keys());
  for (const e of events) if (e.type === "spec.step" && e.spec) ids.add(e.spec);

  const summaries: SpecSummary[] = [];
  const waiting: WaitingItem[] = [];
  for (const id of ids) {
    const spec = specs.get(id);
    const summary = summarize(id, spec, events, sessions, now, plans.filter((p) => p.spec === id));
    if (!summary) continue;
    summaries.push(summary);
    const { live } = summary;
    const sessionWaiting = live.session && (live.session.state === "your_turn" || live.session.state === "waiting");
    if (live.pendingQuestion && (sessionWaiting || !live.session)) {
      waiting.push({ kind: "question", spec: id, text: live.pendingQuestion.text, sessionId: live.session?.id });
    } else if (live.open && live.step === "approval" && sessionWaiting) {
      waiting.push({ kind: "session", spec: id, text: "Waiting for your approval", sessionId: live.session?.id });
    } else if (live.open && live.session?.state === "waiting") {
      waiting.push({ kind: "session", spec: id, text: live.session.message || "Claude needs your input", sessionId: live.session.id });
    }
    for (const q of spec?.questions ?? []) {
      if (user && firstName(q.owner) === firstName(user)) waiting.push({ kind: "owned-question", spec: id, text: `${q.id} ${q.text}` });
    }
  }

  let newest = "";
  for (const e of events) if (e.v && /^\d+(\.\d+)*$/.test(e.v) && (!newest || newerVersion(e.v, newest))) newest = e.v;
  const versionGap = running && newest && newerVersion(newest, running) ? { running, workspace: newest } : null;
  const decisions = waitingDecisions(specs, summaries, plans, events, sessions);
  // Specs waiting on the user first, then the latest activity, then id (spec-order R1, D2).
  const waitingOn = new Set(decisions.map((d) => d.spec));
  summaries.sort((a, b) =>
    Number(waitingOn.has(b.id)) - Number(waitingOn.has(a.id)) || (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "") || a.id.localeCompare(b.id));
  return { workspace: root, user, repo, specs: summaries, waiting, serverTime: new Date(now).toISOString(), versionGap, decisions };
}

/** The status of every listed spec, in order; changes when time alone moves a spec across a boundary (R7.S2). */
export function statusSignature(state: WorkspaceState): string {
  return state.specs.map((s) => `${s.id}:${s.status}`).join("|");
}

export function specDetail(root: string, id: string, now = Date.now()): SpecDetail | null {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return null;
  const specs = readSpecs(root);
  const events = readEvents(root);
  const sessions = readSessions(root, now);
  const spec = specs.get(id) ?? null;
  const plans = readPlans(root, events, specs, sessions).filter((p) => p.spec === id);
  const summary = summarize(id, spec ?? undefined, events, sessions, now, plans);
  if (!summary) return null;
  const activity = events.filter((e) => e.spec === id).slice(-40).reverse();
  const calls = events.filter((e) => e.spec === id && e.type === "decision.recorded" && e.data.call === true)
    .map((e) => ({ id: String(e.data.id ?? ""), text: String(e.data.text ?? ""), by: String(e.data.by ?? "Claude"), ts: e.ts, from: String(e.data.from ?? "") }));
  return { summary, spec, activity, plans, sessions: sessionsFor(events, (e) => e.spec === id, sessions), calls, verify: latestVerify(id, events, true) };
}

/** A cheap fingerprint of everything the UI shows; changes when any of it changes. */
export function fingerprint(root: string): string {
  const parts: string[] = [];
  const add = (p: string) => {
    try { const s = statSync(p); parts.push(`${p}:${s.mtimeMs}:${s.size}`); } catch { parts.push(`${p}:-`); }
  };
  add(join(root, "events.jsonl"));
  for (const d of ["specs", "sessions"]) {
    const dir = join(root, d);
    add(dir);
    if (existsSync(dir)) for (const f of readdirSync(dir)) add(join(dir, f));
  }
  // Plans: work/<NNN>/<file> and work/<NNN>/<vertical>/<file> (plan-view R11.S1).
  const work = join(root, "work");
  add(work);
  if (existsSync(work)) for (const w of readdirSync(work)) {
    const folder = join(work, w);
    if (!isDir(folder)) continue;
    for (const f of readdirSync(folder)) {
      const p = join(folder, f);
      add(p);
      if (isDir(p)) for (const g of readdirSync(p)) add(join(p, g));
    }
  }
  return parts.join("|");
}

export { readPlans } from "./loop.ts";
export { sessionsFor } from "./live.ts";
