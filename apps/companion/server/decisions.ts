// Decisions waiting on the user, each holding up its own spec, and applying the ones the companion may make (spec companion-decisions).

import type { DecisionCard, FactreeEvent, Plan, Session, Spec, SpecSummary } from "../shared/types.ts";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { sessionsFor } from "./live.ts";

const REF = /\b(R\d+(?:\.S\d+)?)\b/g;
const specPath = (s: string) => `/work/${s}/spec`;
const refPath = (s: string, r: string) => `/work/${s}/spec/requirements/${r}`;
const planPath = (s: string, w: string) => `/work/${s}/plan/${w}`;

/** Requirement and scenario ids a text mentions, as links into the spec. */
function refLinks(spec: string, ...texts: string[]): { label: string; href: string }[] {
  const ids = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(REF)) ids.add(m[1]!);
  return [...ids].map((id) => ({ label: id, href: refPath(spec, id) }));
}

function lastEventTs(events: FactreeEvent[], match: (e: FactreeEvent) => boolean): string {
  for (let i = events.length - 1; i >= 0; i--) if (match(events[i]!)) return events[i]!.ts;
  return "";
}

/** The latest change request on a spec or plan made after the card's own latest change (R6). */
function feedbackFor(events: FactreeEvent[], spec: string, work: string | undefined, since: string): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type !== "decision.feedback" || e.spec !== spec) continue;
    if ((e.data.work ? String(e.data.work) : undefined) !== work) continue;
    return e.ts > since ? String(e.data.note ?? "") : undefined;
  }
  return undefined;
}

/** New patterns a plan's designs still need approved: N<n> lines with no "Approved: <who>". */
function pendingPatterns(plan: Plan): { id: string; text: string; href: string }[] {
  const out: { id: string; text: string; href: string }[] = [];
  for (const v of plan.verticals) for (const s of v.design ?? []) {
    if (s.name !== "Patterns") continue;
    for (const b of s.blocks) if (b.t === "list") for (const it of b.items) {
      const m = /^\*\*(N\d+)\s+([^:*]+)/.exec(it.text);
      if (!m || /Approved: (?!<)/.test(it.text)) continue;
      out.push({ id: m[1]!, text: m[2]!.trim(), href: `${planPath(plan.spec, plan.work)}/${v.name}/design/${m[1]}` });
    }
  }
  return out;
}

function draftedLens(plan: Plan): boolean {
  return plan.verticals.some((v) => /lens \(pending approval\)/.test(v.preamble));
}

