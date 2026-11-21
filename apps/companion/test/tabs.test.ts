import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSpec } from "../server/parse-spec.ts";
import { specTabs, tabForRef, specTabHref, resolveSpecTab } from "../src/tabs.ts";

const spec = parseSpec(readFileSync(fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url)), "utf8"), "link-report");
const view = (tabs: ReturnType<typeof specTabs>) => tabs.map((t) => (t.count === null ? t.label : `${t.label} ${t.count}`));

describe("spec tabs", () => {
  it("lists every section in order with counts [spec-tabs#R1.S1]", () => {
    expect(view(specTabs(spec, 5, "Someone"))).toEqual(["Scope", "Requirements 6", "Decisions 4", "Open questions 1", "Observations 3", "Code", "Activity 5"]);
  });

  it("leaves out empty Observations, Code and Activity [spec-tabs#R1.S2]", () => {
    const bare = { ...spec, observations: [], code: [] };
    expect(specTabs(bare, 0, "").map((t) => t.id)).toEqual(["scope", "requirements", "decisions", "questions"]);
  });

  it("opens on Requirements [spec-tabs#R2.S1]", () => {
    expect(resolveSpecTab(null, null)).toBe("requirements");
    expect(resolveSpecTab("nonsense", null)).toBe("requirements");
    expect(resolveSpecTab("decisions", null)).toBe("decisions");
  });

  it("a scenario link opens Requirements [spec-tabs#R4.S1]", () => {
    expect(tabForRef("R2.S1")).toBe("requirements");
    expect(resolveSpecTab(null, "R2.S1")).toBe("requirements");
  });

  it("a decision link opens Decisions [spec-tabs#R4.S2]", () => {
    expect(resolveSpecTab(null, "D1")).toBe("decisions");
    expect(tabForRef("Q2")).toBe("questions");
    expect(tabForRef("O3")).toBe("observations");
  });

  it("marks Open questions when one is yours [spec-tabs#R5.S1]", () => {
    expect(specTabs(spec, 0, "Priya Shah").find((t) => t.id === "questions")!.attention).toBe(true);   // Q2 owner: Priya
    expect(specTabs(spec, 0, "John Doe").find((t) => t.id === "questions")!.attention).toBe(false);
  });

  it("puts the tab in the address", () => {
    expect(specTabHref("plan-view", "decisions")).toBe("/work/plan-view/spec/decisions");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpecView } from "../src/components/SpecView.tsx";
import type { SpecDetail } from "../shared/types.ts";

describe("spec page tabs", () => {
  const detail = {
    summary: { id: "link-report", title: "report", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 6, scenarios: 13, openQuestions: 1,
      live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null }, plan: null, verify: null },
    spec, activity: [], plans: [], sessions: [], calls: [], verify: null,
  } as SpecDetail;
  const html = (tab: string | null) => renderToStaticMarkup(createElement(SpecView, { detail, user: "", focus: null, tab }));

  it("tab links carry the tab in the address [spec-tabs#R3.S1]", () => {
    expect(html(null)).toContain('href="/work/link-report/spec/decisions"');
    expect(html("decisions")).toMatch(/aria-current="page"[^>]*>Decisions|href="\/specs\/link-report\/decisions" aria-current="page"/);
    expect(html("decisions")).toContain('id="ref-D1"');
  });

  it("uses the same tab bar as the plan page [spec-tabs#R6.S1]", () => {
    expect(html(null)).toContain('<nav class="tabs" aria-label="Spec sections"><a class="tab"');
  });
});
