import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { STATUS_META } from "../src/status.ts";
import { SpecLink } from "../src/components/Sidebar.tsx";
import type { SpecSummary } from "../shared/types.ts";

const statuses = Object.keys(STATUS_META) as (keyof typeof STATUS_META)[];

describe("STATUS_META", () => {
  it("labels the five statuses [spec-status#R1.S1]", () => {
    expect(statuses.map((s) => STATUS_META[s].label)).toEqual(["Needs you", "Writing", "Draft", "Approved", "Live"]);
  });

  it("gives every status its own icon [spec-status#R6.S1]", () => {
    expect(new Set(statuses.map((s) => STATUS_META[s].icon)).size).toBe(5);
  });

  it("animates only writing and needs you [spec-status#R7.S1]", () => {
    expect(statuses.filter((s) => STATUS_META[s].animated)).toEqual(["needs_you", "writing"]);
  });

  it("keeps draft, approved and live still [spec-status#R7.S3]", () => {
    for (const s of ["draft", "approved", "live"] as const) expect(STATUS_META[s].animated).toBe(false);
  });
});

const summary = (over: Partial<SpecSummary>): SpecSummary => ({
  id: "plan-view", title: "Plan view", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 3, scenarios: 9, openQuestions: 0,
  live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null },
  plan: null, verify: null, ...over,
});
const approvedPlan = { work: "003-plan-view", status: "approved" as const, approvedAt: "2026-11-16", others: 0, tasks: 6, done: 0, implemented: false };

describe("the spec row", () => {
  it("stage line is quiet [companion-layout#R4.S5]", () => {
    const html = renderToStaticMarkup(createElement(SpecLink, { s: summary({ plan: approvedPlan }), active: false }));
    expect(html).toContain('class="stage-line"');
    expect(html).toContain("Build · Up next");   // where the spec is now (spec-row R1)
    expect(html).not.toMatch(/class="label /);
  });

  it("list icon matches the header while the stage is Plan [spec-status#R9.S2]", () => {
    const html = renderToStaticMarkup(createElement(SpecLink, { s: summary({ plan: approvedPlan }), active: false }));
    expect(html).toContain("class=\"mini-line\"");   // the row shows the spec's line (spec-ring R5)
  });
});