/** Every decision waiting on the user, oldest first (R2). */
export function waitingDecisions(specs: Map<string, Spec>, summaries: SpecSummary[], plans: Plan[], events: FactreeEvent[], sessions: Session[]): DecisionCard[] {
  const cards: DecisionCard[] = [];
  const specSession = (id: string) => sessionsFor(events, (e) => e.spec === id, sessions)[0] ?? null;
  const planSession = (w: string) => sessionsFor(events, (e) => e.work === w, sessions)[0] ?? null;
  const asked = new Map<string, string[]>();
  for (const e of events) if (e.type === "question.asked" && e.spec && Array.isArray(e.data.options)) asked.set(`${e.spec}:${String(e.data.n)}`, (e.data.options as unknown[]).map(String));

  for (const s of summaries) {
    const spec = specs.get(s.id);
    for (const q of s.live.pending) {
      cards.push({
        id: `q:${s.id}:${q.n}`, kind: "question", spec: s.id, n: q.n, title: q.text, why: q.why,
        recommendation: q.proposal || undefined, options: asked.get(`${s.id}:${q.n}`) ?? [],
        links: [{ label: s.id, href: specPath(s.id) }, ...refLinks(s.id, q.text, q.why, q.proposal)],
        since: q.askedAt, session: specSession(s.id), approvable: true,
      });
    }
    // A draft spec with a file waits for approval once nothing is being written on it.
    if (spec && spec.status === "draft" && (!s.live.open || s.live.step === "approval")) {
      const since = lastEventTs(events, (e) => e.spec === s.id) || spec.updated;
      const open = s.live.pending[0];
      cards.push({
        id: `spec:${s.id}`, kind: "spec", spec: s.id, title: `Approve spec: ${spec.title}`,
        why: `${spec.requirements.length} requirements, ${s.scenarios} scenarios`,
        options: [], links: [{ label: "Spec", href: specPath(s.id) }], since, session: specSession(s.id),
        approvable: !open, blockedReason: open ? `Answer question ${open.n} first` : undefined,
        feedback: feedbackFor(events, s.id, undefined, since),
      });
    }
  }

  for (const p of plans) {
    if (p.status !== "approved") {
      const patterns = pendingPatterns(p);
      const lens = draftedLens(p);
      const tasks = p.verticals.reduce((n, v) => n + (v.tasks?.length ?? 0), 0);
      const since = lastEventTs(events, (e) => e.work === p.work);
      cards.push({
        id: `plan:${p.work}`, kind: "plan", spec: p.spec, work: p.work, title: `Approve plan ${p.work}`,
        why: `${tasks} tasks in ${p.verticals.map((v) => v.name).join(", ")}${patterns.length ? `; ${patterns.length} new pattern${patterns.length > 1 ? "s" : ""}` : ""}`,
        options: [], newPatterns: patterns,
        links: [{ label: "Plan", href: planPath(p.spec, p.work) }, ...patterns.map((x) => ({ label: x.id, href: x.href }))],
        since, session: planSession(p.work), approvable: !lens,
        blockedReason: lens ? "A drafted lens needs approval in Claude" : undefined,
        feedback: feedbackFor(events, p.spec, p.work, since),
      });
    }
    for (const [task, b] of Object.entries(p.build)) {
      if (b.status !== "failed" && b.status !== "blocked") continue;
      const v = p.verticals.find((x) => (x.tasks ?? []).some((t) => t.id === task));
      const since = lastEventTs(events, (e) => e.work === p.work && String(e.data.task ?? "") === task);
      cards.push({
        id: `task:${p.work}:${task}`, kind: "task", spec: p.spec, work: p.work, title: `${task} ${b.status}: ${b.reason ?? ""}`,
        why: b.status === "blocked" ? "The build stopped this task and needs a decision in the spec or plan." : "The build couldn't land this task.",
        recommendation: /over budget/.test(b.reason ?? "") ? "Split the task with /factree:plan" : b.status === "blocked" ? "Resolve it in Claude, then rerun /factree:build" : undefined,
        options: [], links: [{ label: task, href: `${planPath(p.spec, p.work)}/${v?.name ?? "general"}/tasks/${task}` }],
        since, session: planSession(p.work), approvable: false, blockedReason: "Needs Claude",
      });
    }
  }
  // Lessons proposed at the end of a run and not yet approved or rejected, one card per lesson (self-improving R7, R8).
  const settled = new Set<string>();
  const lessons = new Map<string, FactreeEvent>();
  for (const e of events) {
    const key = String(e.data.key ?? "");
    if (!key) continue;
    if (e.type === "lesson.approved" || e.type === "lesson.rejected") settled.add(key);
    else if (e.type === "lesson.proposed" && e.spec) lessons.set(key, e);
  }
  for (const [key, e] of lessons) {
    if (settled.has(key)) continue;
    const spec = e.spec!;
    const evidence = Array.isArray(e.data.evidence) ? e.data.evidence.length : 0;
    cards.push({
      id: `lesson:${key}`, kind: "lesson", spec, title: String(e.data.text ?? key),
      why: `Learned from ${evidence} time${evidence === 1 ? "" : "s"} this happened`,
      options: [], links: [{ label: spec, href: specPath(spec) }], since: e.ts, session: specSession(spec), approvable: true,
      lesson: { key, file: String(e.data.file ?? ""), change: String(e.data.change ?? ""), evidence },
    });
  }
  return cards.sort((a, b) => a.since.localeCompare(b.since));
}

// ---------- Applying a decision from the companion (R3–R6, R10) ----------

export type DecisionRequest =
  | { kind: "answer"; spec: string; n: number; answer: string }
  | { kind: "approve-spec"; spec: string }
  | { kind: "approve-plan"; work: string }
  | { kind: "feedback"; spec: string; work?: string; note: string }
  | { kind: "approve-lesson" | "reject-lesson"; spec: string; key: string };

