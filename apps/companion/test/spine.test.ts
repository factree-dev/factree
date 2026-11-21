import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { planStage, buildStage, verifyStage } from "../src/stages.ts";
import { LoopLine } from "../src/components/LoopLine.tsx";
import { progressOf } from "../src/progress.ts";
import type { Spec, SpecSummary } from "../shared/types.ts";

const summary = (over: Partial<SpecSummary>): SpecSummary => ({
  id: "link-report", title: "report", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 2, scenarios: 4, openQuestions: 0,
  live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null },
  plan: null, verify: null, ...over,
});
const spec = (status: Spec["status"]) => ({ status, approvedAt: "2026-11-18" }) as Spec;
const plan = (over: object) => ({ work: "002-link-report", status: "approved", approvedAt: "2026-11-18", others: 0, tasks: 3, done: 0, implemented: false, ...over }) as SpecSummary["plan"];
// The stage rules as the loop line shows them (stage-spine, now drawn by the loop line: spec-ring D8).
const spine = (s: SpecSummary, sp: Spec, view = "plan") => renderToStaticMarkup(createElement(LoopLine, { summary: s, spec: sp, view }));
const stage = (h: string, name: string) => {   // one stage's segment, from its opening tag to its end
  const i = h.indexOf(`data-stage="${name.toLowerCase()}"`);
  const ends = [h.indexOf("</a>", i), h.indexOf("</div>", i)].filter((x) => x > 0);
  return h.slice(h.lastIndexOf("<", i), Math.min(...ends));
};

describe("the stage rules on the loop line", () => {
  it("new spec: nothing after Spec opens [stage-spine#R1.S1]", () => {
    const s = summary({ status: "draft" }), sp = spec("draft");
    expect(planStage(s, sp)).toMatchObject({ sub: "Approve the spec first", href: null });
    expect(buildStage(s)).toMatchObject({ sub: "Approve a plan first", href: null });
    expect(verifyStage(s)).toMatchObject({ sub: "Build it first", href: null });
    const h = spine(s, sp);
    for (const name of ["Plan", "Build", "Verify"]) expect(stage(h, name)).toContain('aria-disabled="true"');
  });

  it("plan approved, not built [stage-spine#R1.S2]", () => {
    const s = summary({ plan: plan({}) });
    expect(buildStage(s)).toMatchObject({ sub: "Not started", href: "/work/link-report/build/002-link-report" });
    expect(verifyStage(s)).toMatchObject({ sub: "Build it first", href: null });
    expect(stage(spine(s, spec("approved")), "Verify")).toContain('aria-disabled="true"');
  });

  it("built [stage-spine#R1.S3]", () => {
    const s = summary({ plan: plan({ done: 3, implemented: true }) });
    expect(verifyStage(s)).toMatchObject({ sub: "Not verified", href: "/work/link-report/verify" });
  });

  it("an earlier result [stage-spine#R1.S4]", () => {
    const s = summary({ plan: plan({ work: "003-link-report" }), verify: { proved: 11, failing: 0, unverified: 0, at: "2026-11-17T10:00:00Z" } });
    expect(verifyStage(s)).toMatchObject({ sub: "11 proved", href: "/work/link-report/verify", done: false });
  });

  it("spec back to draft: no ticks after it [stage-spine#R2.S1]", () => {
    const s = summary({ status: "draft", plan: plan({ done: 3, implemented: true }) });
    const h = spine(s, spec("draft"));
    for (const name of ["Spec", "Plan", "Build"]) expect(stage(h, name)).not.toContain("loop-seg done");
  });

  it("clean result, newer plan not built: no tick on Verify [stage-spine#R2.S2]", () => {
    const s = summary({ plan: plan({ work: "003-link-report" }), verify: { proved: 8, failing: 0, unverified: 0, at: "2026-11-17T10:00:00Z" } });
    expect(verifyStage(s).done).toBe(false);
    expect(stage(spine(s, spec("approved")), "Verify")).not.toContain("loop-seg done");
  });

  it("all done: every tick", () => {
    const s = summary({ plan: plan({ done: 3, implemented: true }), verify: { proved: 4, failing: 0, unverified: 0, at: "2026-11-18T10:00:00Z" } });
    const h = spine(s, spec("approved"));
    for (const name of ["Spec", "Plan", "Build", "Verify"]) expect(stage(h, name)).toContain("loop-seg done");
  });
});

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceState } from "../server/workspace.ts";
describe("verify done when only a person is left", () => {
  const built = (verify: object) => summary({ plan: plan({ done: 3, implemented: true }), verify: { at: "2026-11-18T10:00:00Z", ...verify } as SpecSummary["verify"] });
  it("only manual cases left [stage-spine#R4.S1]", () => {
    expect(verifyStage(built({ proved: 8, failing: 0, unverified: 3, manual: 3 }))).toMatchObject({ done: true, sub: "8 proved · 3 need a person" });
  });
  it("a test is missing [stage-spine#R4.S2]", () => {
    expect(verifyStage(built({ proved: 8, failing: 0, unverified: 3, manual: 2 }))).toMatchObject({ done: false, sub: "8 proved · 1 unverified · 2 need a person" });
  });
  it("something failing [stage-spine#R4.S3]", () => {
    expect(verifyStage(built({ proved: 8, failing: 1, unverified: 2, manual: 2 })).done).toBe(false);
  });
  const verified = (results: object | undefined) => {
    const root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree"); mkdirSync(join(root, "specs"), { recursive: true });
    writeFileSync(join(root, "specs", "demo.md"), "---\nid: demo\ntitle: Demo\nstatus: approved\n---\n# Demo\n\n## Purpose\nx\n");
    writeFileSync(join(root, "events.jsonl"), JSON.stringify({ ts: "2026-11-18T10:00:00Z", type: "spec.verified", spec: "demo", data: { proved: 1, failing: 0, unverified: 3, ...(results ? { results } : {}) } }) + "\n");
    return workspaceState(root, "A").specs[0]!.verify!;
  };
  it("the server counts manual cases", () => {
    const v = verified({ "R1.S1": { status: "unverified", evidence: "manual case not run since the build" }, "R1.S2": { status: "unverified", evidence: "manual case not run since the build" }, "R1.S3": { status: "unverified", evidence: "no test cites it" } });
    expect(v.manual).toBe(2);
  });
  it("an old result without details", () => {
    expect(verified(undefined).manual).toBe(0);
  });
});

