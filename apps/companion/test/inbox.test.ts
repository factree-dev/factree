import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceState } from "../server/workspace.ts";

const exampleSpec = readFileSync(fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url)), "utf8");
const NOW = Date.parse("2026-11-17T12:00:00Z");
const at = (min: number) => new Date(NOW - min * 60000).toISOString();
let root: string;
function events(lines: object[]) { writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n"); }
function spec(id: string, status: string) {
  writeFileSync(join(root, "specs", `${id}.md`), exampleSpec.replace(/^id: .*$/m, `id: ${id}`).replace(/^status: .*$/m, `status: ${status}`));
}
function plan(work: string, specId: string, design: string) {
  mkdirSync(join(root, "work", work, "general"), { recursive: true });
  writeFileSync(join(root, "work", work, "plan.md"), `---\nwork: ${work}\nspec: ${specId}\nscope: [R1]\nverticals: [general]\nstatus: draft\n---\n# Plan\n\n## Context\nx\n`);
  writeFileSync(join(root, "work", work, "general", "design.md"), `---\nwork: ${work}\nvertical: general\n---\n# Design\n\n${design}\n`);
  writeFileSync(join(root, "work", work, "general", "tasks.md"), `---\nwork: ${work}\nvertical: general\n---\n### T1: One\n**Proves:** ${specId}#R1.S1\n**Depends on:** none\n`);
}
const cards = () => workspaceState(root, "John Doe", NOW).decisions;

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  spec("link-report", "approved");
});

describe("waiting decisions", () => {
  it("a question card carries its recommendation, options and links [companion-decisions#R2.S1]", () => {
    events([
      { ts: at(20), type: "spec.step", spec: "link-report", data: { step: "questions" } },
      { ts: at(10), type: "question.asked", spec: "link-report", data: { n: 3, text: "Where does the Copy button go? (R5)", why: "Decides R5.S1", proposal: "Beside each scenario id", options: ["In the card header — one button per requirement"] } },
    ]);
    const c = cards().find((x) => x.kind === "question")!;
    expect(c).toMatchObject({ spec: "link-report", n: 3, recommendation: "Beside each scenario id", options: ["In the card header — one button per requirement"], approvable: true });
    expect(c.links.map((l) => l.href)).toEqual(["/work/link-report/spec", "/work/link-report/spec/requirements/R5", "/work/link-report/spec/requirements/R5.S1"]);
  });

  it("a plan card names its new patterns and links to them [companion-decisions#R2.S2]", () => {
    plan("015-build", "link-report", "## Patterns\n\n### Reused\n- **P1 X:** `a.ts:1`. Fits.\n\n### New\n- **N1 Tasks in isolated git worktrees:** Needed because parallel. Alternatives: none. Approved: <pending>\n");
    const c = cards().find((x) => x.kind === "plan")!;
    expect(c).toMatchObject({ work: "015-build", approvable: true });
    expect(c.newPatterns).toEqual([{ id: "N1", text: "Tasks in isolated git worktrees", href: "/work/link-report/plan/015-build/general/design/N1" }]);
    expect(c.links.map((l) => l.href)).toContain("/work/link-report/plan/015-build");
  });

  it("a spec can't be approved while a question is open [companion-decisions#R4.S2]", () => {
    spec("version-check", "draft");
    events([
      { ts: at(20), type: "spec.step", spec: "version-check", data: { step: "approval" } },
      { ts: at(10), type: "question.asked", spec: "version-check", data: { n: 2, text: "Which signal?", why: "", proposal: "Local" } },
    ]);
    const c = cards().find((x) => x.kind === "spec" && x.spec === "version-check")!;
    expect(c).toMatchObject({ approvable: false, blockedReason: "Answer question 2 first" });
  });

  it("a plan with a drafted lens goes to Claude [companion-decisions#R5.S2]", () => {
    plan("010-lenses", "link-report", "> Written with the generated `tooling` lens (pending approval).\n\n## Patterns\n\n### Reused\n- **P1 X:** `a.ts:1`. Fits.\n\n### New\nNone.\n");
    const c = cards().find((x) => x.kind === "plan")!;
    expect(c).toMatchObject({ approvable: false, blockedReason: "A drafted lens needs approval in Claude" });
  });

  it("failed build tasks wait for a decision", () => {
    plan("016-verify", "link-report", "## Patterns\n\n### Reused\n- **P1 X:** `a.ts:1`. Fits.\n\n### New\nNone.\n");
    events([{ ts: at(5), type: "task.failed", work: "016-verify", data: { task: "T1", reason: "over budget: 410 lines" } }]);
    const s = workspaceState(root, "John Doe", NOW);
    expect(s.decisions.find((x) => x.kind === "task")).toMatchObject({ title: "T1 failed: over budget: 410 lines", recommendation: "Split the task with /factree:plan", approvable: false });
  });
});

