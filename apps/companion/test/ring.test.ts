import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceState } from "../server/workspace.ts";
import { progressOf } from "../src/progress.ts";
import type { Spec, SpecSummary } from "../shared/types.ts";

const example = readFileSync(fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url)), "utf8");
let root: string;
const at = (min: number) => new Date(Date.parse("2026-11-20T12:00:00Z") - min * 60000).toISOString();
const w = (type: string, data: object, min: number, work = "002-link-report") => ({ ts: at(min), type, work, data });
const s = (type: string, data: object, min: number) => ({ ts: at(min), type, spec: "link-report", data });
const log = (lines: object[]) => writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
const plan = (work: string, tasks: number, implemented: boolean) => {
  mkdirSync(join(root, "work", work, "frontend"), { recursive: true });
  writeFileSync(join(root, "work", work, "plan.md"), `---\nwork: ${work}\nspec: link-report\nscope: [R1]\nverticals: [frontend]\nstatus: approved\napproved_by: A\napproved_at: 2026-11-20\n${implemented ? "implemented_at: 2026-11-20\n" : ""}---\n# Plan\n`);
  writeFileSync(join(root, "work", work, "frontend", "tasks.md"), `---\nwork: ${work}\nvertical: frontend\n---\n` + Array.from({ length: tasks }, (_, i) => `### T${i + 1}: Task\n**Proves:** link-report#R1.S1\n**Depends on:** none\n`).join("\n"));
};
const summary = () => workspaceState(root, "A", Date.parse("2026-11-20T12:00:00Z")).specs.find((x) => x.id === "link-report")!;
const spec = { status: "approved", approvedAt: "2026-11-20" } as Spec;
// A spec built and verified once: plan approved, 3 tasks done, implemented, verified clean.
const builtOnce = [
  w("plan.approved", { by: "flow" }, 90), w("task.done", { task: "T1" }, 85), w("task.done", { task: "T2" }, 80), w("task.done", { task: "T3" }, 75),
  w("plan.implemented", {}, 70), s("spec.verified", { proved: 9, failing: 0, unverified: 0 }, 65),
];
beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs", "link-report.md"), example);
  plan("002-link-report", 3, true);
});

describe("going back round", () => {
  it("the spec changes after the build [spec-ring#R4.S1]", () => {
    log([...builtOnce, w("review.opened", { pr: "9", url: "u", base: "main" }, 60), s("spec.updated", { added: ["R5"] }, 30)]);
    const sm = summary();
    expect(sm.loop).toEqual({ stale: [false, true, true, true, true], round: 2 });
    const r = progressOf(sm, spec);
    expect(r.stages.map((x) => x.state).slice(1)).toEqual(["stale", "stale", "stale", "stale"]);
    expect(r.pct).toBe(20);   // only Spec counts
    expect(r.round).toBe(2);
  });

  it("redone [spec-ring#R4.S2]", () => {
    plan("003-link-report", 2, false);
    log([...builtOnce, s("spec.updated", { added: ["R5"] }, 30), w("plan.approved", { by: "flow" }, 20, "003-link-report")]);
    expect(summary().loop!.stale).toEqual([false, false, false, false, false]);   // re-planned: later stages show the new plan, not stale
    const r = progressOf(summary(), spec);
    expect(r.stages[1]!.state).toBe("done");
    expect(r.stages.slice(2).map((x) => x.fill)).toEqual([0, 0, 0]);
  });

  it("a reviewer asks for changes [spec-ring#R4.S3]", () => {
    plan("002-link-report", 4, false);
    log([w("plan.approved", { by: "flow" }, 90), w("task.done", { task: "T1" }, 85), w("task.done", { task: "T2" }, 80), w("task.done", { task: "T3" }, 75),
      w("review.opened", { pr: "12", url: "u", base: "main" }, 40), w("review.state", { pr: "12", state: "CHANGES_REQUESTED" }, 30)]);
    const sm = summary();
    expect(sm.loop!.round).toBe(2);
    const r = progressOf(sm, spec);
    expect(r.stages[2]!.fill).toBe(0.75);
    expect(r.stages[2]!.sub).toBe("3/4 tasks done");
  });

  it("edits in one change are one round", () => {
    log([...builtOnce, w("review.opened", { pr: "9", url: "u", base: "main" }, 60), s("spec.updated", { changed: ["R1"] }, 30), s("spec.updated", { changed: ["R2"] }, 25), s("spec.updated", { added: ["R6"] }, 20)]);
    expect(summary().loop!.round).toBe(2);
  });

  it("nothing built, nothing stale", () => {
    log([s("spec.updated", { added: ["R5"] }, 30)]);
    expect(summary().loop).toEqual({ stale: [false, false, false, false, false], round: 1 });
  });
});

