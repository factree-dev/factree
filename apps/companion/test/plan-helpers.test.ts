import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePlan } from "../server/parse-plan.ts";
import { parseSpec } from "../server/parse-spec.ts";
import { backing, coverage, notBacked, outsideScope, planResolver, refsOf, tasksByRequirement, unproved } from "../src/plan.ts";

const ex = (p: string) => readFileSync(fileURLToPath(new URL(`../../../tests/fixtures/workspace/${p}`, import.meta.url)), "utf8");
const spec = parseSpec(ex("specs/link-report.md"), "link-report");
const refs = refsOf(spec);
const plan002 = parsePlan("002-link-report", {
  plan: ex("work/002-link-report/plan.md"),
  verticals: {
    backend: { design: ex("work/002-link-report/backend/design.md"), tasks: ex("work/002-link-report/backend/tasks.md") },
    frontend: { design: ex("work/002-link-report/frontend/design.md"), tasks: ex("work/002-link-report/frontend/tasks.md") },
  },
});

describe("backing", () => {
  it("task citing nothing is not backed [plan-view#R6.S1]", () => {
    expect(backing([], null, refs, "link-report")).toEqual({ backed: false, unknown: [] });
    expect(backing([], "", refs, "link-report").backed).toBe(false);   // "none" with no reason
  });

  it("foundation with a reason is backed [plan-view#R6.S2]", () => {
    expect(backing([], "shared migration that T2 and T3 rely on", refs, "link-report").backed).toBe(true);
  });

  it("component citing a retired requirement is not backed [plan-view#R6.S3]", () => {
    expect(backing(["R9"], null, refs, "link-report")).toEqual({ backed: false, unknown: ["R9"] });
    expect(backing(["R5", "link-report#R6.S1"], null, refs, "link-report")).toEqual({ backed: true, unknown: [] });
    expect(backing(["other#R1.S1"], null, refs, "link-report").backed).toBe(false);
  });
});

describe("planResolver", () => {
  it("sends plan files to their tab and specs to their page", () => {
    const r = planResolver(plan002, "frontend");
    expect(r("../backend/design.md#api-contract")).toBe("/work/link-report/plan/002-link-report/backend/design");
    expect(r("backend/tasks.md")).toBe("/work/link-report/plan/002-link-report/backend/design");
    expect(r("../../specs/link-report.md")).toBe("/work/link-report/spec");
    expect(r("../infra/design.md")).toBeUndefined();
  });
});

describe("overview", () => {
  it("counts tasks per vertical and covers every scenario [plan-view#R2.S1]", () => {
    expect(plan002.verticals.map((v) => [v.name, v.tasks?.length])).toEqual([["backend", 1], ["frontend", 1]]);
    expect(coverage(plan002, spec)).toEqual([
      { ref: "R5.S1", name: "Admin downloads", tasks: [{ id: "T2", vertical: "frontend" }] },
      { ref: "R5.S2", name: "Export already running", tasks: [{ id: "T2", vertical: "frontend" }] },
      { ref: "R6.S1", name: "Second export while the first runs", tasks: [{ id: "T1", vertical: "backend" }] },
      { ref: "R6.S2", name: "Export after the first finishes", tasks: [{ id: "T1", vertical: "backend" }] },
    ]);
    expect(notBacked(plan002, spec)).toEqual([]);
  });

  it("lists in-scope scenarios no task proves [plan-view#R7.S1]", () => {
    const partial = { ...plan002, verticals: plan002.verticals.filter((v) => v.name === "backend") };
    expect(unproved(partial, spec)).toEqual([{ ref: "R5.S1", name: "Admin downloads" }, { ref: "R5.S2", name: "Export already running" }]);
  });

  it("lists requirements outside the plan [plan-view#R7.S2]", () => {
    expect(outsideScope(plan002, spec).map((r) => r.id)).toEqual(["R1", "R2", "R3", "R4"]);
  });

  it("names tasks and components the spec doesn't back", () => {
    const t = plan002.verticals[0]!.tasks![0]!;
    const broken = { ...plan002, verticals: [{ ...plan002.verticals[0]!, tasks: [{ ...t, proves: [] }], components: [{ path: "src/x.ts", serves: ["R9"] }] }] };
    expect(notBacked(broken, spec)).toEqual([
      { kind: "task", id: "T1", vertical: "backend", unknown: [] },
      { kind: "component", id: "src/x.ts", vertical: "backend", unknown: ["R9"] },
    ]);
  });
});