import { applyDecision, checkDecisionRequest } from "../server/decisions.ts";
describe("deciding in the companion", () => {
  const decide = (body: object) => applyDecision(root, "John Doe", body, workspaceState(root, "John Doe", NOW).decisions, "2026-11-17");
  const stateSh = fileURLToPath(new URL("../../../plugins/factree/scripts/state.sh", import.meta.url));
  const state = (...a: string[]) => execFileSync("bash", [stateSh, ...a], { env: { ...process.env, FACTREE_HOME: root }, cwd: join(root, ".."), encoding: "utf8" });
  const log = () => readFileSync(join(root, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

  it("answers a question [companion-decisions#R3.S1]", () => {
    events([
      { ts: at(20), type: "spec.step", spec: "link-report", data: { step: "questions" } },
      { ts: at(10), type: "question.asked", spec: "link-report", data: { n: 3, text: "Where?", why: "", proposal: "Beside each scenario id" } },
    ]);
    decide({ kind: "answer", spec: "link-report", n: 3, answer: "Beside each scenario id" });
    expect(log().at(-1)).toMatchObject({ type: "question.answered", spec: "link-report", data: { n: 3, answer: "Beside each scenario id", by: "John Doe", via: "companion" } });
    expect(log().at(-1).session).toBeUndefined();   // never stamped with the session that started the server
    expect(workspaceState(root, "John Doe", NOW).decisions.filter((c) => c.kind === "question")).toEqual([]);
  });

  it("approves a spec [companion-decisions#R4.S1]", () => {
    spec("version-check", "draft");
    events([]);
    decide({ kind: "approve-spec", spec: "version-check" });
    const text = readFileSync(join(root, "specs", "version-check.md"), "utf8");
    expect(text).toMatch(/^status: approved$/m);
    expect(state("version-check", "show")).toContain('"spec": "approved"');   // [status-state#R7.S1]
    expect(text).toMatch(/^approved_by: John Doe \(via companion\)$/m);
    expect(text).toMatch(/^approved_at: 2026-11-17$/m);
    expect(log().at(-1)).toMatchObject({ type: "spec.approved", spec: "version-check", data: { move: "approve", by: "John Doe", via: "companion" } });
  });

  it("approving in the companion runs state.sh approve with by and via, state reads approved [status-state#R7.S1]", () => {
    spec("version-check", "draft");
    events([]);
    decide({ kind: "approve-spec", spec: "version-check" });
    expect(state("version-check", "show")).toMatch(/"spec": "approved"/);
    expect(log().filter((e) => e.type === "spec.approved")).toHaveLength(1);
    expect(log().at(-1).data).toMatchObject({ move: "approve", by: "John Doe", via: "companion" });
  });

  const design = "## Patterns\n\n### Reused\n- **P1 X:** `a.ts:1`. Fits.\n\n### New\nNone.\n";

  it("a refused move returns 409 with the script's message [status-state#R7.S1]", () => {
    spec("version-check", "approved");
    plan("015-build", "version-check", design);
    events([]);
    mkdirSync(join(root, "state"), { recursive: true });
    writeFileSync(join(root, "state", "version-check.json"), "{\n  not json\n}\n");   // a state file state.sh can't read refuses every move
    const err = (() => { try { decide({ kind: "approve-plan", work: "015-build" }); } catch (e) { return e as { status: number; message: string }; } })();
    expect(err).toMatchObject({ status: 409 });
    expect(err!.message).toMatch(/not readable/);
    expect(readFileSync(join(root, "work", "015-build", "plan.md"), "utf8")).not.toMatch(/^status: approved$/m);
  });

  it("approving a plan on an un-migrated workspace succeeds and state reads approved [status-state#R7.S1]", () => {
    spec("version-check", "approved");
    plan("015-build", "version-check", design);
    events([]);
    decide({ kind: "approve-plan", work: "015-build" });   // no state/ before this
    expect(state("version-check", "show")).toMatch(/"plan.015-build": "approved"/);
    expect(readFileSync(join(root, "work", "015-build", "plan.md"), "utf8")).toMatch(/^status: approved$/m);
  });

  it("a plan already approved answers again and changes nothing; a retry fills in what a failed write missed [status-state#R7.S1]", () => {
    spec("version-check", "approved");
    plan("015-build", "version-check", design);
    events([]);
    decide({ kind: "approve-plan", work: "015-build" });
    const planFile = join(root, "work", "015-build", "plan.md");
    const before = readFileSync(planFile, "utf8");
    const n = log().length;
    decide({ kind: "approve-plan", work: "015-build" });
    expect(readFileSync(planFile, "utf8")).toBe(before);
    expect(log().filter((e) => e.type === "plan.design_approved")).toHaveLength(1);
    expect(log().length).toBeGreaterThanOrEqual(n);
    writeFileSync(planFile, before.replace(/^(design_)?approved_(by|at):.*\n/gm, ""));   // the file writes failed after the move
    decide({ kind: "approve-plan", work: "015-build" });
    expect(readFileSync(planFile, "utf8")).toMatch(/^approved_by: John Doe \(via companion\)$/m);
    expect(readFileSync(planFile, "utf8")).toMatch(/^status: approved$/m);
  });

  it("a change request on an approved spec moves it back to writing [status-state#R7.S1]", () => {
    spec("version-check", "approved");
    plan("017-x", "version-check", "## Patterns\n\n### Reused\n- **P1 X:** `a.ts:1`. Fits.\n\n### New\nNone.\n");   // a plan waiting is a card on the spec
    events([]);
    state("version-check", "approve"); state("version-check", "plan", "work=017-x");
    decide({ kind: "feedback", spec: "version-check", note: "rethink R2" });
    expect(state("version-check", "show")).toMatch(/"spec": "writing"/);
  });

  it("approves a plan and its new pattern [companion-decisions#R5.S1]", () => {
    plan("015-build", "link-report", "## Patterns\n\n### Reused\n- **P1 X:** `a.ts:1`. Fits.\n\n### New\n- **N1 Tasks in isolated git worktrees:** Needed because parallel. Alternatives: none. Approved: <pending>\n");
    events([]);
    state("link-report", "approve"); state("link-report", "plan", "work=015-build");
    events([]);
    decide({ kind: "approve-plan", work: "015-build" });
    const p = readFileSync(join(root, "work", "015-build", "plan.md"), "utf8");
    expect(p).toMatch(/^status: approved$/m);
    expect(p).toMatch(/^design_approved_by: John Doe \(via companion\)$/m);
    expect(p).toMatch(/^approved_by: John Doe \(via companion\)$/m);
    expect(readFileSync(join(root, "work", "015-build", "general", "design.md"), "utf8")).toContain("Approved: John Doe (via companion), 2026-11-17");
    expect(log().map((e) => e.type)).toEqual(["plan.approved", "plan.design_approved"]);
    expect(log()[1].data.new_patterns).toEqual(["N1"]);
  });

  it("requests changes with a note [companion-decisions#R6.S1]", () => {
    plan("016-verify", "link-report", "## Patterns\n\n### Reused\n- **P1 X:** `a.ts:1`. Fits.\n\n### New\nNone.\n");
    events([]);
    decide({ kind: "feedback", spec: "link-report", work: "016-verify", note: "split T4" });
    expect(log().at(-1)).toMatchObject({ type: "decision.feedback", spec: "link-report", data: { note: "split T4", work: "016-verify", via: "companion" } });
    expect(workspaceState(root, "John Doe", NOW).decisions.find((c) => c.kind === "plan")!.feedback).toBe("split T4");
  });

  it("refuses requests from another origin [companion-decisions#R10.S1]", () => {
    expect(() => checkDecisionRequest("POST", { origin: "https://evil.example", "x-factree": "decide" }, "localhost")).toThrow("Wrong origin");
    expect(() => checkDecisionRequest("POST", { origin: "http://localhost:4747" }, "localhost")).toThrow("Missing X-Factree header");
    expect(() => checkDecisionRequest("POST", { origin: "http://localhost:4747", "x-factree": "decide" }, "localhost")).not.toThrow();
  });

  it("refuses anything else [companion-decisions#R10.S2]", () => {
    events([]);
    const before = readFileSync(join(root, "specs", "link-report.md"), "utf8");
    expect(() => decide({ kind: "edit-requirement", spec: "link-report", text: "R1 …" })).toThrow("Unknown decision");
    expect(() => decide({ kind: "approve-spec", spec: "link-report" })).toThrow("isn't waiting");
    expect(readFileSync(join(root, "specs", "link-report.md"), "utf8")).toBe(before);
    expect(readFileSync(join(root, "events.jsonl"), "utf8").trim()).toBe("");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Inbox, inboxKey, sessionLine } from "../src/components/Inbox.tsx";
import { waitingLabel, waitingCounts } from "../src/status.ts";
import { decisionsRedirect } from "../src/links.ts";
import { SpecLink } from "../src/components/Sidebar.tsx";
import type { DecisionCard } from "../shared/types.ts";

const card = (over: Partial<DecisionCard>): DecisionCard => ({
  id: "x", kind: "question", spec: "link-report", title: "Where?", why: "", options: [], links: [], since: at(5), session: null, approvable: true, ...over,
});

describe("the inbox", () => {
  it("marks only the spec that waits, with its count [companion-decisions#R1.S1]", () => {
    const counts = waitingCounts([card({ id: "a", spec: "bulk-export" }), card({ id: "b", spec: "bulk-export" })]);
    expect(counts.get("bulk-export")).toBe(2);
    expect(counts.has("link-report")).toBe(false);
    expect(waitingLabel(2)).toBe("2 decisions");
    expect(waitingLabel(1)).toBe("1 decision");
    const s = workspaceState(root, "John Doe", NOW) as unknown as Record<string, unknown>;
    expect("factory" in s).toBe(false);
  });

  it("nothing waiting, nothing marked [companion-decisions#R1.S2]", () => {
    expect(waitingLabel(0)).toBeNull();
    const row = (w: number) => renderToStaticMarkup(createElement(SpecLink, { s: workspaceState(root, "John Doe", NOW).specs[0]!, active: false, waiting: w }));
    expect(row(0)).not.toContain("waiting-count");
    expect(row(2)).toContain('<span class="waiting-count">2 decisions</span>');
  });

  it("an old /decisions link opens the oldest waiting spec [companion-decisions#R2.S5]", () => {
    expect(decisionsRedirect([card({ spec: "audit-log" }), card({ spec: "bulk-export" })])).toBe("/work/audit-log/spec/decisions");
    expect(decisionsRedirect([])).toBe("/");
  });

  it("open session: go to the terminal [companion-decisions#R7.S1]", () => {
    const s = sessionLine(card({ session: { id: "611a0794-d356-4c30-a967-cc8cb6f9f85a", last: at(1), state: "your_turn" } }));
    expect(s).toEqual({ text: "Open in your terminal: session 611a0794 is waiting for you", resume: null });
  });

  it("closed session: copy resume [companion-decisions#R7.S2]", () => {
    const s = sessionLine(card({ session: { id: "611a0794-d356-4c30-a967-cc8cb6f9f85a", last: at(1), state: "ended" } }));
    expect(s.resume).toBe("claude --resume 611a0794-d356-4c30-a967-cc8cb6f9f85a");
  });

  it("clears a queue from the keyboard [companion-decisions#R9.S1]", () => {
    const cards = [
      card({ id: "q1", n: 1, recommendation: "Beside each id" }),
      card({ id: "q2", n: 2, recommendation: "Copy once", options: ["Copy twice — no feedback"] }),
      card({ id: "s", kind: "spec", title: "Approve spec" }),
    ];
    const keys = ["Enter", "j", "2", "j", "Enter"];
    let sel = 0; const decided: unknown[] = [];
    for (const k of keys) {
      const a = inboxKey(k, sel, cards);
      if (a.t === "move") sel = a.to; else if (a.t === "decide") decided.push(a.body);
    }
    expect(decided).toEqual([
      { kind: "answer", spec: "link-report", n: 1, answer: "Beside each id" },
      { kind: "answer", spec: "link-report", n: 2, answer: "Copy twice" },
      { kind: "approve-spec", spec: "link-report" },
    ]);
  });

  it("a card shows the recommendation, options and links", () => {
    const h = renderToStaticMarkup(createElement(Inbox, { cards: [card({ n: 3, recommendation: "Beside each scenario id", options: ["In the card header — one per requirement"], links: [{ label: "R5", href: "/work/link-report/spec/requirements/R5" }] })], onDecide: async () => null }));
    expect(h).toContain("Beside each scenario id <kbd>Enter</kbd>");
    expect(h).toContain("In the card header <kbd>2</kbd>");
    expect(h).toContain('href="/work/link-report/spec/requirements/R5"');
    expect(h).not.toContain("factory");
  });
});

import { SpecView } from "../src/components/SpecView.tsx";
import { WaitingLine } from "../src/components/Notices.tsx";
import { specDetail } from "../server/workspace.ts";

describe("decisions in their spec", () => {
  const tab = (cs: DecisionCard[], specId = "link-report") =>
    renderToStaticMarkup(createElement(SpecView, { detail: specDetail(root, specId, NOW)!, user: "", focus: null, tab: "decisions", cards: cs, onDecide: async () => null }));

  it("a question's card sits in its spec's Decisions tab [companion-decisions#R2.S1]", () => {
    const h = tab([card({ n: 3, title: "Where does the Copy button go?", recommendation: "Beside each scenario id", options: ["In the card header — one per requirement"], links: [{ label: "R5", href: "/work/link-report/spec/requirements/R5" }] })]);
    expect(h).toMatch(/aria-label="Waiting on you"[\s\S]*Where does the Copy button go\?/);
    expect(h).toContain("Beside each scenario id <kbd>Enter</kbd>");
    expect(h).toContain('href="/work/link-report/spec/requirements/R5"');
    expect(h).toMatch(/class="tab attention"[^>]*>Decisions/);
  });

  it("a plan approval names its new pattern, in the tab [companion-decisions#R2.S2]", () => {
    const h = tab([card({ kind: "plan", work: "015-build", title: "Approve plan 015-build", newPatterns: [{ id: "N1", text: "Worktree per task", href: "/work/link-report/plan/015-build/backend/design/N1" }], links: [{ label: "Plan", href: "/work/link-report/plan/015-build" }] })]);
    expect(h).toContain("Approve plan 015-build");
    expect(h).toContain('href="/work/link-report/plan/015-build/backend/design/N1"');
    expect(h).toContain("Approve plan <kbd>Enter</kbd>");
  });

  it("every other view shows one line to the tab [companion-decisions#R2.S3]", () => {
    const h = renderToStaticMarkup(createElement(WaitingLine, { spec: "bulk-export", n: 2 }));
    expect(h).toBe('<a class="waiting-line" href="/work/bulk-export/spec/decisions">2 decisions waiting<span>Decide</span></a>');
    expect(renderToStaticMarkup(createElement(WaitingLine, { spec: "x", n: 0 }))).toBe("");
  });

  it("a spec with nothing waiting has no cards [companion-decisions#R2.S4]", () => {
    const h = tab([]);
    expect(h).not.toContain('aria-label="Waiting on you"');
    expect(h).not.toContain("dcard");
  });

  it("taking a recommendation in the tab records the answer [companion-decisions#R3.S1]", () => {
    const c = card({ n: 3, recommendation: "Beside each id" });
    expect(inboxKey("Enter", 0, [c])).toEqual({ t: "decide", body: { kind: "answer", spec: "link-report", n: 3, answer: "Beside each id" } });
    expect(tab([c])).toContain("Beside each id <kbd>Enter</kbd>");   // the recommendation is the primary button (decide-focus R2)
  });
});

import { LoopLine } from "../src/components/LoopLine.tsx";
describe("one place for a question", () => {
  it("the progress panel doesn't repeat the question [companion-decisions#R2.S6]", () => {
    spec("bulk-export", "draft");
    events([
      { ts: at(20), type: "spec.step", spec: "bulk-export", data: { step: "questions" } },
      { ts: at(10), type: "question.asked", spec: "bulk-export", data: { n: 1, text: "One file or a zip?", proposal: "One file" } },
    ]);
    const d = specDetail(root, "bulk-export", NOW)!;
    expect(d.summary.live.open && d.summary.live.pendingQuestion).toBeTruthy();
    const h = renderToStaticMarkup(createElement(LoopLine, { summary: d.summary, spec: d.spec, view: "spec" }));
    expect(h).not.toContain("class=\"live");   // no progress panel at all now (spec-progress R1)
    expect(h).not.toContain("One file or a zip?");
    expect(h).not.toContain("Answer in Claude Code");
    expect(cards().some((c) => c.spec === "bulk-export" && c.title.includes("One file or a zip?"))).toBe(true);
  });
});
