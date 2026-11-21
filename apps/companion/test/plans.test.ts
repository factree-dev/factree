import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceState, specDetail, fingerprint, readPlans } from "../server/workspace.ts";

const examples = fileURLToPath(new URL("../../../tests/fixtures/workspace", import.meta.url));
const NOW = Date.parse("2026-11-16T10:00:00Z");

let root: string;
function events(lines: object[]) {
  writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}
function specFile(id: string, status: string, updated = "2026-11-16") {
  const text = readFileSync(join(examples, "specs", "link-report.md"), "utf8")
    .replace(/^id: .*$/m, `id: ${id}`).replace(/^status: .*$/m, `status: ${status}`).replace(/^updated: .*$/m, `updated: ${updated}`);
  writeFileSync(join(root, "specs", `${id}.md`), text);
}
function write(path: string, text: string) {
  mkdirSync(join(root, "work", path, ".."), { recursive: true });
  writeFileSync(join(root, "work", path), text);
}
// A one-vertical plan with the given front matter.
function plan(work: string, spec: string, fm: string) {
  write(`${work}/plan.md`, `---\nwork: ${work}\nspec: ${spec}\nspec_updated: 2026-11-16\nscope: [R1]\nverticals: [frontend]\n${fm}\n---\n# Plan\n`);
  write(`${work}/frontend/tasks.md`, "---\nwork: w\nvertical: frontend\n---\n### T1: One\n**Proves:** x#R1.S1\n**Steps**\n- [ ] 1. Commit\n");
}
const brief = (id: string) => workspaceState(root, "John Doe", NOW).specs.find((s) => s.id === id)?.plan;

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
});