const here = dirname(fileURLToPath(import.meta.url));
const script = (name: string) => [join(here, "..", "scripts", name), join(here, "..", "..", "..", "plugins", "factree", "scripts", name)].find((p) => existsSync(p)) ?? "";
const EVENT_SH = script("event.sh");
const STATE_SH = script("state.sh");

/** Make a move through state.sh, the one writer of status (status-state R7): refused is 409, a held lock 503. */
function stateMove(root: string, spec: string, move: string, fields: string[] = []) {
  const env: NodeJS.ProcessEnv = { ...process.env, FACTREE_HOME: root };
  delete env.CLAUDE_CODE_SESSION_ID;
  try {
    execFileSync("bash", [STATE_SH, spec, move, ...fields], { env, cwd: dirname(root), stdio: "pipe" });
  } catch (e) {
    const err = e as { status?: number; stderr?: Buffer; stdout?: Buffer };
    const msg = (String(err.stderr ?? "").trim() || String(err.stdout ?? "").trim() || `${move} failed`).split("\n")[0]!;
    throw new DecisionError(err.status === 4 ? 503 : err.status === 3 ? 409 : 500, msg);
  }
}

/** Log through event.sh, so there's one event format, as the companion rather than any Claude session. */
function logEvent(root: string, type: string, subject: string, data: Record<string, unknown>) {
  const env: NodeJS.ProcessEnv = { ...process.env, FACTREE_HOME: root };
  delete env.CLAUDE_CODE_SESSION_ID;
  execFileSync("bash", [EVENT_SH, type, subject, JSON.stringify(data)], { env, cwd: dirname(root), stdio: "ignore" });
}

/** Set front matter fields of a markdown file, replacing or adding each one. */
function setFrontMatter(path: string, fields: Record<string, string>) {
  const lines = readFileSync(path, "utf8").split("\n");
  if (lines[0] !== "---") throw new Error(`${path} has no front matter`);
  const end = lines.indexOf("---", 1);
  const left = new Set(Object.keys(fields));
  for (let i = 1; i < end; i++) {
    const k = /^([a-z_]+):/.exec(lines[i]!)?.[1];
    if (k && left.has(k)) { lines[i] = `${k}: ${fields[k]}`; left.delete(k); }
  }
  lines.splice(end, 0, ...[...left].map((k) => `${k}: ${fields[k]}`));
  writeFileSync(path, lines.join("\n"));
}

/** The front matter value of a key, or "" when it is missing or empty. */
function frontValue(path: string, key: string): string {
  const lines = readFileSync(path, "utf8").split("\n");
  if (lines[0] !== "---") return "";
  const end = lines.indexOf("---", 1);
  for (let i = 1; i < end; i++) { const m = new RegExp(`^${key}:[ ]*(.*)$`).exec(lines[i]!); if (m) return m[1]!.trim(); }
  return "";
}

/** Set only the fields still missing, so a retry after a failed write completes the rest and changes nothing else. */
function setMissing(path: string, fields: Record<string, string>): boolean {
  const need = Object.fromEntries(Object.entries(fields).filter(([k]) => !frontValue(path, k)));
  if (Object.keys(need).length) setFrontMatter(path, need);
  return Object.keys(need).length > 0;
}

export class DecisionError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Check a request may write at all (R10): POST, from this machine's companion page, with its header. */
export function checkDecisionRequest(method: string, headers: Record<string, string | string[] | undefined>, host: string): void {
  if (method !== "POST") throw new DecisionError(405, "POST only");
  if (host !== "localhost" && host !== "127.0.0.1") throw new DecisionError(403, "Local only");
  const origin = String(headers.origin ?? "");
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) throw new DecisionError(403, "Wrong origin");
  if (headers["x-factree"] !== "decide") throw new DecisionError(403, "Missing X-Factree header");
}

