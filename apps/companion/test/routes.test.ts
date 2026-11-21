import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePath, linkTarget } from "../src/links.ts";
import { planStage } from "../src/stages.ts";
import { PlanView } from "../src/components/PlanView.tsx";
import { parseSpec } from "../server/parse-spec.ts";
import type { SpecDetail, SpecSummary } from "../shared/types.ts";

const spec = parseSpec(readFileSync(fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url)), "utf8"), "link-report");
const summary = { id: "link-report", title: "report", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 6, scenarios: 13, openQuestions: 1,
  live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null },
  plan: { work: "002-link-report", status: "approved", approvedAt: "2026-11-16", others: 1, tasks: 2, done: 0, implemented: false }, verify: null } as SpecSummary;
const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const anchor = (href: string, extra: Record<string, string> = {}) => ({ getAttribute: (n: string) => (n === "href" ? href : extra[n] ?? null) });

describe("routing", () => {
  it("a pasted tasks path opens that sub-tab [deep-links#R1.S1]", () => {
    expect(parsePath("/work/link-report/plan/002-link-report/frontend/tasks")).toMatchObject({ page: "plan", plan: "002-link-report", tab: "frontend", view: "tasks", ref: null });
  });

  it("the address follows the Plan stage [deep-links#R1.S2]", () => {
    expect(planStage(summary, spec).href).toBe("/work/link-report/plan/002-link-report");
  });

  it("a link in a decision is followed in the app [deep-links#R2.S2]", () => {
    const to = linkTarget(plain, anchor("/work/build/plan/015-build/claude-plugin/tasks/T2"));
    expect(to).toBe("/work/build/plan/015-build/claude-plugin/tasks/T2");
    expect(parsePath(to!)).toMatchObject({ tab: "claude-plugin", view: "tasks", ref: "T2" });
  });

  it("plain clicks go through history, others are left to the browser [deep-links#R3.S1]", () => {
    expect(linkTarget(plain, anchor("/work/link-report/spec"))).toBe("/work/link-report/spec");
    expect(linkTarget({ ...plain, metaKey: true }, anchor("/work/link-report/spec"))).toBeNull();
    expect(linkTarget(plain, anchor("https://github.com/x"))).toBeNull();
    expect(linkTarget(plain, anchor("/work/x/spec", { target: "_blank" }))).toBeNull();
  });

  it("a missing plan says so and links back [deep-links#R6.S1]", () => {
    const d = { summary, spec, activity: [], plans: [], sessions: [], calls: [], verify: null } as unknown as SpecDetail;
    const h = renderToStaticMarkup(createElement(PlanView, { detail: d, work: "099-gone", tab: null, focus: null }));
    expect(h).toContain("Plan 099-gone wasn");
    expect(h).toContain('href="/work/link-report/spec"');
  });
});
