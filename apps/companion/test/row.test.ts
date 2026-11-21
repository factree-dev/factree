import { progressOf } from "../src/progress.ts";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpecLink } from "../src/components/Sidebar.tsx";
import type { SpecSummary } from "../shared/types.ts";

const summary = (over: Partial<SpecSummary>): SpecSummary => ({
  id: "link-report", title: "report export", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 2, scenarios: 4, openQuestions: 0,
  live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null },
  plan: null, verify: null, ...over,
});
const plan = (over: object) => ({ work: "002-link-report", status: "approved", approvedAt: "2026-11-18", others: 0, tasks: 3, done: 0, implemented: false, ...over }) as SpecSummary["plan"];
const built = plan({ done: 3, implemented: true });
const row = (s: SpecSummary) => renderToStaticMarkup(createElement(SpecLink, { s, active: false }));
const line = (s: SpecSummary) => row(s).replace(/<[^>]+>/g, "").replace(s.id, "");

describe("the spec row says where the spec is", () => {
  it("built, not verified [spec-row#R1.S1]", () => {
    expect(line(summary({ plan: built }))).toBe("Verify · Up next");
  });
  it("verified with a gap [spec-row#R1.S2]", () => {
    expect(line(summary({ plan: built, verify: { proved: 8, failing: 0, unverified: 1, manual: 0, at: "2026-11-18T10:00:00Z" } }))).toBe("Verify · 8 proved · 1 unverified");
  });
  it("in review [spec-row#R1.S3]", () => {
    const s = summary({ plan: plan({ done: 3, implemented: true, review: { pr: "42", url: "u", state: "OPEN" } as never }), verify: { proved: 8, failing: 0, unverified: 0, manual: 0, at: "2026-11-18T10:00:00Z" } });
    expect(line(s)).toBe("Review · Waiting for reviewers");
  });
  it("merged [spec-row#R1.S4]", () => {
    const s = summary({ plan: plan({ done: 3, implemented: true, review: { pr: "42", url: "u", state: "MERGED" } as never }), verify: { proved: 8, failing: 0, unverified: 2, manual: 2, at: "2026-11-18T10:00:00Z" } });
    expect(line(s)).toBe("Merged");
  });
  it("busy [spec-row#R1.S5]", () => {
    const s = summary({ plan: plan({ done: 1 }), activity: { stage: "build", label: "Building", step: "T2 of 3", since: "2026-11-18T10:00:00Z", paused: false, asking: false } });
    expect(line(s)).toMatch(/^Building.*T2 of 3$/);
    expect(line(s)).not.toContain("Build ·");
  });
  it("a plan not built yet [spec-row#R1.S6]", () => {
    expect(line(summary({ plan: plan({ done: 1 }) }))).toBe("Build · 1/3 tasks done");
  });
  it("a draft spec", () => {
    expect(line(summary({ status: "draft" }))).toBe("Spec · Draft");
  });
  it("title on hover [spec-row#R2.S1]", () => {
    const h = row(summary({ id: "spec-order", title: "Spec list order", plan: built }));
    expect(h).toContain('title="Spec list order"');
    expect(h.replace(/<[^>]+>/g, "")).not.toContain("Spec list order");
  });
});

describe("one place for where a spec is", () => {
  it("same as the line [spec-row#R1.S7]", () => {
    const s = summary({ plan: plan({ done: 1 }), activity: { stage: "build", label: "Building", step: "T2 of 3", since: "2026-11-18T10:00:00Z", paused: false, asking: false }, loop: { stale: [false, true, false, false, false], round: 2 } });
    expect(line(s)).toBe("Plan · Stale · spec changed");
    expect(progressOf(s, null).centre).toBe("Plan · Stale · spec changed");
  });
});
