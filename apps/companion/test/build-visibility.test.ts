import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceState, specDetail } from "../server/workspace.ts";
import { activityText } from "../src/status.ts";
import { buildStage } from "../src/stages.ts";

const example = readFileSync(fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url)), "utf8");
let root: string;
const W = "017-link-report";
const at = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const ev = (min: number, type: string, data: object) => ({ ts: at(min), type, work: W, data });
const log = (lines: object[]) => writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
const tasks = ["T1", "T2", "T3", "T4"];
const doneAll = tasks.map((t, i) => ev(30 - i, "task.done", { task: t, commit: "a", lines: 1 }));
const probing = ev(2, "agent.started", { role: "review", task: "branch", model: "opus" });
const finding = (severity: string) => ({ severity, text: "x", file: "a.ts", evidence: "e", beyond_sources: false });
const sub = () => buildStage(workspaceState(root, "A").specs.find((s) => s.id === "link-report")!).sub;
const state = () => workspaceState(root, "A").specs.find((s) => s.id === "link-report")!;
const plan = () => specDetail(root, "link-report")!.plans[0]!;
const implement = () => { const p = join(root, "work", W, "plan.md"); writeFileSync(p, readFileSync(p, "utf8").replace("approved_at: 2026-11-18\n", "approved_at: 2026-11-18\nimplemented_at: 2026-11-18\n")); };

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs", "link-report.md"), example);
  const dir = join(root, "work", W, "backend"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, "work", W, "plan.md"), `---\nwork: ${W}\nspec: link-report\nscope: [R1]\nverticals: [backend]\nstatus: approved\napproved_by: A\napproved_at: 2026-11-18\n---\n# Plan\n`);
  writeFileSync(join(dir, "tasks.md"), `---\nwork: ${W}\nvertical: backend\n---\n` + tasks.map((t) => `### ${t}: x\n**Proves:** link-report#R1.S1\n**Depends on:** none\n`).join("\n"));
});

describe("build stage", () => {
  it("branch review running keeps Build in progress [build-visibility#R1.S1]", () => {
    log([...doneAll, probing]);
    expect(sub()).toBe("4/4 merged · branch review: probing");
    expect(buildStage(state()).done).toBe(false);
  });
  it("a fix round shows fixing [build-visibility#R1.S2]", () => {
    log([...doneAll, probing, ev(2, "task.reviewed", { task: "branch", findings: [finding("should-fix")], not_probed: [] }), ev(1, "task.fixing", { task: "branch", round: 1, cause: "should-fix" })]);
    expect(sub()).toBe("branch review: 1 should-fix, fixing");
    expect(plan().branchReview).toMatchObject({ phase: "fixing", rounds: [{ round: 1, cause: "should-fix" }] });
  });
  it("ended clean is done [build-visibility#R1.S3]", () => {
    implement();
    log([...doneAll, probing, ev(1, "branch.reviewed", { verdict: "ready", must: 0, should: 0 })]);
    expect(buildStage(state())).toMatchObject({ sub: "Implemented", done: true });
  });
  it("must-fix open isn't done [build-visibility#R1.S4]", () => {
    implement();
    log([...doneAll, probing, ev(1, "branch.reviewed", { verdict: "fix first", must: 2, should: 0 })]);
    expect(buildStage(state())).toMatchObject({ sub: "branch review: 2 must-fix open", done: false });
  });
  it("no branch events at all stays done [build-visibility#R1.S5]", () => {
    implement();
    log(doneAll);
    expect(buildStage(state())).toMatchObject({ sub: "Implemented", done: true });
  });
  it("the latest branch review counts [build-visibility#R1.S6]", () => {
    implement();
    log([...doneAll, probing, ev(1, "branch.reviewed", { verdict: "fix first", must: 1, should: 0 }), ev(1, "agent.started", { role: "review", task: "branch", model: "opus" })]);
    expect(buildStage(state()).done).toBe(false);
    expect(plan().branchReview).toMatchObject({ phase: "probing", findings: [] });
    log([...doneAll, probing, ev(1, "branch.reviewed", { verdict: "fix first", must: 1, should: 0 }), ev(1, "branch.reviewed", { verdict: "ready", must: 0, should: 0 })]);
    expect(buildStage(state()).done).toBe(true);
  });
  it("folds task rows from the new events", () => {
    log([ev(9, "agent.started", { role: "build", task: "T1", model: "sonnet" }), ev(8, "task.waiting", { task: "T2", reason: "shares a.js with T1" }),
      ev(7, "agent.started", { role: "review", task: "T1", model: "opus" }),
      ev(6, "task.reviewed", { task: "T1", spec: "pass", quality: "pass", findings: [{ text: "a", beyond_sources: false }, { text: "b", beyond_sources: true }] })]);
    const b = plan().build;
    expect(b.T2).toMatchObject({ phase: "waiting", reason: "shares a.js with T1" });
    expect(b.T1).toMatchObject({ phase: "reviewing", model: "sonnet", reviewerRecorded: true, verdict: "pass/pass", findings: 1, suggestions: 1 });
    log([ev(5, "task.fixing", { task: "T1", round: 1, cause: "spec" }), ev(4, "task.done", { task: "T1", commit: "c", lines: 3 })]);
    expect(plan().build.T1).toMatchObject({ phase: "merged", round: 1, cause: "spec" });
  });
});