/** Apply one decision the companion may make, and nothing else (R3–R6, R10). */
export function applyDecision(root: string, user: string, body: unknown, cards: DecisionCard[], today = new Date().toISOString().slice(0, 10)): void {
  const b = (body ?? {}) as Record<string, unknown>;
  const by = user || "someone";
  const via = { by, via: "companion" };
  const str = (k: string, max = 500) => { const v = b[k]; if (typeof v !== "string" || !v.trim() || v.length > max) throw new DecisionError(400, `Bad ${k}`); return v.trim(); };
  const slug = (k: string) => { const v = str(k, 80); if (!/^[a-z0-9][\w.-]*$/.test(v)) throw new DecisionError(400, `Bad ${k}`); return v; };
  switch (b.kind) {
    case "answer": {
      const spec = slug("spec"), n = Number(b.n), answer = str("answer");
      if (!cards.some((c) => c.kind === "question" && c.spec === spec && c.n === n)) throw new DecisionError(409, `Question ${n} on ${spec} isn't waiting`);
      logEvent(root, "question.answered", spec, { n, answer, ...via });
      return;
    }
    case "approve-spec": {
      const spec = slug("spec");
      const card = cards.find((c) => c.kind === "spec" && c.spec === spec);
      const file = join(root, "specs", `${spec}.md`);
      // Approved already: answering again is fine, and fills in approval fields a failed write left out.
      const done = !card && existsSync(file) && frontValue(file, "status") === "approved";
      if (!card && !done) throw new DecisionError(409, `${spec} isn't waiting for approval`);
      if (card && !card.approvable) throw new DecisionError(409, card.blockedReason ?? "Not approvable here");
      // Sets status, approved_by and approved_at (a fresh approval replaces an older one's names, an already approved one
      // only fills what is missing) and logs spec.approved.
      stateMove(root, spec, "approve", [`by=${by}`, "via=companion", `at=${today}`]);
      return;
    }
    case "approve-plan": {
      const work = slug("work");
      const card = cards.find((c) => c.kind === "plan" && c.work === work);
      const dir = join(root, "work", work);
      const head = join(dir, "plan.md");
      // A plan approved already has no card; answering it again is fine and fills in what a failed write left out.
      const done = !card && existsSync(head) && frontValue(head, "status") === "approved";
      if (!card && !done) throw new DecisionError(409, `${work} isn't waiting for approval`);
      if (card && !card.approvable) throw new DecisionError(409, card.blockedReason ?? "Not approvable here");
      if (!existsSync(head)) throw new DecisionError(409, "Only plans split by vertical can be approved here");
      const name = `${by} (via companion)`;
      const tasks = Number(card?.why.match(/^(\d+) tasks/)?.[1] ?? 0);
      stateMove(root, card?.spec ?? frontValue(head, "spec"), "plan-approve", [`work=${work}`, `by=${by}`, "via=companion", `at=${today}`, `tasks=${tasks}`]);   // sets status, logs plan.approved
      for (const v of readdirSync(dir)) {
        const d = join(dir, v, "design.md");
        if (existsSync(d)) writeFileSync(d, readFileSync(d, "utf8").replace(/Approved: <pending>/g, `Approved: ${name}, ${today}`));
      }
      const fields = { design_approved_by: name, design_approved_at: today };   // approved_by/at: state.sh, above
      if (card) setFrontMatter(head, fields);
      if (card || setMissing(head, fields)) logEvent(root, "plan.design_approved", work, { ...via, new_patterns: (card?.newPatterns ?? []).map((p) => p.id) });
      return;
    }
    case "feedback": {
      const spec = slug("spec"), note = str("note", 300);
      const work = b.work === undefined ? undefined : slug("work");
      if (!cards.some((c) => c.spec === spec && (work === undefined || c.work === work))) throw new DecisionError(409, "Nothing on that is waiting");
      // A change request on an approved spec sends it back to writing (status-state R7).
      const sf = join(root, "specs", `${spec}.md`);
      if (work === undefined && existsSync(sf) && /^status:\s*approved\b/m.test(readFileSync(sf, "utf8").split(/\n---\n/)[0]!)) stateMove(root, spec, "edit");
      logEvent(root, "decision.feedback", spec, { note, ...(work ? { work } : {}), ...via });
      return;
    }
    case "approve-lesson":
    case "reject-lesson": {
      // The companion records the decision; Claude writes an approved lesson to its file (self-improving R8).
      const spec = slug("spec"), key = str("key", 200);
      if (!cards.some((c) => c.kind === "lesson" && c.spec === spec && c.lesson?.key === key)) throw new DecisionError(409, `Lesson ${key} isn't waiting`);
      logEvent(root, b.kind === "approve-lesson" ? "lesson.approved" : "lesson.rejected", spec, { key, ...via });
      return;
    }
    default:
      throw new DecisionError(400, "Unknown decision");
  }
}
