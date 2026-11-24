import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { specDetail } from "../server/workspace.ts";
import { LoopLine } from "../src/components/LoopLine.tsx";
import { progressOf } from "../src/progress.ts";
import { brief } from "../server/loop.ts";
import { SpecLink } from "../src/components/Sidebar.tsx";
import type { SpecSummary } from "../shared/types.ts";

let root: string;
const at = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const step = (min: number, s: string) => ({ ts: at(min), type: "spec.step", spec: "spec-order", data: { step: s, ...(s === "gaps" ? { title: "Spec list order" } : {}) } });
const log = (lines: object[]) => writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
const page = () => {
  const d = specDetail(root, "spec-order")!;
  return { d, h: renderToStaticMarkup(createElement(LoopLine, { summary: d.summary, spec: d.spec, view: "spec" })) };
};
const noPanel = (h: string) => { expect(h).not.toContain('class="live'); expect(h).not.toContain('class="steps"'); };
beforeEach(() => { root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree"); mkdirSync(join(root, "specs"), { recursive: true }); });

describe("spec progress", () => {
  it("reading the code, no panel [spec-progress#R1.S1]", () => {
    log([step(3, "gaps"), step(1, "observe")]);
    const { h } = page();
    expect(h).toMatch(/Writing<span class="ellipsis"[^]*?<\/span> reading the code/);
    noPanel(h);
  });

  it("paused [spec-progress#R1.S2]", () => {
    log([step(50, "gaps"), step(40, "observe")]);
    const { h } = page();
    expect(h).toContain("Paused · 40 min ago");
    noPanel(h);
  });

  it("asking [spec-progress#R1.S3]", () => {
    log([step(3, "gaps"), step(2, "questions"), { ts: at(1), type: "question.asked", spec: "spec-order", data: { n: 1, text: "Which?", proposal: "This" } }]);
    const { h } = page();
    expect(h).toContain(">Asking you<");
    noPanel(h);
  });

  it("finishing [spec-progress#R1.S4]", () => {
    log([step(3, "gaps"), step(1, "approval")]);
    const { h, d } = page();
    expect(h).toMatch(/Writing<span class="ellipsis"[^]*?<\/span> finishing/);
    expect(h.toLowerCase()).not.toContain("your approval");
    expect(progressOf(d.summary, null).centre).not.toContain("approval");
  });

  it("the list doesn't say your approval", () => {
    log([step(3, "gaps"), step(1, "approval")]);
    expect(progressOf(page().d.summary, null).centre).not.toContain("your approval");
  });
});

describe("a held stage shows its reason [build-status#R4]", () => {
  const ev = (min: number, type: string, data: object) => ({ ts: at(min), type, spec: "spec-order", work: "064-x", data });
  const held = ev(22, "stage.held", { stage: "review", reason: "acceptance run on SHORT-43" });
  const summary = (events: ReturnType<typeof ev>[]) => ({
    id: "spec-order", title: "t", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 1, scenarios: 1, openQuestions: 0,
    live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null }, verify: null,
    plan: brief([{ work: "064-x", status: "approved", approvedAt: "2026-11-24", build: {} } as never], events as never),
  }) as never as SpecSummary;
  it("held review reads `Held: acceptance run on SHORT-43 · 22 min` on the spine and the row [build-status#R4.S1]", () => {
    const s = summary([held]);
    s.plan!.implemented = true;
    s.plan!.review = { pr: "42", url: "u", state: "OPEN", comments: [] } as never;   // the hold wins even with a pull request
    expect(progressOf(s, null).stages.find((x) => x.key === "review")!.sub).toBe("Held: acceptance run on SHORT-43 · 22 min");
    expect(renderToStaticMarkup(createElement(SpecLink, { s, active: false }))).toContain("Held: acceptance run on SHORT-43 · 22 min");
  });
  it("a live activity on the held stage doesn't hide the hold on the row [build-status#R4.S1]", () => {
    const s = summary([held]);
    s.plan!.implemented = true;
    s.activity = { stage: "review", label: "Reviewing", step: "following", since: at(1), paused: false, asking: false } as never;
    expect(renderToStaticMarkup(createElement(SpecLink, { s, active: false }))).toContain("Held: acceptance run on SHORT-43 · 22 min");
  });
  it("after stage.released it reads Open the pull request [build-status#R4.S2]", () => {
    const s = summary([held, ev(1, "stage.released", { stage: "review" })]);
    s.plan!.implemented = true;
    expect(s.plan!.hold).toBeUndefined();
    expect(progressOf(s, null, 0, false).stages.find((x) => x.key === "review")!.sub).toBe("Open the pull request");
  });
});
