import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { specDetail } from "../server/workspace.ts";

const fixture = fileURLToPath(new URL("../../../tests/validate-plan/verticals", import.meta.url));
let root: string;
const ev = (min: number, type: string, data: object) => ({ ts: new Date(Date.parse("2026-11-17T10:00:00Z") + min * 60000).toISOString(), type, work: "007-widget-export", data });
function events(lines: object[]) { writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n"); }

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  copyFileSync(join(fixture, "widget-export.md"), join(root, "specs", "widget-export.md"));
  cpSync(join(fixture, "plan"), join(root, "work", "007-widget-export"), { recursive: true });
});

describe("build status", () => {
  it("shows each task's status mid-build [build#R8.S1]", () => {
    events([
      ev(0, "task.started", { task: "T1" }),
      ev(5, "task.done", { task: "T1", commit: "abc1234", lines: 120, tests: "npm test" }),
      ev(6, "task.started", { task: "T2" }),
    ]);
    const plan = specDetail(root, "widget-export")!.plans[0]!;
    expect(plan.build).toEqual({
      T1: { status: "done", phase: "merged", commit: "abc1234", lines: 120 },
      T2: { status: "running", phase: "building" },
      T3: { status: "waiting" },
    });
    expect(plan.implementedAt).toBe("");
  });

  it("reads failed and blocked, and implemented", () => {
    events([ev(0, "task.failed", { task: "T2", reason: "over budget: 410 lines" }), ev(1, "task.blocked", { task: "T3", reason: "spec silent on double submit" })]);
    writeFileSync(join(root, "work", "007-widget-export", "plan.md"),
      "---\nwork: 007-widget-export\nspec: widget-export\nscope: [R1, R2]\nverticals: [backend, frontend]\nstatus: approved\nimplemented_at: 2026-11-17T11:00:00Z\n---\n# Plan\n");
    const plan = specDetail(root, "widget-export")!.plans[0]!;
    expect(plan.build.T2).toEqual({ status: "failed", reason: "over budget: 410 lines" });
    expect(plan.build.T3).toEqual({ status: "blocked", reason: "spec silent on double submit" });
    expect(plan.implementedAt).toBe("2026-11-17T11:00:00Z");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanView } from "../src/components/PlanView.tsx";
import { buildStage } from "../src/stages.ts";

describe("the Build stage", () => {
  it("lists every task waiting, with the command, before any build [build#R8.S2]", () => {
    events([]);
    const d = specDetail(root, "widget-export")!;
    const h = renderToStaticMarkup(createElement(PlanView, { detail: d, work: "007-widget-export", tab: "build", focus: null }));
    expect((h.match(/build-status waiting/g) ?? []).length).toBe(3);
    expect(h).toContain("/factree:build 007-widget-export");
    expect(buildStage(d.summary)).toMatchObject({ sub: "Not started", href: "/work/widget-export/build/007-widget-export" });
  });

  it("counts done tasks on the stage", () => {
    events([ev(5, "task.done", { task: "T1", commit: "abc1234", lines: 120, tests: "npm test" })]);
    expect(buildStage(specDetail(root, "widget-export")!.summary).sub).toBe("1/3 merged");
  });
});
