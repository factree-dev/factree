import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { userInfo } from "node:os";
// shared/config.ts
var DEFAULT_PORT = 4747;
var LIVE_WINDOW_MS = 216e5;
// shared/names.ts
/** The first word of a name, lower-cased, to match an owner to the user ("John Doe" and "john"). */
function firstName(name) {
	return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}
// server/live.ts
/** Sessions that logged matching events, newest first, each with its last event time (spec-sessions R2–R4). */
var STEPS = [
	"gaps",
	"observe",
	"questions",
	"writing",
	"checking",
	"approval"
];
function sessionsFor(events, match, live = []) {
	const last = /* @__PURE__ */ new Map();
	for (const e of events) if (e.session && match(e)) last.set(e.session, e.ts);
	const states = new Map(live.map((s) => [s.id, s.state]));
	return [...last].map(([id, ts]) => ({
		id,
		last: ts,
		state: refState(states.get(id))
	})).sort((a, b) => b.last.localeCompare(a.last));
}
function refState(s) {
	if (s === "working" || s === "waiting" || s === "ended") return s;
	if (s === "your_turn" || s === "idle") return "your_turn";
	return "unknown";
}
function within(child, parent) {
	return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}
/** The session that most likely ran an event: same or enclosing folder, active around that time. */
function sessionFor(cwd, sessions) {
	if (!cwd) return null;
	return sessions.filter((s) => s.cwd && (within(cwd, s.cwd) || within(s.cwd, cwd)))[0] ?? null;
}
function liveFor(specId, spec, events, sessions, now = Date.now()) {
	const mine = events.filter((e) => e.spec === specId);
	const lastApproval = [...mine].reverse().find((e) => e.type === "spec.approved");
	const runEvents = mine.filter((e) => !lastApproval || e.ts > lastApproval.ts);
	const stepEvents = runEvents.filter((e) => e.type === "spec.step");
	const lastStep = stepEvents[stepEvents.length - 1];
	const lastAny = runEvents[runEvents.length - 1];
	const recent = lastAny ? now - Date.parse(lastAny.ts) < LIVE_WINDOW_MS : false;
	const open = Boolean(lastStep) && recent;
	const asked = /* @__PURE__ */ new Map();
	for (const e of runEvents) {
		const n = Number(e.data.n);
		if (!Number.isFinite(n)) continue;
		if (e.type === "question.asked") asked.set(n, {
			n,
			text: String(e.data.text ?? ""),
			why: String(e.data.why ?? ""),
			proposal: String(e.data.proposal ?? ""),
			askedAt: e.ts
		});
		else if (e.type === "question.answered") {
			const q = asked.get(n);
			if (q) q.answer = String(e.data.answer ?? "");
		}
	}
	const all = [...asked.values()].sort((a, b) => a.n - b.n);
	const pending = open ? [...all].reverse().find((q) => q.answer === void 0) ?? null : null;
	const steps = stepEvents.map((e) => ({
		step: String(e.data.step ?? ""),
		note: String(e.data.note ?? ""),
		at: e.ts
	})).filter((s) => STEPS.includes(s.step));
	const step = open && lastStep ? String(lastStep.data.step ?? "") : null;
	return {
		open,
		step: step && STEPS.includes(step) ? step : null,
		stepNote: open && lastStep ? String(lastStep.data.note ?? "") : "",
		steps: open ? steps : [],
		pendingQuestion: pending,
		pending: open ? all.filter((q) => q.answer === void 0) : [],
		answered: open ? all.filter((q) => q.answer !== void 0) : [],
		session: open ? sessionFor(lastAny?.cwd, sessions) : null
	};
}
/** What the UI shows for a spec (spec-status R2–R5). With a recorded stage (status-state R5, D5), live activity only
*  says whether a writing spec needs you, is being written or is paused; it never changes an approved one. */
function displayStatus(fileStatus, live, lastMoved, now, stage) {
	if (stage === "approved") return fileStatus === "live" ? "live" : "approved";
	if (live.open || stage === "writing") {
		const working = live.session?.state === "working";
		if ((live.pendingQuestion || live.step === "approval" || live.session?.state === "waiting") && !working) return "needs_you";
		if (lastMoved !== null && now - Date.parse(lastMoved) < 6e5 || working) return "writing";
	}
	if (stage === "writing") return "paused";
	return stage ? "draft" : fileStatus ?? "draft";
}
var WRITING_STEP = {
	gaps: "finding gaps",
	observe: "reading the code",
	questions: "asking questions",
	writing: "",
	checking: "checking",
	approval: "finishing"
};
var STAGE_LABEL = {
	plan: ["plan", "Planning"],
	build: ["build", "Building"],
	"self-review": ["build", "Probing the branch"],
	verify: ["verify", "Verifying"],
	review: ["review", "Opening the pull request"]
};
var ENDS = /* @__PURE__ */ new Set([
	"spec.approved",
	"plan.approved",
	"task.failed",
	"task.blocked",
	"spec.verified",
	"review.opened",
	"branch.reviewed"
]);
/** What's running on a spec now: the newest progress event that nothing has ended since (live-activity R1–R3). */
function activityOf(id, events, plans, now) {
	const works = new Set(plans.map((p) => p.work));
	let cur = null;
	let before = null;
	const builders = /* @__PURE__ */ new Set(), reviewers = /* @__PURE__ */ new Set();
	let probing = false;
	const idle = () => {
		cur = null;
		before = null;
		builders.clear();
		reviewers.clear();
		probing = false;
	};
	for (const e of events) {
		if (e.spec !== id && !(e.work && works.has(e.work))) continue;
		if (ENDS.has(e.type) || e.type === "plan.implemented" && !probing) {
			idle();
			continue;
		}
		if (e.type === "plan.implemented") continue;
		if (e.type === "agent.started") {
			const task = String(e.data.task ?? ""), role = String(e.data.role ?? "");
			if (role === "review" && task === "branch") probing = true;
			else if (role === "review") {
				builders.delete(task);
				reviewers.add(task);
			} else if (role === "build") {
				reviewers.delete(task);
				builders.add(task);
			} else continue;
			if (!cur?.asking) cur = {
				stage: "build",
				label: "Building",
				step: "",
				since: e.ts,
				paused: false,
				asking: false
			};
			continue;
		}
		if (e.type === "spec.step") cur = {
			stage: "spec",
			label: "Writing",
			step: WRITING_STEP[String(e.data.step)] ?? "",
			since: e.ts,
			paused: false,
			asking: false
		};
		else if (e.type === "stage.step") {
			const [stage, label] = e.data.stage === "verify" ? [] : STAGE_LABEL[String(e.data.stage)] ?? [];
			if (e.data.stage === "self-review") probing = true;
			if (stage && label) cur = {
				stage,
				label,
				step: e.data.stage === "review" ? "" : String(e.data.step ?? ""),
				since: e.ts,
				paused: false,
				asking: false
			};
		} else if (e.type === "task.started" || e.type === "task.done") {
			const t = String(e.data.task ?? "");
			if (e.type === "task.done") {
				builders.delete(t);
				reviewers.delete(t);
			}
			if (!cur || !probing) cur = {
				stage: "build",
				label: "Building",
				step: "",
				since: e.ts,
				paused: false,
				asking: false
			};
		} else if (e.type === "question.asked" && cur) {
			before = cur.asking ? before : cur;
			cur = {
				...cur,
				label: "Asking you",
				step: "",
				since: e.ts,
				asking: true
			};
		} else if (e.type === "question.answered" && cur?.asking && before) {
			cur = {
				...before,
				since: e.ts
			};
			before = null;
		}
	}
	if (!cur) return null;
	const list = (x) => [...x].sort().join(", ");
	if (!cur.asking && cur.stage === "build") {
		if (probing) {
			cur.label = "Probing the branch";
			cur.step = "";
		} else if (builders.size) {
			cur.label = "Building";
			cur.step = list(builders) + (reviewers.size ? ` · Reviewing ${list(reviewers)}` : "");
		} else if (reviewers.size) {
			cur.label = "Reviewing";
			cur.step = list(reviewers);
		}
	}
	if (cur.label === "Building" && !cur.step) {
		const p = plans[0];
		const running = p ? Object.entries(p.build).find(([, b]) => b.status === "running")?.[0] : void 0;
		if (p && running) cur.step = `${running} of ${Object.keys(p.build).length}`;
	}
	cur.paused = !cur.asking && now - Date.parse(cur.since) > 6e5;
	return cur;
}
// server/decisions.ts
var REF = /\b(R\d+(?:\.S\d+)?)\b/g;
var specPath$1 = (s) => `/work/${s}/spec`;
var refPath = (s, r) => `/work/${s}/spec/requirements/${r}`;
var planPath = (s, w) => `/work/${s}/plan/${w}`;
/** Requirement and scenario ids a text mentions, as links into the spec. */
function refLinks(spec, ...texts) {
	const ids = /* @__PURE__ */ new Set();
	for (const t of texts) for (const m of t.matchAll(REF)) ids.add(m[1]);
	return [...ids].map((id) => ({
		label: id,
		href: refPath(spec, id)
	}));
}
function lastEventTs(events, match) {
	for (let i = events.length - 1; i >= 0; i--) if (match(events[i])) return events[i].ts;
	return "";
}
/** The latest change request on a spec or plan made after the card's own latest change (R6). */
function feedbackFor(events, spec, work, since) {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e.type !== "decision.feedback" || e.spec !== spec) continue;
		if ((e.data.work ? String(e.data.work) : void 0) !== work) continue;
		return e.ts > since ? String(e.data.note ?? "") : void 0;
	}
}
/** New patterns a plan's designs still need approved: N<n> lines with no "Approved: <who>". */
function pendingPatterns(plan) {
	const out = [];
	for (const v of plan.verticals) for (const s of v.design ?? []) {
		if (s.name !== "Patterns") continue;
		for (const b of s.blocks) if (b.t === "list") for (const it of b.items) {
			const m = /^\*\*(N\d+)\s+([^:*]+)/.exec(it.text);
			if (!m || /Approved: (?!<)/.test(it.text)) continue;
			out.push({
				id: m[1],
				text: m[2].trim(),
				href: `${planPath(plan.spec, plan.work)}/${v.name}/design/${m[1]}`
			});
		}
	}
	return out;
}
function draftedLens(plan) {
	return plan.verticals.some((v) => /lens \(pending approval\)/.test(v.preamble));
}
/** Every decision waiting on the user, oldest first (R2). */
function waitingDecisions(specs, summaries, plans, events, sessions) {
	const cards = [];
	const specSession = (id) => sessionsFor(events, (e) => e.spec === id, sessions)[0] ?? null;
	const planSession = (w) => sessionsFor(events, (e) => e.work === w, sessions)[0] ?? null;
	const asked = /* @__PURE__ */ new Map();
	for (const e of events) if (e.type === "question.asked" && e.spec && Array.isArray(e.data.options)) asked.set(`${e.spec}:${String(e.data.n)}`, e.data.options.map(String));
	for (const s of summaries) {
		const spec = specs.get(s.id);
		for (const q of s.live.pending) cards.push({
			id: `q:${s.id}:${q.n}`,
			kind: "question",
			spec: s.id,
			n: q.n,
			title: q.text,
			why: q.why,
			recommendation: q.proposal || void 0,
			options: asked.get(`${s.id}:${q.n}`) ?? [],
			links: [{
				label: s.id,
				href: specPath$1(s.id)
			}, ...refLinks(s.id, q.text, q.why, q.proposal)],
			since: q.askedAt,
			session: specSession(s.id),
			approvable: true
		});
		if (spec && spec.status === "draft" && (!s.live.open || s.live.step === "approval")) {
			const since = lastEventTs(events, (e) => e.spec === s.id) || spec.updated;
			const open = s.live.pending[0];
			cards.push({
				id: `spec:${s.id}`,
				kind: "spec",
				spec: s.id,
				title: `Approve spec: ${spec.title}`,
				why: `${spec.requirements.length} requirements, ${s.scenarios} scenarios`,
				options: [],
				links: [{
					label: "Spec",
					href: specPath$1(s.id)
				}],
				since,
				session: specSession(s.id),
				approvable: !open,
				blockedReason: open ? `Answer question ${open.n} first` : void 0,
				feedback: feedbackFor(events, s.id, void 0, since)
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
				id: `plan:${p.work}`,
				kind: "plan",
				spec: p.spec,
				work: p.work,
				title: `Approve plan ${p.work}`,
				why: `${tasks} tasks in ${p.verticals.map((v) => v.name).join(", ")}${patterns.length ? `; ${patterns.length} new pattern${patterns.length > 1 ? "s" : ""}` : ""}`,
				options: [],
				newPatterns: patterns,
				links: [{
					label: "Plan",
					href: planPath(p.spec, p.work)
				}, ...patterns.map((x) => ({
					label: x.id,
					href: x.href
				}))],
				since,
				session: planSession(p.work),
				approvable: !lens,
				blockedReason: lens ? "A drafted lens needs approval in Claude" : void 0,
				feedback: feedbackFor(events, p.spec, p.work, since)
			});
		}
		for (const [task, b] of Object.entries(p.build)) {
			if (b.status !== "failed" && b.status !== "blocked") continue;
			const v = p.verticals.find((x) => (x.tasks ?? []).some((t) => t.id === task));
			const since = lastEventTs(events, (e) => e.work === p.work && String(e.data.task ?? "") === task);
			cards.push({
				id: `task:${p.work}:${task}`,
				kind: "task",
				spec: p.spec,
				work: p.work,
				title: `${task} ${b.status}: ${b.reason ?? ""}`,
				why: b.status === "blocked" ? "The build stopped this task and needs a decision in the spec or plan." : "The build couldn't land this task.",
				recommendation: /over budget/.test(b.reason ?? "") ? "Split the task with /factree:plan" : b.status === "blocked" ? "Resolve it in Claude, then rerun /factree:build" : void 0,
				options: [],
				links: [{
					label: task,
					href: `${planPath(p.spec, p.work)}/${v?.name ?? "general"}/tasks/${task}`
				}],
				since,
				session: planSession(p.work),
				approvable: false,
				blockedReason: "Needs Claude"
			});
		}
	}
	const settled = /* @__PURE__ */ new Set();
	const lessons = /* @__PURE__ */ new Map();
	for (const e of events) {
		const key = String(e.data.key ?? "");
		if (!key) continue;
		if (e.type === "lesson.approved" || e.type === "lesson.rejected") settled.add(key);
		else if (e.type === "lesson.proposed" && e.spec) lessons.set(key, e);
	}
	for (const [key, e] of lessons) {
		if (settled.has(key)) continue;
		const spec = e.spec;
		const evidence = Array.isArray(e.data.evidence) ? e.data.evidence.length : 0;
		cards.push({
			id: `lesson:${key}`,
			kind: "lesson",
			spec,
			title: String(e.data.text ?? key),
			why: `Learned from ${evidence} time${evidence === 1 ? "" : "s"} this happened`,
			options: [],
			links: [{
				label: spec,
				href: specPath$1(spec)
			}],
			since: e.ts,
			session: specSession(spec),
			approvable: true,
			lesson: {
				key,
				file: String(e.data.file ?? ""),
				change: String(e.data.change ?? ""),
				evidence
			}
		});
	}
	return cards.sort((a, b) => a.since.localeCompare(b.since));
}
var here$1 = dirname(fileURLToPath(import.meta.url));
var EVENT_SH = [join(here$1, "..", "scripts", "event.sh"), join(here$1, "..", "..", "..", "plugins", "factree", "scripts", "event.sh")].find((p) => existsSync(p)) ?? "";
/** Log through event.sh, so there's one event format, as the companion rather than any Claude session. */
function logEvent(root, type, subject, data) {
	const env = {
		...process.env,
		FACTREE_HOME: root
	};
	delete env.CLAUDE_CODE_SESSION_ID;
	execFileSync("bash", [
		EVENT_SH,
		type,
		subject,
		JSON.stringify(data)
	], {
		env,
		cwd: dirname(root),
		stdio: "ignore"
	});
}
/** Set front matter fields of a markdown file, replacing or adding each one. */
function setFrontMatter(path, fields) {
	const lines = readFileSync(path, "utf8").split("\n");
	if (lines[0] !== "---") throw new Error(`${path} has no front matter`);
	const end = lines.indexOf("---", 1);
	const left = new Set(Object.keys(fields));
	for (let i = 1; i < end; i++) {
		const k = /^([a-z_]+):/.exec(lines[i])?.[1];
		if (k && left.has(k)) {
			lines[i] = `${k}: ${fields[k]}`;
			left.delete(k);
		}
	}
	lines.splice(end, 0, ...[...left].map((k) => `${k}: ${fields[k]}`));
	writeFileSync(path, lines.join("\n"));
}
var DecisionError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
	}
};
/** Check a request may write at all (R10): POST, from this machine's companion page, with its header. */
function checkDecisionRequest(method, headers, host) {
	if (method !== "POST") throw new DecisionError(405, "POST only");
	if (host !== "localhost" && host !== "127.0.0.1") throw new DecisionError(403, "Local only");
	const origin = String(headers.origin ?? "");
	if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) throw new DecisionError(403, "Wrong origin");
	if (headers["x-factree"] !== "decide") throw new DecisionError(403, "Missing X-Factree header");
}
/** Apply one decision the companion may make, and nothing else (R3–R6, R10). */
function applyDecision(root, user, body, cards, today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) {
	const b = body ?? {};
	const by = user || "someone";
	const via = {
		by,
		via: "companion"
	};
	const str = (k, max = 500) => {
		const v = b[k];
		if (typeof v !== "string" || !v.trim() || v.length > max) throw new DecisionError(400, `Bad ${k}`);
		return v.trim();
	};
	const slug = (k) => {
		const v = str(k, 80);
		if (!/^[a-z0-9][\w.-]*$/.test(v)) throw new DecisionError(400, `Bad ${k}`);
		return v;
	};
	switch (b.kind) {
		case "answer": {
			const spec = slug("spec"), n = Number(b.n), answer = str("answer");
			if (!cards.some((c) => c.kind === "question" && c.spec === spec && c.n === n)) throw new DecisionError(409, `Question ${n} on ${spec} isn't waiting`);
			logEvent(root, "question.answered", spec, {
				n,
				answer,
				...via
			});
			return;
		}
		case "approve-spec": {
			const spec = slug("spec");
			const card = cards.find((c) => c.kind === "spec" && c.spec === spec);
			if (!card) throw new DecisionError(409, `${spec} isn't waiting for approval`);
			if (!card.approvable) throw new DecisionError(409, card.blockedReason ?? "Not approvable here");
			setFrontMatter(join(root, "specs", `${spec}.md`), {
				status: "approved",
				approved_by: `${by} (via companion)`,
				approved_at: today
			});
			logEvent(root, "spec.approved", spec, via);
			return;
		}
		case "approve-plan": {
			const work = slug("work");
			const card = cards.find((c) => c.kind === "plan" && c.work === work);
			if (!card) throw new DecisionError(409, `${work} isn't waiting for approval`);
			if (!card.approvable) throw new DecisionError(409, card.blockedReason ?? "Not approvable here");
			const dir = join(root, "work", work);
			if (!existsSync(join(dir, "plan.md"))) throw new DecisionError(409, "Only plans split by vertical can be approved here");
			const name = `${by} (via companion)`;
			for (const v of readdirSync(dir)) {
				const d = join(dir, v, "design.md");
				if (existsSync(d)) writeFileSync(d, readFileSync(d, "utf8").replace(/Approved: <pending>/g, `Approved: ${name}, ${today}`));
			}
			setFrontMatter(join(dir, "plan.md"), {
				status: "approved",
				design_approved_by: name,
				design_approved_at: today,
				approved_by: name,
				approved_at: today
			});
			const tasks = Number(card.why.match(/^(\d+) tasks/)?.[1] ?? 0);
			logEvent(root, "plan.design_approved", work, {
				...via,
				new_patterns: (card.newPatterns ?? []).map((p) => p.id)
			});
			logEvent(root, "plan.approved", work, {
				...via,
				tasks
			});
			return;
		}
		case "feedback": {
			const spec = slug("spec"), note = str("note", 300);
			const work = b.work === void 0 ? void 0 : slug("work");
			if (!cards.some((c) => c.spec === spec && (work === void 0 || c.work === work))) throw new DecisionError(409, "Nothing on that is waiting");
			logEvent(root, "decision.feedback", spec, {
				note,
				...work ? { work } : {},
				...via
			});
			return;
		}
		case "approve-lesson":
		case "reject-lesson": {
			const spec = slug("spec"), key = str("key", 200);
			if (!cards.some((c) => c.kind === "lesson" && c.spec === spec && c.lesson?.key === key)) throw new DecisionError(409, `Lesson ${key} isn't waiting`);
			logEvent(root, b.kind === "approve-lesson" ? "lesson.approved" : "lesson.rejected", spec, {
				key,
				...via
			});
			return;
		}
		default: throw new DecisionError(400, "Unknown decision");
	}
}
// server/parse-spec.ts
function parseFrontMatter(text) {
	const problems = [];
	const lines = text.split(/\r?\n/);
	if (lines[0] !== "---") return {
		fm: {},
		body: text,
		problems: ["No front matter"]
	};
	const fm = {};
	let current = null;
	let i = 1;
	for (; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (line === "---") break;
		const item = /^\s+-\s+(.*)$/.exec(line);
		if (item && current) {
			const prev = fm[current];
			const list = Array.isArray(prev) ? prev : prev ? [prev] : [];
			list.push(clean(item[1] ?? ""));
			fm[current] = list;
			continue;
		}
		const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
		if (kv) {
			current = kv[1] ?? null;
			let value = stripComment(kv[2] ?? "");
			if (current) {
				if (/^\[.*\]$/.test(value)) fm[current] = value.slice(1, -1).split(",").map(clean).filter(Boolean);
				else fm[current] = clean(value);
			}
		}
	}
	if (i >= lines.length) problems.push("Front matter is not closed with ---");
	return {
		fm,
		body: lines.slice(i + 1).join("\n"),
		problems
	};
}
function stripComment(v) {
	return v.replace(/\s+#.*$/, "").trim();
}
function clean(v) {
	return v.trim().replace(/^["']|["']$/g, "");
}
function str$1(fm, key) {
	const v = fm[key];
	return Array.isArray(v) ? v.join(", ") : v ?? "";
}
function list$1(fm, key) {
	const v = fm[key];
	if (Array.isArray(v)) return v;
	return v ? [v] : [];
}
/** Split the body into `## Section` blocks. */
function sections(body) {
	const out = /* @__PURE__ */ new Map();
	let name = "";
	for (const line of body.split(/\r?\n/)) {
		const h = /^## (.+)$/.exec(line);
		if (h) {
			name = (h[1] ?? "").trim();
			out.set(name, []);
			continue;
		}
		if (name) out.get(name)?.push(line);
	}
	return out;
}
function isPlaceholder(line) {
	const t = line.trim();
	return t === "" || t.startsWith("<!--") || /^none yet\.?$/i.test(t) || /^none\.?$/i.test(t);
}
function bullets(lines) {
	const out = [];
	for (const line of lines) if (/^- /.test(line)) out.push(line.slice(2).trim());
	else if (/^\s{2,}\S/.test(line) && out.length) out[out.length - 1] += " " + line.trim();
	return out;
}
function parseObservations(lines) {
	return bullets(lines).flatMap((b) => {
		const m = /^(O\d+)\s+(.*)$/.exec(b);
		return m ? [{
			id: m[1] ?? "",
			text: m[2] ?? ""
		}] : [];
	});
}
function parseDecisions(lines) {
	return bullets(lines).flatMap((b) => {
		const m = /^(D\d+)\s+(.*)$/.exec(b);
		if (!m) return [];
		let text = m[2] ?? "";
		let who = "";
		let date = "";
		const tail = /\((\d{4}-\d{2}-\d{2}),\s*([^)]+)\)\s*$/.exec(text);
		if (tail) {
			date = tail[1] ?? "";
			who = (tail[2] ?? "").trim();
			text = text.slice(0, tail.index).trim();
		}
		const superseded = /~~/.test(text) || /Superseded by/i.test(text);
		const resolves = [...text.matchAll(/Resolves (Q\d+)/g)].map((r) => r[1] ?? "");
		return [{
			id: m[1] ?? "",
			text,
			who,
			date,
			resolves,
			superseded
		}];
	});
}
function parseQuestions(lines) {
	return bullets(lines).flatMap((b) => {
		const m = /^(Q\d+)\s+(.*)$/.exec(b);
		if (!m) return [];
		let text = m[2] ?? "";
		const owner = /Owner:\s*([^.]+)\./.exec(text)?.[1]?.trim() ?? "";
		const blocks = (/Blocks:\s*([^.]+)\.?/.exec(text)?.[1] ?? "").split(",").map((s) => s.trim()).filter((s) => /^R\d+$/.test(s));
		const cut = text.search(/\s+Owner:/);
		if (cut >= 0) text = text.slice(0, cut).trim();
		return [{
			id: m[1] ?? "",
			text,
			owner,
			blocks
		}];
	});
}
function parseRequirements(lines, problems) {
	const reqs = [];
	let req = null;
	let scen = null;
	for (const raw of lines) {
		const line = raw.trimEnd();
		const rh = /^### Requirement: (R\d+)\s+(.+)$/.exec(line);
		if (rh) {
			req = {
				id: rh[1] ?? "",
				name: (rh[2] ?? "").trim(),
				statement: "",
				source: "",
				blockedBy: [],
				scenarios: []
			};
			reqs.push(req);
			scen = null;
			continue;
		}
		if (/^### /.test(line)) {
			problems.push(`Unreadable requirement heading: ${line}`);
			req = null;
			scen = null;
			continue;
		}
		if (!req) continue;
		const sh = /^#### Scenario: (S\d+)\s+(.+)$/.exec(line);
		if (sh) {
			scen = {
				id: sh[1] ?? "",
				name: (sh[2] ?? "").trim(),
				steps: []
			};
			req.scenarios.push(scen);
			continue;
		}
		if (scen) {
			const st = /^- \*\*(GIVEN|WHEN|THEN|AND)\*\*\s*(.*)$/.exec(line);
			if (st) scen.steps.push({
				kind: st[1],
				text: (st[2] ?? "").trim()
			});
			continue;
		}
		if (/^Source:/.test(line)) req.source = line.slice(7).trim();
		else if (/^Blocked by:/.test(line)) req.blockedBy = line.slice(11).split(",").map((s) => s.trim()).filter(Boolean);
		else if (!req.statement && line.trim() && !line.startsWith("<!--")) req.statement = line.trim();
	}
	return reqs;
}
function parseSpec(text, fileId) {
	const { fm, body, problems } = parseFrontMatter(text);
	const sec = sections(body);
	const status = str$1(fm, "status");
	const validStatus = status === "approved" || status === "live" ? status : "draft";
	if (status && status !== validStatus) problems.push(`Unknown status "${status}"`);
	const scopeLines = sec.get("Scope") ?? [];
	const scopeIn = scopeLines.find((l) => /^\*\*In:\*\*/.test(l))?.replace(/^\*\*In:\*\*\s*/, "") ?? "";
	const scopeOut = scopeLines.find((l) => /^\*\*Out:\*\*/.test(l))?.replace(/^\*\*Out:\*\*\s*/, "") ?? "";
	const scopeAnti = scopeLines.find((l) => /^\*\*Anti-goals:\*\*/.test(l))?.replace(/^\*\*Anti-goals:\*\*\s*/, "") ?? "";
	const sketchLines = sec.get("Sketch") ?? [];
	const open = sketchLines.findIndex((l) => /^```/.test(l));
	const close = open < 0 ? -1 : sketchLines.findIndex((l, i) => i > open && /^```/.test(l));
	const sketch = open >= 0 && close > open ? sketchLines.slice(open + 1, close).join("\n") : null;
	const flow = sketch !== null && /^```flow\b/.test(sketchLines[open]) ? parseFlow(sketch) : null;
	const purpose = (sec.get("Purpose") ?? []).filter((l) => !isPlaceholder(l)).join(" ").trim();
	const titleLine = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? "";
	for (const name of [
		"Purpose",
		"Scope",
		"Requirements",
		"Code",
		"Decisions",
		"Open questions"
	]) if (!sec.has(name)) problems.push(`Missing section "${name}"`);
	return {
		id: str$1(fm, "id") || fileId || "",
		title: str$1(fm, "title") || titleLine || fileId || "Untitled spec",
		status: validStatus,
		owner: str$1(fm, "owner"),
		sources: list$1(fm, "sources"),
		approvedBy: str$1(fm, "approved_by"),
		approvedAt: str$1(fm, "approved_at"),
		created: str$1(fm, "created"),
		updated: str$1(fm, "updated"),
		purpose,
		scope: {
			in: scopeIn.trim(),
			out: scopeOut.trim(),
			anti: scopeAnti.trim()
		},
		sketch,
		flow,
		observations: parseObservations(sec.get("Observations") ?? []),
		requirements: parseRequirements(sec.get("Requirements") ?? [], problems),
		code: (sec.get("Code") ?? []).filter((l) => !isPlaceholder(l)).map((l) => l.replace(/^- /, "").trim()),
		decisions: parseDecisions(sec.get("Decisions") ?? []),
		questions: parseQuestions(sec.get("Open questions") ?? []),
		problems
	};
}
/** A flow block's lines, "From -> To : action [R2.S1, R2.S2]"; lines without "->" are skipped (spec-flow R1). */
function parseFlow(text) {
	const out = [];
	for (const raw of text.split("\n")) {
		const m = /^\s*(.+?)\s*->\s*(.+?)\s*(?::\s*(.*?))?\s*(?:\[([^\]]*)\])?\s*$/.exec(raw);
		if (!m) continue;
		out.push({
			from: m[1],
			to: m[2],
			action: (m[3] ?? "").trim(),
			cites: (m[4] ?? "").split(",").map((c) => c.trim()).filter(Boolean)
		});
	}
	return out;
}
// server/read.ts
function readText(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}
function readEvents(root) {
	const text = readText(join(root, "events.jsonl"));
	if (!text) return [];
	const out = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const e = JSON.parse(line);
			if (e && typeof e.type === "string" && typeof e.ts === "string") out.push({
				...e,
				data: e.data ?? {}
			});
		} catch {}
	}
	return out.sort((a, b) => a.ts.localeCompare(b.ts));
}
function readSessions(root, now = Date.now()) {
	const dir = join(root, "sessions");
	if (!existsSync(dir)) return [];
	const out = [];
	for (const f of readdirSync(dir)) {
		if (!f.endsWith(".json")) continue;
		const text = readText(join(dir, f));
		if (!text) continue;
		try {
			const s = JSON.parse(text);
			const age = now - Date.parse(s.updated);
			if (s.state === "ended" && age > 36e5) continue;
			if (age > 432e5) continue;
			out.push(s);
		} catch {}
	}
	return out.sort((a, b) => b.updated.localeCompare(a.updated));
}
function readSpecs(root) {
	const dir = join(root, "specs");
	const out = /* @__PURE__ */ new Map();
	if (!existsSync(dir)) return out;
	for (const f of readdirSync(dir)) {
		if (!f.endsWith(".md")) continue;
		const id = basename(f, ".md");
		const text = readText(join(dir, f));
		if (text !== null) out.set(id, parseSpec(text, id));
	}
	return out;
}
function isDir(p) {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}
// server/parse-plan.ts
function str(fm, key) {
	const v = fm[key];
	return Array.isArray(v) ? v.join(", ") : v ?? "";
}
function list(fm, key) {
	const v = fm[key];
	return Array.isArray(v) ? v : v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}
function asStatus(v) {
	return v === "approved" || v === "design-approved" ? v : "draft";
}
var ITEM = /^(\d+\.|-)\s+(?:\[( |x|X)\]\s+)?(.*)$/;
/** Markdown lines → blocks: paragraphs, ### headings, lists (with checkboxes), tables, fenced code. */
function parseBlocks(lines) {
	const out = [];
	let para = [];
	const flush = () => {
		if (para.length) out.push({
			t: "p",
			text: para.join(" ")
		});
		para = [];
	};
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const trimmed = line.trim();
		if (!trimmed || trimmed === "---") {
			flush();
			continue;
		}
		if (/^<!--.*-->$/.test(trimmed)) continue;
		const fence = /^```(\S*)/.exec(trimmed);
		if (fence && !/^\s/.test(line)) {
			flush();
			const body = [];
			for (i++; i < lines.length && !/^```\s*$/.test((lines[i] ?? "").trim()); i++) body.push(lines[i] ?? "");
			out.push({
				t: "code",
				lang: fence[1] ?? "",
				text: body.join("\n")
			});
			continue;
		}
		if (trimmed.startsWith("|")) {
			flush();
			const rows = [];
			for (; i < lines.length && (lines[i] ?? "").trim().startsWith("|"); i++) {
				const row = (lines[i] ?? "").trim();
				if (/^\|[\s|:-]+\|$/.test(row)) continue;
				rows.push(row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
			}
			i--;
			out.push({
				t: "table",
				head: rows[0] ?? [],
				rows: rows.slice(1)
			});
			continue;
		}
		const h = /^#{3,6}\s+(.*)$/.exec(trimmed);
		if (h && !/^\s/.test(line)) {
			flush();
			out.push({
				t: "h",
				text: h[1] ?? ""
			});
			continue;
		}
		const item = ITEM.exec(line);
		if (item) {
			flush();
			const ordered = /^\d/.test(item[1] ?? "");
			const items = [];
			for (; i < lines.length; i++) {
				const l = lines[i] ?? "";
				const m = ITEM.exec(l);
				if (m) {
					items.push(m[2] === void 0 ? { text: m[3] ?? "" } : {
						text: m[3] ?? "",
						done: m[2] !== " "
					});
					continue;
				}
				const last = items[items.length - 1];
				if (last && /^\s+\S/.test(l)) {
					last.text += "\n" + l.replace(/^ {2}/, "");
					continue;
				}
				if (!l.trim() && i + 1 < lines.length && (ITEM.exec(lines[i + 1] ?? "") || /^\s+\S/.test(lines[i + 1] ?? ""))) continue;
				break;
			}
			i--;
			out.push({
				t: "list",
				ordered,
				items
			});
			continue;
		}
		para.push(trimmed);
	}
	flush();
	return out;
}
function toSections(body, skip = []) {
	return [...sections(body)].filter(([name]) => !skip.includes(name)).map(([name, lines]) => ({
		name,
		blocks: parseBlocks(lines)
	}));
}
function components(body) {
	const table = parseBlocks(sections(body).get("Components") ?? []).find((b) => b.t === "table");
	if (!table || table.t !== "table") return [];
	return table.rows.map((r) => ({
		path: (r[0] ?? "").replace(/`/g, "").trim(),
		serves: [...(r[r.length - 1] ?? "").matchAll(/\bR\d+(?:\.S\d+)?\b/g)].map((m) => m[0])
	}));
}
function patterns(body) {
	return (sections(body).get("Patterns") ?? []).flatMap((l) => /^- \*\*([PN]\d+)\b/.exec(l)?.[1] ?? []);
}
function parseTasks(body, vertical, problems, label) {
	const tasks = [];
	let task = null;
	let part = null;
	const close = () => {
		if (task && part) task.body.push({
			name: part.name,
			blocks: parseBlocks(part.lines)
		});
		part = null;
	};
	for (const line of body.split(/\r?\n/)) {
		if (/^### /.test(line)) {
			close();
			const h = /^### (T\d+):\s*(.*)$/.exec(line);
			if (!h) {
				problems.push(`${label}: unreadable task heading "${line.slice(4)}"`);
				task = null;
				continue;
			}
			task = {
				id: h[1] ?? "",
				title: (h[2] ?? "").trim(),
				vertical,
				proves: [],
				foundation: null,
				dependsOn: [],
				estDiff: "",
				stepsDone: 0,
				stepsTotal: 0,
				body: []
			};
			tasks.push(task);
			continue;
		}
		if (!task) continue;
		const field = /^\*\*(Proves|Depends on|Est\. diff):\*\*\s*(.*)$/.exec(line);
		if (field) {
			close();
			const v = (field[2] ?? "").trim();
			if (field[1] === "Proves") {
				const none = /^none\b\s*(?:\((.*)\))?/i.exec(v);
				if (none) task.foundation = (none[1] ?? "").trim();
				else task.proves = v.split(",").map((s) => s.trim()).filter(Boolean);
			} else if (field[1] === "Depends on") task.dependsOn = /^(none|—|-)?$/i.test(v) || /^none\b/i.test(v) ? [] : v.split(",").flatMap((s) => /^\s*(T\d+)/.exec(s)?.[1] ?? []);
			else task.estDiff = v;
			continue;
		}
		const head = /^\*\*([A-Z][\w ]*)\*\*\s*$/.exec(line.trim());
		if (head) {
			close();
			part = {
				name: head[1] ?? "",
				lines: []
			};
			continue;
		}
		if (part) part.lines.push(line);
	}
	close();
	for (const t of tasks) for (const b of t.body.find((s) => s.name === "Steps")?.blocks ?? []) {
		if (b.t !== "list") continue;
		for (const it of b.items) if (it.done !== void 0) {
			t.stepsTotal++;
			if (it.done) t.stepsDone++;
		}
	}
	return tasks;
}
function parsePlan(work, files) {
	const problems = [];
	const read = (text, label) => {
		const r = parseFrontMatter(text);
		for (const p of r.problems) problems.push(`${label}: ${p}`);
		return r;
	};
	const old = files.plan === void 0;
	const verticals = [];
	let overview = [];
	let head = {};
	let status = "draft";
	let designFm = {};
	if (!old) {
		const p = read(files.plan ?? "", "plan.md");
		head = p.fm;
		overview = toSections(p.body);
		status = asStatus(str(head, "status"));
	}
	for (const [name, f] of Object.entries(files.verticals)) {
		const prefix = old ? "" : `${name}/`;
		const d = f.design !== void 0 ? read(f.design, `${prefix}design.md`) : null;
		const t = f.tasks !== void 0 ? read(f.tasks, `${prefix}tasks.md`) : null;
		if (old) {
			designFm = d?.fm ?? {};
			head = t?.fm ?? designFm;
			if (d) overview = toSections(d.body).filter((s) => s.name === "Context" || s.name === "Spec updates");
			const ds = asStatus(str(designFm, "status"));
			status = asStatus(str(t?.fm ?? {}, "status")) === "approved" ? "approved" : ds !== "draft" ? "design-approved" : "draft";
		}
		verticals.push({
			name,
			design: d ? toSections(d.body, old ? ["Context", "Spec updates"] : []) : null,
			tasks: t ? parseTasks(t.body, name, problems, `${prefix}tasks.md`) : null,
			components: d ? components(d.body) : [],
			patterns: d ? patterns(d.body) : [],
			preamble: d ? d.body.split(/\n## /)[0].replace(/^# .*$/m, "").trim() : ""
		});
	}
	const approvals = old ? designFm : head;
	return {
		work,
		spec: str(head, "spec"),
		layout: old ? "old" : "vertical",
		status,
		designApprovedBy: str(approvals, "design_approved_by"),
		designApprovedAt: str(approvals, "design_approved_at"),
		approvedBy: str(head, "approved_by"),
		approvedAt: str(head, "approved_at"),
		specUpdated: str(old ? designFm : head, "spec_updated"),
		scope: list(head, "scope"),
		overview,
		verticals,
		stale: false,
		sessions: [],
		build: {},
		implementedAt: str(head, "implemented_at"),
		problems
	};
}
// server/loop.ts
function latestVerify(id, events, withResults) {
	const e = [...events].reverse().find((x) => x.spec === id && x.type === "spec.verified");
	if (!e) return null;
	const results = e.data.results ?? {};
	const manual = Object.values(results).filter((r) => r.status === "unverified" && /^manual case not run/.test(r.evidence)).length;
	const counts = {
		proved: Number(e.data.proved ?? 0),
		failing: Number(e.data.failing ?? 0),
		unverified: Number(e.data.unverified ?? 0),
		manual,
		at: e.ts
	};
	if (!withResults) return counts;
	return {
		...counts,
		results
	};
}
/** An update that adds, changes or retires a requirement; a note or a decision alone isn't going back (spec-ring R4.S7). */
var specChanges = (e) => [
	"added",
	"changed",
	"retired"
].some((k) => Array.isArray(e.data[k]) && e.data[k].length > 0);
/** The spec changed after the plan was last approved (plan-view R10), by the same rule as the line's stale Plan
*  (spec-ring R4.S9): a build finished after the change took it in. Without events, by the dates in the files. */
function isStale(plan, events, spec) {
	const last = (pred) => [...events].reverse().find(pred)?.ts;
	const made = last((e) => e.work === plan.work && e.type === "plan.approved") ?? last((e) => e.work === plan.work && e.type === "plan.created");
	const built = last((e) => e.work === plan.work && e.type === "plan.implemented");
	const changed = last((e) => e.type === "spec.updated" && e.spec === plan.spec && specChanges(e));
	if (made) return Boolean(changed && changed > made && !(built && built >= changed));
	return Boolean(spec?.updated && plan.specUpdated && spec.updated > plan.specUpdated);
}
/** The newest plan in brief. With a state that records it, its stage, counts, review and hold are the state's
*  (status-state R5); task details and comments still come from events. */
function brief(plans, events = [], st = null) {
	const p = plans[0];
	if (!p) return null;
	const builds = Object.values(p.build);
	const w = st?.works[p.work];
	const base = {
		work: p.work,
		approvedAt: p.approvedAt,
		others: plans.length - 1,
		...p.branchReview ? { branchReview: p.branchReview } : {}
	};
	if (w) return {
		...base,
		status: w.stage !== "planned" ? "approved" : p.status === "approved" ? "draft" : p.status,
		tasks: w.total || builds.length,
		done: w.done,
		implemented: w.stage === "implemented",
		review: stateReview(reviewOf(p.work, events), w),
		...w.hold ? { hold: w.hold } : {}
	};
	return {
		...base,
		status: p.status,
		tasks: builds.length,
		done: builds.filter((b) => b.status === "done").length,
		implemented: Boolean(p.implementedAt),
		review: reviewOf(p.work, events),
		...holdFor(p.work, events)
	};
}
/** The review as the state records it: none, merged or closed say so; open keeps the newest pull request's own state
*  unless that one says merged or closed. */
function stateReview(r, w) {
	if (w.review === "none") return null;
	const state = w.review === "merged" ? "MERGED" : w.review === "closed" ? "CLOSED" : r && r.state !== "MERGED" && r.state !== "CLOSED" ? r.state : "OPEN";
	return {
		...r ?? {
			url: "",
			comments: []
		},
		state
	};
}
/** The work's current hold (build-status R4, D3): the last stage.held, cleared by a stage.released for that stage;
*  a release with no hold before it changes nothing. */
function holdFor(work, events) {
	let hold = null;
	for (const e of events) {
		if (e.work !== work) continue;
		if (e.type === "stage.held") hold = {
			stage: String(e.data.stage ?? ""),
			reason: String(e.data.reason ?? ""),
			since: e.ts
		};
		else if (e.type === "stage.released" && hold && e.data.stage === hold.stage) hold = null;
	}
	return hold ? { hold } : {};
}
/** The plan's pull requests, keyed by repo and number (multi-repo R9): state and comments with how each was handled
*  (review R8). No repo means the workspace's only repo. The top-level fields are the newest pull request's. */
function reviewOf(work, events) {
	const mine = events.filter((e) => e.work === work && e.type.startsWith("review."));
	const key = (e) => `${String(e.data.repo ?? "")}#${String(e.data.pr ?? "")}`;
	const order = [];
	for (const e of mine) if (e.type === "review.opened") {
		const k = key(e);
		const i = order.indexOf(k);
		if (i >= 0) order.splice(i, 1);
		order.push(k);
	}
	if (!order.length) return null;
	const prs = order.map((k) => {
		const ofPr = mine.filter((e) => key(e) === k);
		const opened = [...ofPr].reverse().find((e) => e.type === "review.opened");
		const state = [...ofPr].reverse().find((e) => e.type === "review.state")?.data.state;
		const based = [...ofPr].reverse().find((e) => (e.type === "review.opened" || e.type === "review.restacked") && e.data.base) ?? opened;
		const replies = /* @__PURE__ */ new Map();
		for (const e of ofPr) if (e.type === "review.reply") replies.set(String(e.data.comment ?? ""), e);
		const handled = (id) => {
			const r = replies.get(id);
			if (!r) return null;
			if (r.data.kind === "fixed") return `fixed in ${String(r.data.commit ?? "")}`;
			if (r.data.kind === "spec") return `changed in the spec${r.data.commit ? `, ${String(r.data.commit)}` : ""}`;
			return "replied";
		};
		const comments = ofPr.filter((e) => e.type === "review.comment").map((e) => ({
			author: String(e.data.author ?? ""),
			path: String(e.data.path ?? ""),
			line: String(e.data.line ?? ""),
			body: String(e.data.body ?? ""),
			handled: handled(String(e.data.id ?? ""))
		}));
		const t = opened.data.tasks;
		const tasks = Array.isArray(t) ? t.map(String) : t ? String(t).split(/[,\s]+/).filter(Boolean) : [];
		const af = opened.data.after;
		const after = Array.isArray(af) ? af.map(String) : af ? String(af).split(/[,\s]+/).filter(Boolean) : [];
		return {
			repo: String(opened.data.repo ?? ""),
			number: String(opened.data.pr ?? ""),
			url: String(opened.data.url ?? ""),
			base: String(based.data.base ?? ""),
			tasks,
			after,
			state: String(state ?? "OPEN"),
			comments
		};
	});
	const last = prs[prs.length - 1];
	return {
		url: last.url,
		state: last.state,
		comments: last.comments,
		prs
	};
}
/** Stale stages and the round (spec-ring R4). A stage after Spec is stale when it last finished before the latest spec
*  change and hasn't finished since. A spec change starts a new round only once the work went out for review since
*  the round began; each request for changes is a round too. */
function loopOf(id, works, events, verifyOn = false, st = null) {
	const finished = {};
	let round = 1, reviewed = false, updated = null;
	for (const e of events) {
		if (e.spec !== id && !(e.work && works.has(e.work))) continue;
		if (e.type === "plan.approved") finished.plan = e.ts;
		else if (e.type === "plan.implemented") finished.build = e.ts;
		else if (e.type === "spec.verified") finished.verify = e.ts;
		else if (e.type === "review.opened") {
			finished.review = e.ts;
			reviewed = true;
		} else if (e.type === "spec.updated" && specChanges(e)) {
			if (reviewed) {
				round++;
				reviewed = false;
			}
			updated = e.ts;
		} else if (e.type === "review.state" && e.data.state === "CHANGES_REQUESTED") round++;
		if (e.type === "review.state" && e.data.state === "MERGED") finished.merged = e.ts;
	}
	const w = st?.works[st.plan];
	if (w) {
		const s = w.stale;
		return {
			stale: [
				false,
				s,
				s && w.stage === "implemented",
				...verifyOn ? [s && Boolean(finished.verify)] : [],
				s && w.review !== "none"
			],
			round
		};
	}
	const before = (k) => Boolean(updated && finished[k] && finished[k] < updated);
	const stale = [false];
	let carry = false;
	const builtAfter = Boolean(updated && finished.build && finished.build >= updated);
	(verifyOn ? [
		"plan",
		"build",
		"verify"
	] : ["plan", "build"]).forEach((k, i) => {
		const st = carry ? Boolean(finished[k]) : before(k) && !(i === 0 && builtAfter);
		stale.push(st);
		carry ||= st;
	});
	stale.push(Boolean(finished.review) && (carry || before("merged") && before("review")));
	if (updated && finished.plan && finished.plan >= updated) for (let i = 2; i < stale.length; i++) stale[i] = false;
	return {
		stale,
		round
	};
}
/** Each task's build status from its task.* events, latest first wins; tasks never started are waiting (build R8). */
function buildStatus(plan, events) {
	const out = {};
	for (const v of plan.verticals) for (const t of v.tasks ?? []) out[t.id] = { status: "waiting" };
	for (const e of events) {
		if (e.work !== plan.work || !(e.type.startsWith("task.") || e.type === "agent.started")) continue;
		const id = String(e.data.task ?? "");
		if (!(id in out)) continue;
		const b = out[id], role = e.data.role;
		if (e.type === "agent.started") {
			if (role === "build") out[id] = {
				...b,
				phase: "building",
				model: String(e.data.model ?? ""),
				reviewerRecorded: false
			};
			else if (role === "review") out[id] = {
				...b,
				phase: "reviewing",
				reviewerRecorded: true
			};
		} else if (e.type === "task.waiting") out[id] = {
			...b,
			phase: "waiting",
			reason: String(e.data.reason ?? "")
		};
		else if (e.type === "task.fixing") {
			const round = Number(e.data.round ?? 0), cause = String(e.data.cause ?? ""), history = b.history ?? [];
			out[id] = {
				...b,
				phase: "fixing",
				round,
				cause,
				reviewerRecorded: false,
				history: history.some((h) => h.kind === "fix" && h.round === round) ? history : [...history, {
					kind: "fix",
					round,
					cause
				}]
			};
		} else if (e.type === "task.reviewed") {
			const fs = Array.isArray(e.data.findings) ? e.data.findings : [];
			const history = b.history ?? [];
			if (e.data.spec === void 0 && e.data.quality === void 0) {
				const round = Number(e.data.round ?? 0);
				out[id] = {
					...b,
					round,
					cause: String(e.data.cause ?? ""),
					history: history.some((h) => h.kind === "fix" && h.round === round) ? history : [...history, {
						kind: "fix",
						round,
						cause: String(e.data.cause ?? "")
					}]
				};
			} else {
				const findings = fs.filter((f) => !f.beyond_sources).length, suggestions = fs.filter((f) => f.beyond_sources).length, verdict = `${String(e.data.spec ?? "")}/${String(e.data.quality ?? "")}`;
				out[id] = {
					...b,
					verdict,
					findings,
					suggestions,
					history: [...history, {
						kind: "review",
						verdict,
						findings,
						suggestions
					}]
				};
			}
		} else if (e.type === "task.started") out[id] = {
			...b,
			status: "running",
			phase: "building"
		};
		else if (e.type === "task.done") out[id] = {
			...b,
			status: "done",
			phase: "merged",
			commit: String(e.data.commit ?? ""),
			lines: Number(e.data.lines ?? 0)
		};
		else if (e.type === "task.failed" || e.type === "task.blocked") out[id] = {
			status: e.type === "task.failed" ? "failed" : "blocked",
			reason: String(e.data.reason ?? "")
		};
	}
	return out;
}
/** The branch review of the plan's latest run: a new branch reviewer starts a fresh run, so its findings replace the last's (build-visibility R3).
*  A run opens on the branch reviewer, a branch fix round, or the build's self-review step (D7). Older builds logged the
*  self-review step and the branch findings but no fix round and no branch.reviewed, so they never open a run: a
*  self-review step (with any findings after it) stays a run only if a branch reviewer, fix round or branch.reviewed
*  comes next, or it is the newest and still inside the paused window (R1.S5). */
function branchReviewOf(work, events, now = Date.now()) {
	const fresh = (phase) => ({
		phase,
		findings: [],
		notProbed: [],
		rounds: [],
		passes: [],
		verdict: "",
		must: 0,
		should: 0
	});
	let br = null;
	let pending = null;
	for (const e of events) {
		const d = e.data, branch = d.task === "branch";
		const selfReview = e.type === "stage.step" && d.stage === "self-review" && (d.work === work || e.work === work);
		if (e.work !== work && !selfReview) continue;
		const reviewer = e.type === "agent.started" && d.role === "review" && branch;
		if (pending) {
			if (reviewer || e.type === "task.fixing" && branch || e.type === "branch.reviewed") pending = null;
			else if (!(e.type === "task.reviewed" && branch && d.round === void 0)) {
				br = pending.before;
				pending = null;
			}
		}
		if (selfReview) {
			pending = {
				since: e.ts,
				before: br
			};
			br = fresh("probing");
		} else if (reviewer) {
			if (br?.phase === "fixing") br.phase = "probing";
			else br = fresh("probing");
		} else if (e.type === "task.reviewed" && branch) {
			if (!br || br.phase === "ended") continue;
			br.phase = "probing";
			if (d.round !== void 0 && !Array.isArray(d.findings)) {
				if (!br.rounds.some((r) => r.round === Number(d.round))) br.rounds.push({
					round: Number(d.round),
					cause: String(d.cause ?? "")
				});
			} else {
				br.findings = (Array.isArray(d.findings) ? d.findings : []).map((f) => ({
					severity: String(f.severity ?? ""),
					text: String(f.text ?? ""),
					evidence: String(f.evidence ?? "")
				}));
				if (Array.isArray(d.findings)) br.passes.push({ findings: br.findings });
				br.notProbed = (Array.isArray(d.not_probed) ? d.not_probed : []).map((n) => ({
					area: String(n.area ?? ""),
					reason: String(n.reason ?? "")
				}));
			}
		} else if (e.type === "task.fixing" && branch) {
			br ??= fresh("fixing");
			br.phase = "fixing";
			br.rounds = [...br.rounds.filter((r) => r.round !== Number(d.round)), {
				round: Number(d.round ?? 0),
				cause: String(d.cause ?? "")
			}];
			const last = br.passes[br.passes.length - 1];
			if (last) last.fix = {
				round: Number(d.round ?? 0),
				cause: String(d.cause ?? "")
			};
		} else if (e.type === "branch.reviewed") br = {
			...br ?? fresh("ended"),
			phase: "ended",
			verdict: String(d.verdict ?? ""),
			must: Number(d.must ?? 0),
			should: Number(d.should ?? 0)
		};
	}
	if (pending && now - Date.parse(pending.since) > 6e5) br = pending.before;
	return br;
}
/** Every plan in `work/`, newest (highest number) first. A folder with no plan, design or task file isn't a plan (plan-view R11.S3). */
function readPlans(root, events = [], specs = /* @__PURE__ */ new Map(), live = [], states = /* @__PURE__ */ new Map()) {
	const dir = join(root, "work");
	if (!existsSync(dir)) return [];
	const out = [];
	for (const work of readdirSync(dir).sort().reverse()) {
		const folder = join(dir, work);
		if (!/^[\w.-]+$/.test(work) || !isDir(folder)) continue;
		const text = (f) => readText(join(folder, f)) ?? void 0;
		const plan = text("plan.md");
		let files;
		if (plan !== void 0) {
			const listed = parseFrontMatter(plan).fm.verticals;
			const names = Array.isArray(listed) ? listed : listed ? [listed] : readdirSync(folder).filter((f) => isDir(join(folder, f))).sort();
			files = {
				plan,
				verticals: Object.fromEntries(names.map((v) => [v, {
					design: text(`${v}/design.md`),
					tasks: text(`${v}/tasks.md`)
				}]))
			};
		} else {
			const design = text("design.md"), tasks = text("tasks.md");
			if (design === void 0 && tasks === void 0) continue;
			files = { verticals: { general: {
				design,
				tasks
			} } };
		}
		const p = parsePlan(work, files);
		p.stale = states.get(p.spec)?.works[work]?.stale ?? isStale(p, events, specs.get(p.spec));
		p.sessions = sessionsFor(events, (e) => e.work === work, live);
		p.build = buildStatus(p, events);
		p.branchReview = branchReviewOf(work, events);
		out.push(p);
	}
	return out;
}
// server/state.ts
var TABLE = (/* @__PURE__ */ new Uint32Array(256)).map((_, i) => {
	let c = i << 24;
	for (let k = 0; k < 8; k++) c = c & 2147483648 ? c << 1 ^ 79764919 : c << 1;
	return c >>> 0;
});
function cksum(bytes) {
	let c = 0;
	const add = (b) => {
		c = (c << 8 ^ TABLE[(c >>> 24 ^ b) & 255]) >>> 0;
	};
	for (const b of bytes) add(b);
	for (let n = bytes.length; n > 0; n = Math.floor(n / 256)) add(n & 255);
	return ~c >>> 0;
}
var read = (p) => existsSync(p) ? readFileSync(p, "latin1") : null;
var lines = (t) => t.split("\n").map((l) => l.replace(/\r$/, ""));
var front = (t) => {
	const l = lines(t);
	if (l[0] !== "---") return [];
	const end = l.indexOf("---", 1);
	return l.slice(1, end < 0 ? l.length : end);
};
/** A front-matter value, as state.sh's fm() reads it. */
function fm(t, key) {
	const l = front(t).find((x) => x.startsWith(key + ":"));
	return l === void 0 ? "" : l.replace(/^[^:]*: */, "").replace(/ +#.*/, "");
}
/** "<crc> <size>" of each requirement in the plan's scope as the spec reads now: its block from the heading to the next,
*  whitespace collapsed, Source: lines left out; retired ones not at all (state.sh covers). */
function covers(root, work, specText) {
	const out = /* @__PURE__ */ new Map();
	const head = read(join(root, "work", work, "plan.md")) ?? read(join(root, "work", work, "tasks.md"));
	if (head === null) return out;
	const scope = ` ${fm(head, "scope").replace(/[[\],]/g, "")} `;
	const gone = /* @__PURE__ */ new Set();
	for (const l of front(specText)) if (/^retired:/.test(l)) l.replace(/[[\],]/g, " ").trim().split(/\s+/).slice(1).forEach((r) => gone.add(r));
	let id = "", txt = "";
	const flush = () => {
		if (id && scope.includes(` ${id} `) && !gone.has(id)) {
			const text = txt.replace(/[ \t\r]+/g, " ").replace(/^ /, "").replace(/ $/, "");
			out.set(`cover.${work}.${id}`, `${cksum(Buffer.from(text, "latin1"))} ${text.length}`);
		}
		id = "";
		txt = "";
	};
	const all = lines(specText);
	const body = all[0] === "---" ? all.slice(all.indexOf("---", 1) < 0 ? all.length : all.indexOf("---", 1) + 1) : all;
	for (const l of body) {
		if (/^## /.test(l) || /^### /.test(l) && !/^### Requirement:/.test(l)) {
			flush();
			continue;
		}
		if (/^### Requirement: R[0-9]+/.test(l)) {
			flush();
			id = l.trim().split(/[ \t]+/)[2] ?? "";
		}
		if (id && !/^[ \t]*Source:/.test(l)) txt += " " + l;
	}
	flush();
	return out;
}
/** The spec's state, or null with no state file. An unreadable one is null too: the caller reads as before (design). */
function readState(root, id) {
	const text = read(join(root, "state", `${id}.json`));
	if (text === null) return null;
	const kv = /* @__PURE__ */ new Map();
	for (const l of text.split("\n")) {
		if (l === "{" || l === "}" || l === "") continue;
		const m = /^ {2}"([^"]*)": "([^"]*)",?$/.exec(l);
		if (!m) {
			console.error(`state/${id}.json is not readable; reading ${id} from events`);
			return null;
		}
		kv.set(m[1], m[2]);
	}
	const specText = read(join(root, "specs", `${id}.md`));
	const works = {};
	for (const [k, stage] of kv) {
		if (!k.startsWith("plan.")) continue;
		const w = k.slice(5), get = (p) => kv.get(`${p}.${w}`) ?? "";
		const list = (p) => get(p).split(" ").filter(Boolean);
		const held = get("hold"), sp = held.indexOf(" ");
		const review = get("review") || "none";
		let stale = false;
		if (specText !== null && [
			"approved",
			"building",
			"implemented"
		].includes(stage)) {
			const stored = [...kv].filter(([x]) => x.startsWith(`cover.${w}.`));
			const have = new Map(stored);
			let bad = false, hit = 0;
			for (const [x, sum] of covers(root, w, specText)) if (have.get(x) !== sum) bad = true;
			else hit++;
			stale = bad || review !== "merged" && hit !== stored.length;
		}
		works[w] = {
			stage,
			done: list("tasks").length,
			total: Number(get("total") || 0),
			review,
			prs: list("prs"),
			stale,
			...held ? { hold: {
				stage: sp < 0 ? held : held.slice(0, sp),
				reason: sp < 0 ? "" : held.slice(sp + 1),
				since: get("hold_since")
			} } : {}
		};
	}
	return {
		spec: kv.get("spec") ?? "draft",
		plan: kv.get("plan") ?? "",
		works
	};
}
// server/workspace.ts
/** A spec's summary, or null for a run that has gone quiet without ever writing a file. */
function summarize(id, spec, events, sessions, now, plans = [], st = null) {
	const live = liveFor(id, spec, events, sessions, now);
	if (!spec && !live.open) return null;
	const mine = events.filter((e) => e.spec === id);
	const firstStep = mine.find((e) => e.type === "spec.step" && e.data.title);
	const lastMoved = mine[mine.length - 1]?.ts ?? null;
	const works = new Set(plans.map((p) => p.work));
	let lastActivity = null;
	for (const e of events) if ((e.spec === id || e.work && works.has(e.work)) && (!lastActivity || e.ts > lastActivity)) lastActivity = e.ts;
	lastActivity ??= spec?.updated || null;
	return {
		id,
		title: spec?.title ?? String(firstStep?.data.title ?? id),
		status: displayStatus(spec?.status ?? null, live, lastMoved, now, st?.spec),
		lastMoved,
		lastActivity,
		activity: activityOf(id, events, plans, now),
		hasFile: Boolean(spec),
		requirements: spec?.requirements.length ?? 0,
		scenarios: spec?.requirements.reduce((n, r) => n + r.scenarios.length, 0) ?? 0,
		openQuestions: spec?.questions.length ?? 0,
		live,
		plan: brief(plans, events, st),
		verify: latestVerify(id, events, false),
		loop: loopOf(id, works, events, void 0, st)
	};
}
/** a is a later version than b, comparing x.y.z number by number (0.10.0 > 0.9.0). */
function newerVersion(a, b) {
	const x = a.split(".").map(Number), y = b.split(".").map(Number);
	for (let i = 0; i < Math.max(x.length, y.length, 3); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
	return false;
}
function workspaceState(root, user, now = Date.now(), repo = null, running = "") {
	const specs = readSpecs(root);
	const events = readEvents(root);
	const sessions = readSessions(root, now);
	const states = new Map([...specs.keys()].map((id) => [id, readState(root, id)]));
	const plans = readPlans(root, events, specs, sessions, states);
	const ids = new Set(specs.keys());
	for (const e of events) if (e.type === "spec.step" && e.spec) ids.add(e.spec);
	const summaries = [];
	const waiting = [];
	for (const id of ids) {
		const spec = specs.get(id);
		const summary = summarize(id, spec, events, sessions, now, plans.filter((p) => p.spec === id), states.get(id) ?? null);
		if (!summary) continue;
		summaries.push(summary);
		const { live } = summary;
		const sessionWaiting = live.session && (live.session.state === "your_turn" || live.session.state === "waiting");
		if (live.pendingQuestion && (sessionWaiting || !live.session)) waiting.push({
			kind: "question",
			spec: id,
			text: live.pendingQuestion.text,
			sessionId: live.session?.id
		});
		else if (live.open && live.step === "approval" && sessionWaiting) waiting.push({
			kind: "session",
			spec: id,
			text: "Waiting for your approval",
			sessionId: live.session?.id
		});
		else if (live.open && live.session?.state === "waiting") waiting.push({
			kind: "session",
			spec: id,
			text: live.session.message || "Claude needs your input",
			sessionId: live.session.id
		});
		for (const q of spec?.questions ?? []) if (user && firstName(q.owner) === firstName(user)) waiting.push({
			kind: "owned-question",
			spec: id,
			text: `${q.id} ${q.text}`
		});
	}
	let newest = "";
	for (const e of events) if (e.v && /^\d+(\.\d+)*$/.test(e.v) && (!newest || newerVersion(e.v, newest))) newest = e.v;
	const versionGap = running && newest && newerVersion(newest, running) ? {
		running,
		workspace: newest
	} : null;
	const decisions = waitingDecisions(specs, summaries, plans, events, sessions);
	const waitingOn = new Set(decisions.map((d) => d.spec));
	summaries.sort((a, b) => Number(waitingOn.has(b.id)) - Number(waitingOn.has(a.id)) || (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "") || a.id.localeCompare(b.id));
	return {
		workspace: root,
		user,
		repo,
		specs: summaries,
		waiting,
		serverTime: new Date(now).toISOString(),
		versionGap,
		decisions
	};
}
/** The status of every listed spec, in order; changes when time alone moves a spec across a boundary (R7.S2). */
function statusSignature(state) {
	return state.specs.map((s) => `${s.id}:${s.status}`).join("|");
}
function specDetail(root, id, now = Date.now()) {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return null;
	const specs = readSpecs(root);
	const events = readEvents(root);
	const sessions = readSessions(root, now);
	const spec = specs.get(id) ?? null;
	const st = readState(root, id);
	const plans = readPlans(root, events, specs, sessions, /* @__PURE__ */ new Map([[id, st]])).filter((p) => p.spec === id);
	const summary = summarize(id, spec ?? void 0, events, sessions, now, plans, st);
	if (!summary) return null;
	const activity = events.filter((e) => e.spec === id).slice(-40).reverse();
	const calls = events.filter((e) => e.spec === id && e.type === "decision.recorded" && e.data.call === true).map((e) => ({
		id: String(e.data.id ?? ""),
		text: String(e.data.text ?? ""),
		by: String(e.data.by ?? "Claude"),
		ts: e.ts,
		from: String(e.data.from ?? "")
	}));
	return {
		summary,
		spec,
		activity,
		plans,
		sessions: sessionsFor(events, (e) => e.spec === id, sessions),
		calls,
		verify: latestVerify(id, events, true)
	};
}
/** A cheap fingerprint of everything the UI shows; changes when any of it changes. */
function fingerprint(root) {
	const parts = [];
	const add = (p) => {
		try {
			const s = statSync(p);
			parts.push(`${p}:${s.mtimeMs}:${s.size}`);
		} catch {
			parts.push(`${p}:-`);
		}
	};
	add(join(root, "events.jsonl"));
	for (const d of [
		"specs",
		"sessions",
		"state"
	]) {
		const dir = join(root, d);
		add(dir);
		if (existsSync(dir)) for (const f of readdirSync(dir)) add(join(dir, f));
	}
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
// server/repo.ts
/** https://github.com/owner/repo from any common form of a remote URL; null if it isn't one we can link to. */
function webUrlFromRemote(remote) {
	const r = remote.trim().replace(/\.git$/, "").replace(/\/$/, "");
	const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(r);
	if (scp) return `https://${scp[1]}/${scp[2]}`;
	const url = /^(?:ssh|git|https?):\/\/(?:[^@/]+@)?([\w.-]+)(?::\d+)?\/(.+)$/.exec(r);
	if (url) return `https://${url[1]}/${url[2]}`;
	return null;
}
function git(cwd, args) {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).trim();
	} catch {
		return "";
	}
}
/** The origin's web URL and default branch for the repo containing dir, or null without a usable origin. */
function repoLink(dir) {
	const web = webUrlFromRemote(git(dir, [
		"remote",
		"get-url",
		"origin"
	]));
	if (!web) return null;
	const head = git(dir, [
		"symbolic-ref",
		"--short",
		"refs/remotes/origin/HEAD"
	]).replace(/^origin\//, "");
	const current = git(dir, [
		"rev-parse",
		"--abbrev-ref",
		"HEAD"
	]);
	return {
		web,
		ref: head || (current && current !== "HEAD" ? current : "main")
	};
}
// src/links.ts
var ID = String.raw`(?:R\d+(?:\.S\d+)?|[ODQTPN]\d+)`;
new RegExp(String.raw`(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]` + String.raw`|[a-z0-9][a-z0-9-]*#${ID}(?![\w-])` + String.raw`|(?<![\w#.\/-])${ID}(?![\w-]))`, "g");
var sectionOf = (ref) => /^R\d/.test(ref) ? "requirements" : /^D\d/.test(ref) ? "decisions" : /^Q\d/.test(ref) ? "questions" : /^O\d/.test(ref) ? "observations" : "requirements";
function specPath(specId) {
	return `/work/${specId}/spec`;
}
/** A spec item (R2, R2.S1, D1, Q2, O3) in the section that holds it, or the spec itself. */
function refHref(specId, ref) {
	return ref ? `/work/${specId}/spec/${sectionOf(ref)}/${ref}` : specPath(specId);
}
/**
* A plan page, optionally a tab (a vertical, "build", or "overview"), an item in it, and the vertical's sub-tab
* (plan-view R12). A task opens Tasks and a pattern opens Design unless a view is given. An empty work means the newest
* plan. The build is its own stage: /work/<spec>/build/<work>.
*/
function planHref(specId, work, tab, ref, view) {
	if (tab === "build") return `/work/${specId}/build${work ? `/${work}` : ""}`;
	const base = `/work/${specId}/plan${work ? `/${work}` : ""}`;
	if (!tab || tab === "overview") return base;
	return `${base}/${tab}/${view ?? (ref && /^T\d/.test(ref) ? "tasks" : "design")}${ref ? `/${ref}` : ""}`;
}
// server/search.ts
function searchIndex(root) {
	const specs = readSpecs(root);
	const plans = readPlans(root, readEvents(root), specs);
	const out = [];
	for (const [id, s] of specs) {
		out.push({
			kind: "Spec",
			id,
			title: s.title,
			text: s.purpose,
			context: "",
			href: specPath(id)
		});
		const newest = plans.find((p) => p.spec === id);
		out.push({
			kind: "Stage",
			id,
			title: `Spec · ${id}`,
			text: "",
			context: id,
			href: specPath(id)
		});
		if (newest) {
			out.push({
				kind: "Stage",
				id,
				title: `Plan · ${id}`,
				text: "",
				context: id,
				href: planHref(id, newest.work)
			});
			out.push({
				kind: "Stage",
				id,
				title: `Build · ${id}`,
				text: "",
				context: id,
				href: planHref(id, newest.work, "build")
			});
		}
		for (const r of s.requirements) {
			out.push({
				kind: "Requirement",
				id: r.id,
				title: r.name,
				text: r.statement,
				context: id,
				href: refHref(id, r.id)
			});
			for (const sc of r.scenarios) {
				const ref = `${r.id}.${sc.id}`;
				out.push({
					kind: "Scenario",
					id: ref,
					title: sc.name,
					text: sc.steps.map((x) => x.text).join(" "),
					context: id,
					href: refHref(id, ref)
				});
			}
		}
		for (const d of s.decisions) out.push({
			kind: "Decision",
			id: d.id,
			title: d.text.slice(0, 120),
			text: d.text,
			context: id,
			href: refHref(id, d.id)
		});
		for (const q of s.questions) out.push({
			kind: "Question",
			id: q.id,
			title: q.text,
			text: q.owner,
			context: id,
			href: refHref(id, q.id)
		});
	}
	for (const p of plans) {
		out.push({
			kind: "Plan",
			id: p.work,
			title: `Plan ${p.work}`,
			text: p.verticals.map((v) => v.name).join(" "),
			context: p.spec,
			href: planHref(p.spec, p.work)
		});
		for (const v of p.verticals) {
			for (const t of v.tasks ?? []) out.push({
				kind: "Task",
				id: t.id,
				title: t.title,
				text: t.proves.join(" "),
				context: `${p.spec} · ${p.work} · ${v.name}`,
				href: planHref(p.spec, p.work, v.name, t.id)
			});
			for (const s of v.design ?? []) {
				if (s.name !== "Patterns") continue;
				for (const b of s.blocks) if (b.t === "list") for (const it of b.items) {
					const m = /^\*\*([PN]\d+)\s+([^:*]+)/.exec(it.text);
					if (m) out.push({
						kind: "Pattern",
						id: m[1],
						title: m[2].trim(),
						text: it.text,
						context: `${p.spec} · ${p.work} · ${v.name}`,
						href: planHref(p.spec, p.work, v.name, m[1])
					});
				}
			}
		}
	}
	return out;
}
// server/index.ts
function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
var root = resolve(arg("workspace", join(process.cwd(), ".factree")));
var startPort = Number(arg("port", String(DEFAULT_PORT)));
var here = dirname(fileURLToPath(import.meta.url));
var publicDir = [
	join(here, "public"),
	join(here, "..", "ui"),
	join(here, "..", "..", "dist", "ui")
].find((d) => existsSync(join(d, "index.html")));
var build = publicDir ? createHash("sha1").update(readFileSync(join(publicDir, "index.html"))).digest("hex").slice(0, 12) : "";
if (!existsSync(root)) {
	console.error(`No Factree workspace at ${root}`);
	process.exit(1);
}
function gitUser() {
	try {
		return execFileSync("git", ["config", "user.name"], {
			cwd: dirname(root),
			encoding: "utf8"
		}).trim();
	} catch {
		return userInfo().username;
	}
}
var user = gitUser();
var running = [join(here, "..", ".claude-plugin", "plugin.json"), join(here, "..", "..", "..", "plugins", "factree", ".claude-plugin", "plugin.json")].filter((p) => existsSync(p)).map((p) => {
	try {
		return String(JSON.parse(readFileSync(p, "utf8")).version ?? "");
	} catch {
		return "";
	}
})[0] ?? "";
var repo = repoLink(dirname(root));
var TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".woff2": "font/woff2",
	".json": "application/json",
	".ico": "image/x-icon"
};
function send(res, status, body, type = "application/json; charset=utf-8") {
	res.writeHead(status, {
		"Content-Type": type,
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff"
	});
	res.end(body);
}
function json(res, status, value) {
	send(res, status, JSON.stringify(value));
}
function serveStatic(res, urlPath) {
	if (!publicDir) return send(res, 500, "UI build not found. Run npm run build in apps/companion.", "text/plain");
	const clean = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, "");
	let file = join(publicDir, clean);
	if (!file.startsWith(publicDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(publicDir, "index.html");
	send(res, 200, readFileSync(file), TYPES[extname(file)] ?? "application/octet-stream");
}
var clients = /* @__PURE__ */ new Set();
var lastPrint = fingerprint(root);
setInterval(() => {
	const now = fingerprint(root);
	if (now !== lastPrint) {
		lastPrint = now;
		for (const c of clients) c.write(`event: change\ndata: {}\n\n`);
	}
}, 700).unref();
var lastStatuses = statusSignature(workspaceState(root, user, Date.now(), repo, running));
setInterval(() => {
	const now = statusSignature(workspaceState(root, user, Date.now(), repo, running));
	if (now !== lastStatuses) {
		lastStatuses = now;
		for (const c of clients) c.write(`event: change\ndata: {}\n\n`);
	}
}, 15e3).unref();
setInterval(() => {
	for (const c of clients) c.write(`: keep-alive\n\n`);
}, 25e3).unref();
function decide(req, res, host) {
	try {
		checkDecisionRequest(req.method ?? "", req.headers, host);
	} catch (e) {
		return json(res, e instanceof DecisionError ? e.status : 400, { error: e.message });
	}
	let body = "";
	req.on("data", (chunk) => {
		body += chunk;
		if (body.length > 1e4) req.destroy();
	});
	req.on("end", () => {
		try {
			const state = workspaceState(root, user, Date.now(), repo, running);
			applyDecision(root, user, JSON.parse(body || "{}"), state.decisions);
			for (const c of clients) c.write(`event: change\ndata: {}\n\n`);
			json(res, 200, { ok: true });
		} catch (e) {
			json(res, e instanceof DecisionError ? e.status : 400, { error: e.message });
		}
	});
}
function handle(req, res) {
	const host = (req.headers.host ?? "").split(":")[0];
	if (host !== "localhost" && host !== "127.0.0.1") return send(res, 403, "Forbidden", "text/plain");
	if ((req.url ?? "").split("?")[0] === "/api/decisions" && req.method !== "GET") return decide(req, res, host);
	if (req.method !== "GET") return send(res, 405, "Read-only", "text/plain");
	const url = new URL(req.url ?? "/", "http://localhost");
	try {
		if (url.pathname === "/api/state") return json(res, 200, workspaceState(root, user, Date.now(), repo, running));
		if (url.pathname === "/api/search") return json(res, 200, searchIndex(root));
		const m = /^\/api\/specs\/([a-z0-9][a-z0-9-]*)$/.exec(url.pathname);
		if (m) {
			const detail = specDetail(root, m[1]);
			return detail ? json(res, 200, detail) : json(res, 404, { error: "No such spec" });
		}
		if (url.pathname === "/api/stream") {
			res.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-store",
				Connection: "keep-alive"
			});
			res.write(`event: hello\ndata: ${JSON.stringify({ build })}\n\n`);
			clients.add(res);
			req.on("close", () => clients.delete(res));
			return;
		}
		if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "Not found" });
		return serveStatic(res, url.pathname);
	} catch (err) {
		console.error(err);
		return json(res, 500, { error: "Something went wrong reading the workspace" });
	}
}
var infoFile = join(root, "ui.json");
function listen(port, attemptsLeft) {
	const server = createServer(handle);
	server.once("error", (err) => {
		if (err.code === "EADDRINUSE" && attemptsLeft > 0) return listen(port + 1, attemptsLeft - 1);
		console.error(err.message);
		process.exit(1);
	});
	server.listen(port, "127.0.0.1", () => {
		const url = `http://localhost:${port}`;
		writeFileSync(infoFile, JSON.stringify({
			pid: process.pid,
			port,
			url,
			started: (/* @__PURE__ */ new Date()).toISOString()
		}) + "\n");
		console.log(`Factree UI for ${root}\n${url}`);
	});
}
function cleanup() {
	try {
		if (JSON.parse(readFileSync(infoFile, "utf8")).pid === process.pid) unlinkSync(infoFile);
	} catch {}
	process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
listen(startPort, 10);
export {};
