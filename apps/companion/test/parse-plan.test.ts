import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePlan, parseBlocks } from "../server/parse-plan.ts";

const ex = (p: string) => readFileSync(fileURLToPath(new URL(`../../../tests/fixtures/workspace/work/${p}`, import.meta.url)), "utf8");

const vertical = () => parsePlan("002-link-report", {
  plan: ex("002-link-report/plan.md"),
  verticals: {
    backend: { design: ex("002-link-report/backend/design.md"), tasks: ex("002-link-report/backend/tasks.md") },
    frontend: { design: ex("002-link-report/frontend/design.md"), tasks: ex("002-link-report/frontend/tasks.md") },
  },
});

describe("parsePlan", () => {
  it("reads a two-vertical plan", () => {
    const p = vertical();
    expect(p).toMatchObject({ work: "002-link-report", spec: "link-report", layout: "vertical", status: "approved", approvedBy: "John Doe", scope: ["R5", "R6"] });
    expect(p.verticals.map((v) => v.name)).toEqual(["backend", "frontend"]);
    expect(p.verticals[0]!.tasks!.map((t) => t.id)).toEqual(["T1"]);
    expect(p.overview.map((s) => s.name)).toEqual(["Context", "Verticals", "Order", "Coverage", "Global constraints", "Review focus", "Spec updates"]);
    expect(p.verticals[0]!.patterns).toEqual(["P1", "P2"]);
    expect(p.verticals[0]!.components).toEqual([{ path: "src/exports/limit.ts", serves: ["R6"] }, { path: "src/exports/routes.ts", serves: ["R6"] }]);
    expect(p.problems).toEqual([]);
  });

  it("shows an old plan as one General vertical [plan-view#R3.S2]", () => {
    const p = parsePlan("001-link-report", { verticals: { general: { design: ex("001-link-report/design.md"), tasks: ex("001-link-report/tasks.md") } } });
    expect(p.layout).toBe("old");
    expect(p.verticals.map((v) => v.name)).toEqual(["general"]);
    expect(p.verticals[0]!.tasks).toHaveLength(4);
    expect(p).toMatchObject({ spec: "link-report", status: "approved", scope: ["R1", "R2", "R3", "R4"] });
    expect(p.overview.map((s) => s.name)).toEqual(["Context", "Spec updates"]);   // lifted out of the old design
  });

  it("keeps a vertical with no task list [plan-view#R3.S3]", () => {
    const p = parsePlan("002-link-report", { plan: ex("002-link-report/plan.md"), verticals: { backend: { design: ex("002-link-report/backend/design.md") }, frontend: {} } });
    expect(p.verticals[0]!.tasks).toBeNull();
    expect(p.verticals[0]!.design).not.toBeNull();
    expect(p.verticals[1]!.design).toBeNull();
  });

  it("reads every task field and ticked steps [plan-view#R4.S1]", () => {
    const tasks = "---\nwork: w\nvertical: backend\n---\n# Tasks\n\n### T2: Export rows\n\n**Proves:** s#R1.S1, s#R1.S2\n**Depends on:** T1 (the endpoint)\n**Est. diff:** ~190 lines\n\n**Files**\n- Modify: `src/a.ts`\n\n**Interfaces**\n- Produces: `f()`\n\n**Steps**\n- [x] 1. Write tests\n  ```ts\n  it(\"x\")\n  ```\n- [x] 2. Run them\n- [ ] 3. Implement\n- [ ] 4. Run\n- [ ] 5. Run all\n- [ ] 6. Commit\n";
    const t = parsePlan("w", { plan: "---\nspec: s\nverticals: [backend]\n---\n", verticals: { backend: { tasks } } }).verticals[0]!.tasks![0]!;
    expect(t).toMatchObject({ id: "T2", title: "Export rows", vertical: "backend", proves: ["s#R1.S1", "s#R1.S2"], foundation: null, dependsOn: ["T1"], estDiff: "~190 lines", stepsDone: 2, stepsTotal: 6 });
    expect(t.body.map((s) => s.name)).toEqual(["Files", "Interfaces", "Steps"]);
    const steps = t.body[2]!.blocks[0]!;
    expect(steps.t === "list" && steps.items.map((i) => i.done)).toEqual([true, true, false, false, false, false]);
    expect(steps.t === "list" && steps.items[0]!.text).toContain('it("x")');
  });

  it("reads a foundation task's reason", () => {
    const tasks = "### T1: Base\n**Proves:** none (shared migration that T2 and T3 rely on)\n**Depends on:** none\n";
    const t = parsePlan("w", { plan: "---\nspec: s\n---\n", verticals: { general: { tasks } } }).verticals[0]!.tasks![0]!;
    expect(t.foundation).toBe("shared migration that T2 and T3 rely on");
    expect(t.proves).toEqual([]);
    expect(t.dependsOn).toEqual([]);
  });

  it("keeps diagrams as code blocks [plan-view#R4.S2]", () => {
    const blocks = parseBlocks(["Validating:", "", "```mermaid", "sequenceDiagram", "  A->>B: hi", "```", "", "| A | B |", "|---|---|", "| 1 | 2 |"]);
    expect(blocks).toEqual([
      { t: "p", text: "Validating:" },
      { t: "code", lang: "mermaid", text: "sequenceDiagram\n  A->>B: hi" },
      { t: "table", head: ["A", "B"], rows: [["1", "2"]] },
    ]);
  });

  it("lists what it couldn't read [plan-view#R11.S2]", () => {
    const p = parsePlan("w", {
      plan: "---\nspec: s\nverticals: [backend, frontend]\nstatus: draft\n---\n",
      verticals: { backend: { tasks: "---\nwork: w\nvertical: backend\n### T1: Never closed\n" }, frontend: { tasks: "### T2: Fine\n**Proves:** s#R1.S1\n" } },
    });
    expect(p.problems.join(" ")).toMatch(/backend\/tasks\.md: Front matter is not closed/);
    expect(p.verticals[1]!.tasks!.map((t) => t.id)).toEqual(["T2"]);
  });
});
