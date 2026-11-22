import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuildTab } from "../src/components/plan/BuildTab.tsx";
import type { Plan, TaskBuild, BranchReview } from "../shared/types.ts";

const task = (id: string, dependsOn: string[] = []) => ({ id, title: `title ${id}`, dependsOn });
function html(build: Record<string, TaskBuild>, branchReview?: BranchReview | null) {
  const plan = { work: "w", verticals: [{ name: "backend", tasks: ["T1", "T2", "T3", "T4"].map((t) => task(t, t === "T4" ? ["T2"] : [])) }], build, implementedAt: "", branchReview } as unknown as Plan;
  return renderToStaticMarkup(createElement(BuildTab, { plan, specId: "s" }));
}
const panel = (o: Partial<BranchReview> = {}): BranchReview => ({ phase: "probing", findings: [], notProbed: [], rounds: [], verdict: "", must: 0, should: 0, ...o });

describe("Build tab rows", () => {
  it("Reviewing [build-visibility#R2.S1]", () => {
    expect(html({ T2: { status: "running", phase: "reviewing" } })).toContain("Reviewing");
  });
  it("Waiting: reason [build-visibility#R2.S2]", () => {
    expect(html({ T4: { status: "waiting", phase: "waiting", reason: "shares src/app.js region with T2" } })).toContain("Waiting: shares src/app.js region with T2");
  });
  it("Fix round with cause [build-visibility#R2.S3]", () => {
    expect(html({ T3: { status: "running", phase: "fixing", round: 1, cause: "fix-loop names missing" } })).toContain("Fix round 1: fix-loop names missing");
  });
  it("merged row [build-visibility#R2.S4]", () => {
    const h = html({ T1: { status: "done", phase: "merged", commit: "abc1234", lines: 40, verdict: "pass/pass", reviewerRecorded: true, findings: 2, suggestions: 1, model: "sonnet" } });
    for (const s of ["abc1234", "40 lines", "reviewed ✓", "2 findings · 1 suggestion not built", "sonnet"]) expect(h).toContain(s);
  });
  it("review not recorded [build-visibility#R2.S5]", () => {
    const h = html({ T1: { status: "done", phase: "merged", commit: "a", lines: 1, verdict: "pass/pass", reviewerRecorded: false } });
    expect(h).toContain("review not recorded");
    expect(h).not.toContain("reviewed ✓");
  });
  it("Reviewed ✓, merging [build-visibility#R2.S6]", () => {
    expect(html({ T1: { status: "running", phase: "reviewing", verdict: "pass/pass", reviewerRecorded: true } })).toContain("Reviewed ✓, merging");
  });
});

describe("branch review panel", () => {
  it("lists should-fix first with evidence [build-visibility#R3.S1]", () => {
    const h = html({}, panel({ findings: [{ severity: "minor", text: "m1", evidence: "e1" }, { severity: "should-fix", text: "sf", evidence: "grep verif README.md" }, { severity: "minor", text: "m2", evidence: "e2" }] }));
    expect(h.indexOf("grep verif README.md")).toBeGreaterThan(-1);
    expect(h.indexOf("sf")).toBeLessThan(h.indexOf("m1"));
    expect(h.indexOf("m1")).toBeLessThan(h.indexOf("m2"));
    expect(h).toContain("Probing");
  });
  it("not probed with reason [build-visibility#R3.S2]", () => {
    const h = html({}, panel({ notProbed: [{ area: "browser rendering", reason: "no browser here" }] }));
    expect(h).toContain("Not probed");
    expect(h).toContain("browser rendering");
    expect(h).toContain("no browser here");
  });
  it("fix round and outcome [build-visibility#R3.S3]", () => {
    const h = html({}, panel({ phase: "ended", verdict: "ready", rounds: [{ round: 1, cause: "should-fix" }] }));
    expect(h).toContain("Fix round 1: should-fix");
    expect(h).toContain("Ready: 0 must-fix open");
    expect(html({}, panel({ phase: "ended", verdict: "not ready", must: 2 }))).toContain("2 must-fix open");
  });
  it("no panel before the branch review [build-visibility#R3.S4]", () => {
    expect(html({ T1: { status: "running", phase: "building" } }, null)).not.toContain("Branch review");
  });
});