describe("the ring's numbers", () => {
  it("47 percent while building T2 of 3", () => {
    const sm: SpecSummary = {
      id: "link-report", title: "report", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 2, scenarios: 4, openQuestions: 0,
      live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null },
      plan: { work: "002-link-report", status: "approved", approvedAt: "2026-11-20", others: 0, tasks: 3, done: 1, implemented: false, review: null },
      verify: null, activity: { stage: "build", label: "Building", step: "T2 of 3", since: at(1), paused: false, asking: false }, loop: { stale: [false, false, false, false, false], round: 1 },
    };
    const r = progressOf(sm, spec);
    expect(r.pct).toBe(47);
    expect(r.stages.map((x) => x.state)).toEqual(["done", "done", "running", "idle", "idle"]);
    expect(r.centre).toBe("Building… T2 of 3");
  });
});

describe("no gaps", () => {
  it("no gaps [spec-ring#R4.S5]", () => {
    log([...builtOnce, w("review.opened", { pr: "9", url: "u", base: "main" }, 60), w("review.state", { pr: "9", state: "MERGED" }, 55),
      s("spec.updated", { changed: ["R5"] }, 30), s("spec.verified", { proved: 9, failing: 0, unverified: 0 }, 20)]);
    expect(summary().loop!.stale).toEqual([false, true, true, true, true]);
    const r = progressOf(summary(), spec);
    expect(r.current).toBe("plan");
    expect(r.centre).toBe("Plan · Stale · spec changed");
  });

  it("a later stage fills only after the ones ahead of it", () => {
    plan("002-link-report", 3, false);
    log([w("plan.approved", { by: "flow" }, 90), w("task.done", { task: "T1" }, 85), w("task.done", { task: "T2" }, 80), s("spec.verified", { proved: 4, failing: 0, unverified: 0 }, 70)]);
    const r = progressOf(summary(), spec);
    expect(r.stages.map((x) => x.fill)).toEqual([1, 1, 0.67, 0, 0]);
  });

  it("an open pull request is fresh again once Verify is", () => {
    log([...builtOnce, w("review.opened", { pr: "9", url: "u", base: "main" }, 60), s("spec.updated", { changed: ["R5"] }, 30),
      w("plan.approved", { by: "flow" }, 25), w("plan.implemented", {}, 22), s("spec.verified", { proved: 9, failing: 0, unverified: 0 }, 20)]);
    expect(summary().loop!.stale).toEqual([false, false, false, false, false]);
  });
});

describe("what counts as going back", () => {
  it("changes during the build [spec-ring#R4.S6]", () => {
    plan("002-link-report", 3, false);
    log([w("plan.approved", { by: "flow" }, 90), w("task.done", { task: "T1" }, 85), s("spec.updated", { added: ["R5"] }, 80), w("task.done", { task: "T2" }, 75), s("spec.updated", { changed: ["R5"] }, 70)]);
    expect(summary().loop!.round).toBe(1);
  });

  it("a note, not a change [spec-ring#R4.S7]", () => {
    log([...builtOnce, w("review.opened", { pr: "9", url: "u", base: "main" }, 60), w("review.state", { pr: "9", state: "MERGED" }, 55), s("spec.updated", { added: [], changed: [], retired: [] }, 30)]);
    expect(summary().loop).toEqual({ stale: [false, false, false, false, false], round: 1 });
  });
});

describe("later work takes a spec change in", () => {
  it("later work took the change in [spec-ring#R4.S8]", () => {
    plan("002-link-report", 3, true);
    log([w("plan.approved", { by: "flow" }, 90), w("task.done", { task: "T1" }, 85), s("spec.updated", { changed: ["R1"] }, 80),
      w("task.done", { task: "T2" }, 75), w("plan.implemented", {}, 70), s("spec.verified", { proved: 9, failing: 0, unverified: 0 }, 65)]);
    expect(summary().loop!.stale).toEqual([false, false, false, false, false]);
  });
});