describe("branch review fix rounds", () => {
  it("a re-review keeps the rounds and first-pass findings [build-visibility#R3.S3]", () => {
    log([...doneAll, probing, ev(2, "task.reviewed", { task: "branch", findings: [finding("should-fix")], not_probed: [] }), ev(2, "task.fixing", { task: "branch", round: 1, cause: "should-fix" }),
      ev(1, "agent.started", { role: "review", task: "branch", model: "opus" }), ev(1, "task.reviewed", { task: "branch", round: 1, cause: "should-fix" }), ev(1, "branch.reviewed", { verdict: "ready", must: 0, should: 0 })]);
    expect(plan().branchReview).toMatchObject({ phase: "ended", verdict: "ready", rounds: [{ round: 1, cause: "should-fix" }], findings: [{ severity: "should-fix" }] });
  });
});

describe("activity names the task", () => {
  it("two builders read Building T2, T4 [build-visibility#R4.S1]", () => {
    log([ev(5, "stage.step", { stage: "build" }), ev(4, "agent.started", { role: "build", task: "T2", model: "m" }), ev(3, "agent.started", { role: "build", task: "T4", model: "m" })]);
    expect(activityText(state().activity!)).toBe("Building… T2, T4");
  });
  it("a task reviewer reads Reviewing T3", () => {
    log([ev(5, "stage.step", { stage: "build" }), ev(3, "agent.started", { role: "review", task: "T3", model: "m" })]);
    expect(activityText(state().activity!)).toBe("Reviewing… T3");
  });
  it("a reviewer replaces its builder [build-visibility#R4.S1]", () => {
    log([ev(5, "stage.step", { stage: "build" }), ev(4, "agent.started", { role: "build", task: "T3", model: "m" }), ev(3, "agent.started", { role: "review", task: "T3", model: "m" })]);
    expect(activityText(state().activity!)).toBe("Reviewing… T3");
    log([ev(5, "stage.step", { stage: "build" }), ev(4, "agent.started", { role: "build", task: "T3", model: "m" }), ev(3, "agent.started", { role: "build", task: "T4", model: "m" }), ev(2, "agent.started", { role: "review", task: "T3", model: "m" })]);
    expect(activityText(state().activity!)).toBe("Building… T4 · Reviewing T3");
  });
  it("Probing the branch [build-visibility#R4.S2]", () => {
    log([...doneAll, probing]);
    expect(activityText(state().activity!)).toBe("Probing the branch…");
    log([...doneAll, probing, ev(1, "plan.implemented", {})]);
    expect(state().activity).not.toBeNull();
    log([...doneAll, probing, ev(1, "branch.reviewed", { verdict: "ready", must: 0, should: 0 })]);
    expect(state().activity).toBeNull();
  });
});
