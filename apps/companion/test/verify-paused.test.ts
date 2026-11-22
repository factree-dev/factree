import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { reviewStage } from "../src/stages.ts";
import { progressOf } from "../src/progress.ts";
import { LoopLine } from "../src/components/LoopLine.tsx";
import { loopOf } from "../server/loop.ts";
import { VERIFY_ON } from "../src/features.ts";
import type { Spec, SpecSummary } from "../shared/types.ts";

const spec = { status: "approved", approvedAt: "2026-11-18" } as Spec;
const built = (over: Partial<SpecSummary> = {}): SpecSummary => ({
  id: "link-report", title: "report", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 2, scenarios: 4, openQuestions: 0,
  live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null },
  plan: { work: "002-link-report", status: "approved", approvedAt: "2026-11-18", others: 0, tasks: 3, done: 3, implemented: true }, verify: null, ...over,
}) as SpecSummary;

describe("verify paused", () => {
  it("is off by default", () => expect(VERIFY_ON).toBe(false));

  it("four stages with verify off [verify-paused#R4.S1]", () => {
    const h = renderToStaticMarkup(createElement(LoopLine, { summary: built(), spec, view: "plan" }));
    const p = progressOf(built(), spec);
    expect(p.stages.map((x) => x.name)).toEqual(["Spec", "Plan", "Build", "Review"]);
    expect(h).not.toContain('data-stage="verify"');
    expect(p.stages[3]).toMatchObject({ sub: "Open the pull request", href: "/work/link-report/review" });
    expect(reviewStage(built(), false).sub).not.toMatch(/Verify it first|failing/);
    expect(reviewStage(built({ verify: { proved: 1, failing: 2, unverified: 0, at: "x" } }), false).sub).toBe("Open the pull request");
  });

  it("ring and row count four stages, Build done [verify-paused#R4.S4]", () => {
    const p = progressOf(built(), spec);
    expect(p.pct).toBe(75);
    expect(p.current).toBe("review");
    expect(progressOf(built({ plan: { ...built().plan!, implemented: false, done: 0 } }), spec).stages.map((x) => x.fill)).toEqual([1, 1, 0, 0]);
    expect(loopOf("link-report", new Set(), [], false).stale).toHaveLength(4);
  });

  it("verify on keeps five stages and the old review rule [verify-paused#R6.S1]", () => {
    const p = progressOf(built(), spec, 0, true);
    expect(p.stages.map((x) => x.name)).toEqual(["Spec", "Plan", "Build", "Verify", "Review"]);
    expect(p.pct).toBe(60);
    expect(reviewStage(built(), true).sub).toBe("Verify it first");
    expect(reviewStage(built({ verify: { proved: 1, failing: 2, unverified: 0, at: "x" } }), true).sub).toBe("Fix what's failing first");
    expect(loopOf("link-report", new Set(), [], true).stale).toHaveLength(5);
  });
});