describe("the current stage", () => {
  const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const approvedSpec = spec("approved");
  const current = (s: SpecSummary) => progressOf(s, approvedSpec).current;
  it("plan just approved [stage-spine#R5.S1]", () => {
    const s = summary({ plan: plan({}), lastActivity: ago(2) });
    expect(current(s)).toBe("build");
    expect(stage(spine(s, approvedSpec), "Build")).toContain("Build · Up next");
  });
  it("nothing moving [stage-spine#R5.S2]", () => {
    const h = spine(summary({ plan: plan({}), lastActivity: ago(40) }), approvedSpec);
    expect(stage(h, "Build")).toContain("Up next");
    expect(h).not.toMatch(/Starting|Ready/);
  });
  it("running [stage-spine#R5.S3]", () => {
    const s = summary({ plan: plan({ done: 1 }), lastActivity: ago(1), activity: { stage: "build", label: "Building", step: "T2 of 3", since: ago(1), paused: false, asking: false } });
    expect(current(s)).toBe("build");
    const h = spine(s, approvedSpec);
    expect(stage(h, "Build")).toContain('class="loop-seg running"');
    expect(h).toMatch(/Building<span class="ellipsis"/);
  });
  it("a result with gaps [stage-spine#R5.S4]", () => {
    const s = summary({ plan: plan({ done: 3, implemented: true }), lastActivity: ago(60), verify: { proved: 8, failing: 0, unverified: 1, manual: 0, at: ago(60) } });
    expect(current(s)).toBe("verify");
    expect(stage(spine(s, approvedSpec), "Verify")).toContain("8 proved · 1 unverified");
  });
  it("everything done [stage-spine#R5.S5]", () => {
    expect(current(summary({ plan: plan({ done: 3, implemented: true, review: { url: "u", state: "MERGED", comments: [] } }), verify: { proved: 4, failing: 0, unverified: 0, manual: 0, at: ago(5) } }))).toBeNull();
  });
  it("viewing another stage", () => {
    const s = summary({ plan: plan({}), lastActivity: ago(2) });
    expect(stage(spine(s, approvedSpec, "spec"), "Spec")).toContain('aria-current="step"');
    expect(current(s)).toBe("build");
  });
});