describe("tasks on the spec page", () => {
  it("requirement proved in two verticals lists both tasks [plan-view#R8.S1]", () => {
    const t1 = plan002.verticals[0]!.tasks![0]!, t2 = plan002.verticals[1]!.tasks![0]!;
    const both = { ...plan002, verticals: [
      { ...plan002.verticals[0]!, tasks: [{ ...t1, proves: ["link-report#R6.S1"] }] },
      { ...plan002.verticals[1]!, tasks: [{ ...t2, proves: ["link-report#R6.S2"] }] },
    ] };
    expect(tasksByRequirement([both]).get("R6")).toEqual([
      { work: "002-link-report", task: "T1", vertical: "backend" },
      { work: "002-link-report", task: "T2", vertical: "frontend" },
    ]);
  });

  it("requirement with no plan lists nothing [plan-view#R8.S2]", () => {
    expect(tasksByRequirement([]).get("R1")).toBeUndefined();
    expect(tasksByRequirement([plan002]).get("R1")).toBeUndefined();
  });

  it("tasks from two plans are labelled by plan [plan-view#R8.S3]", () => {
    const older = { ...plan002, work: "001-link-report" };
    expect(tasksByRequirement([plan002, older]).get("R5")!.map((t) => `${t.work}:${t.task}`)).toEqual(["002-link-report:T2", "001-link-report:T2"]);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { planHref } from "../src/links.ts";
import { planView } from "../src/plan.ts";
import { PlanView } from "../src/components/PlanView.tsx";
import type { SpecDetail } from "../shared/types.ts";

describe("Design and Tasks sub-tabs", () => {
  const detail = {
    summary: { id: "link-report", title: "report", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 6, scenarios: 13, openQuestions: 1,
      live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, answered: [], session: null }, plan: null },
    spec, activity: [], plans: [{ ...plan002, sessions: [] }], sessions: [],
  } as unknown as SpecDetail;
  const page = (tab: string, view: string | null, ref: string | null = null) =>
    renderToStaticMarkup(createElement(PlanView, { detail, work: "002-link-report", tab, view, focus: ref ? { ref, n: 0 } : null }));

  it("a vertical opens on Design, full width, with no task list [plan-view#R12.S1]", () => {
    expect(planView(null, null)).toBe("design");
    const h = page("backend", null);
    expect(h).toContain('aria-label="Backend design"');
    expect(h).not.toContain('id="ref-T1"');
    expect(h).toContain('href="/work/link-report/plan/002-link-report/backend/tasks"');
  });

  it("a task link opens Tasks [plan-view#R12.S2]", () => {
    expect(planHref("link-report", "002-link-report", "backend", "T1")).toBe("/work/link-report/plan/002-link-report/backend/tasks/T1");
    expect(planView(null, "T1")).toBe("tasks");
    expect(page("backend", null, "T1")).toContain('id="ref-T1"');
  });

  it("a pattern link opens Design [plan-view#R12.S3]", () => {
    expect(planHref("link-report", "002-link-report", "backend", "P2")).toBe("/work/link-report/plan/002-link-report/backend/design/P2");
    expect(planView(null, "P2")).toBe("design");
  });

  it("the sub-tab is in the address [plan-view#R12.S4]", () => {
    expect(planView("tasks", null)).toBe("tasks");
    expect(planView("bogus", null)).toBe("design");
    expect(page("frontend", "tasks")).toContain('id="ref-T2"');
  });

  it("design sections keep their diagrams [plan-view#R4.S2]", () => {
    expect(page("backend", "design")).toContain("diagram-pending");
  });

  it("tasks keep every field and ticked steps [plan-view#R4.S1]", () => {
    expect(page("frontend", "tasks")).toMatch(/T2.*Download report button.*0\/6 steps/s);
  });
});

describe("approvals by preference", () => {
  it("shows the preference as the approver [preferences#R4.S2]", () => {
    const byPref = { ...plan002, approvedBy: "preference: approve_plans", sessions: [] };
    const d = {
      summary: { id: "link-report", title: "report", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 6, scenarios: 13, openQuestions: 1,
        live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, answered: [], session: null }, plan: null },
      spec, activity: [], plans: [byPref], sessions: [],
    } as unknown as SpecDetail;
    const h = renderToStaticMarkup(createElement(PlanView, { detail: d, work: "002-link-report", tab: null, focus: null }));
    expect(h).toContain("Approved by preference: approve_plans");
  });
});