describe("plans in the workspace", () => {
  it("brief of an approved plan [plan-view#R1.S1]", () => {
    specFile("link-report", "approved");
    plan("001-link-report", "link-report", "status: approved\napproved_by: A\napproved_at: 2026-11-15");
    expect(brief("link-report")).toEqual({ work: "001-link-report", status: "approved", approvedAt: "2026-11-15", others: 0, tasks: 1, done: 0, implemented: false, review: null });
  });

  it("no plan for an approved spec [plan-view#R1.S2]", () => {
    specFile("link-report", "approved");
    expect(brief("link-report")).toBeNull();
  });

  it("no plan for a draft spec [plan-view#R1.S3]", () => {
    specFile("link-report", "draft");
    const s = workspaceState(root, "John Doe", NOW).specs[0]!;
    expect(s).toMatchObject({ status: "draft", plan: null });
  });

  it("design approved [plan-view#R1.S4]", () => {
    specFile("link-report", "approved");
    plan("001-link-report", "link-report", "status: design-approved");
    expect(brief("link-report")?.status).toBe("design-approved");
  });

  it("plan kept when the spec is back to draft [plan-view#R1.S5]", () => {
    specFile("link-report", "draft");
    plan("001-link-report", "link-report", "status: approved");
    expect(workspaceState(root, "John Doe", NOW).specs[0]).toMatchObject({ status: "draft", plan: { status: "approved" } });
  });

  it("newest plan wins, others counted [plan-view#R1.S6] [plan-view#R9.S1]", () => {
    specFile("link-report", "approved");
    plan("001-link-report", "link-report", "status: approved");
    plan("004-link-report", "link-report", "status: draft");
    expect(brief("link-report")).toMatchObject({ work: "004-link-report", status: "draft", others: 1 });
    expect(specDetail(root, "link-report", NOW)!.plans.map((p) => p.work)).toEqual(["004-link-report", "001-link-report"]);
  });

  it("old plan takes the further-along status [plan-view#R1.S7]", () => {
    specFile("link-report", "approved");
    write("001-link-report/design.md", "---\nwork: 001-link-report\nspec: link-report\nstatus: design-approved\n---\n# Design\n");
    write("001-link-report/tasks.md", "---\nwork: 001-link-report\nspec: link-report\nstatus: draft\n---\n# Tasks\n");
    expect(brief("link-report")?.status).toBe("design-approved");
  });

  it("no plan for a live spec [plan-view#R1.S8]", () => {
    specFile("link-report", "live");
    expect(workspaceState(root, "John Doe", NOW).specs[0]).toMatchObject({ status: "live", plan: null });
  });

  it("reads the worked examples, old and vertical", () => {
    cpSync(join(examples, "work"), join(root, "work"), { recursive: true });
    specFile("link-report", "approved");
    const plans = specDetail(root, "link-report", NOW)!.plans;
    expect(plans.map((p) => [p.work, p.layout, p.verticals.map((v) => v.name).join("+")])).toEqual([
      ["002-link-report", "vertical", "backend+frontend"],
      ["001-link-report", "old", "general"],
    ]);
  });

  it("stale when the spec changed after planning [plan-view#R10.S1]", () => {
    specFile("link-report", "approved", "2026-11-18");
    plan("001-link-report", "link-report", "status: approved");   // spec_updated 2026-11-16, no events
    expect(readPlans(root, [], new Map([["link-report", { updated: "2026-11-18" } as never]]))[0]!.stale).toBe(true);
    expect(specDetail(root, "link-report", NOW)!.plans[0]!.stale).toBe(true);
  });

  it("not stale when unchanged [plan-view#R10.S2]", () => {
    specFile("link-report", "approved", "2026-11-16");
    plan("001-link-report", "link-report", "status: approved");
    events([
      { ts: "2026-11-16T09:00:00Z", type: "spec.updated", spec: "link-report", data: {} },
      { ts: "2026-11-16T09:30:00Z", type: "plan.created", work: "001-link-report", data: {} },
    ]);
    expect(specDetail(root, "link-report", NOW)!.plans[0]!.stale).toBe(false);
  });

  it("stale on a same-day later edit [plan-view#R10.S3]", () => {
    specFile("link-report", "approved", "2026-11-16");
    plan("001-link-report", "link-report", "status: approved");
    events([
      { ts: "2026-11-16T10:00:00Z", type: "plan.created", work: "001-link-report", data: {} },
      { ts: "2026-11-16T14:00:00Z", type: "spec.updated", spec: "link-report", data: { changed: ["R1"] } },
    ]);
    expect(specDetail(root, "link-report", NOW)!.plans[0]!.stale).toBe(true);
  });

  it("the plan page agrees [spec-ring#R4.S9]", () => {
    specFile("link-report", "approved", "2026-11-16");
    plan("001-link-report", "link-report", "status: approved");
    const base = [
      { ts: "2026-11-16T10:00:00Z", type: "plan.created", work: "001-link-report", data: {} },
      { ts: "2026-11-16T10:05:00Z", type: "plan.approved", work: "001-link-report", data: {} },
      { ts: "2026-11-16T14:00:00Z", type: "spec.updated", spec: "link-report", data: { added: ["R1.S9"] } },
    ];
    events([...base, { ts: "2026-11-16T14:10:00Z", type: "plan.approved", work: "001-link-report", data: {} }]);
    expect(specDetail(root, "link-report", NOW)!.plans[0]!.stale).toBe(false);   // approved again after the change
    expect(specDetail(root, "link-report", NOW)!.summary.loop!.stale[1]).toBe(false);
    events([...base.slice(0, 2), { ts: "2026-11-16T14:00:00Z", type: "spec.updated", spec: "link-report", data: { added: [], changed: [], retired: [] } }]);
    expect(specDetail(root, "link-report", NOW)!.plans[0]!.stale).toBe(false);   // a note, not a requirement change
  });

  it("fingerprint changes when a task step is ticked [plan-view#R11.S1]", () => {
    plan("001-link-report", "link-report", "status: approved");
    const before = fingerprint(root);
    write("001-link-report/frontend/tasks.md", "---\nwork: w\nvertical: frontend\n---\n### T1: One\n**Steps**\n- [x] 1. Commit\n");
    expect(fingerprint(root)).not.toBe(before);
  });

  it("skips folders with no plan files [plan-view#R11.S3]", () => {
    specFile("link-report", "approved");
    write("005-link-report/notes.txt", "scratch");
    expect(readPlans(root)).toEqual([]);
    expect(brief("link-report")).toBeNull();
  });
});
