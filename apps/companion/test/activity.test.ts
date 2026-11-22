import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
vi.mock("../src/features.ts", () => ({ VERIFY_ON: true }));
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { workspaceState, specDetail } from "../server/workspace.ts";
import { activityText } from "../src/status.ts";
import { LoopLine } from "../src/components/LoopLine.tsx";
import { SpecLink } from "../src/components/Sidebar.tsx";

const example = readFileSync(fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url)), "utf8");
let root: string;
const at = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const W = "017-link-report";
const ev = (min: number, type: string, data: object, work = false) => ({ ts: at(min), type, ...(work ? { work: W } : { spec: "link-report" }), data });
const log = (lines: object[]) => writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
const state = () => workspaceState(root, "A").specs.find((s) => s.id === "link-report")!;
const views = () => {
  const s = state(); const d = specDetail(root, "link-report")!;
  return { s, row: renderToStaticMarkup(createElement(SpecLink, { s, active: false })), spine: renderToStaticMarkup(createElement(LoopLine, { summary: d.summary, spec: d.spec, view: "plan" })) };
};
const moving = (h: string) => h.includes('class="ellipsis"');
beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs", "link-report.md"), example);
  const dir = join(root, "work", W, "backend"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, "work", W, "plan.md"), `---\nwork: ${W}\nspec: link-report\nscope: [R1]\nverticals: [backend]\nstatus: approved\napproved_by: A\napproved_at: 2026-11-18\n---\n# Plan\n`);
  writeFileSync(join(dir, "tasks.md"), `---\nwork: ${W}\nvertical: backend\n---\n### T1: One\n**Proves:** link-report#R1.S1\n**Depends on:** none\n\n### T2: Two\n**Proves:** link-report#R1.S1\n**Depends on:** T1\n\n### T3: Three\n**Proves:** link-report#R1.S1\n**Depends on:** T2\n`);
});

describe("live activity", () => {
  it("planning [live-activity#R1.S1]", () => {
    log([ev(3, "stage.step", { stage: "plan", step: "starting" }), ev(1, "stage.step", { stage: "plan", step: "designing", work: W })]);
    const { s, row, spine } = views();
    expect(s.activity).toMatchObject({ stage: "plan", label: "Planning", step: "designing", paused: false });
    expect(activityText(s.activity!)).toBe("Planning… designing");
    expect(row).toContain("Planning"); expect(row).toContain("designing"); expect(moving(row)).toBe(true);
    expect(spine).toMatch(/class="loop-now"><span class="activity-line[^"]*">Planning<span class="ellipsis"|class="loop-now">Planning<span class="ellipsis"/);   // the loop line reads it, ellipsis moving
  });

  it("building [live-activity#R1.S2]", () => {
    log([ev(5, "stage.step", { stage: "build", work: W }), ev(4, "task.started", { task: "T1" }, true), ev(3, "task.done", { task: "T1", commit: "a", lines: 10 }, true), ev(2, "task.started", { task: "T2" }, true)]);
    const { s, spine } = views();
    expect(activityText(s.activity!)).toBe("Building… T2 of 3");
    expect(spine).toMatch(/Building<span class="ellipsis"/);
  });

  it("the self-review step reads Probing the branch [live-activity#R1.S3, build-visibility#R4.S2]", () => {
    log([ev(2, "stage.step", { stage: "self-review", work: W })]);
    expect(activityText(state().activity!)).toBe("Probing the branch…");
    expect(views().spine).toMatch(/Probing the branch<span class="ellipsis"/);
  });

  it("verifying [live-activity#R1.S4]", () => {
    const p = join(root, "work", W, "plan.md");   // verify starts on a built plan
    writeFileSync(p, readFileSync(p, "utf8").replace("approved_at: 2026-11-18\n", "approved_at: 2026-11-18\nimplemented_at: 2026-11-18\n"));
    log([ev(1, "stage.step", { stage: "verify" })]);
    expect(activityText(state().activity!)).toBe("Verifying…");
    expect(views().spine).toMatch(/Verifying<span class="ellipsis"/);
  });

  it("opening the pull request [live-activity#R1.S5]", () => {
    log([ev(1, "stage.step", { stage: "review", step: "pushing", work: W })]);
    expect(activityText(state().activity!)).toBe("Opening the pull request…");
  });

  it("writing [live-activity#R1.S6]", () => {
    log([ev(2, "spec.step", { step: "gaps", title: "report" }), ev(1, "spec.step", { step: "observe" })]);
    const { s, row } = views();
    expect(activityText(s.activity!)).toBe("Writing… reading the code");
    expect(moving(row)).toBe(true);
  });

  it("planning finishes [live-activity#R2.S1]", () => {
    log([ev(3, "stage.step", { stage: "plan", step: "writing tasks", work: W }), ev(1, "plan.approved", { by: "flow" }, true)]);
    const { s, row } = views();
    expect(s.activity).toBeNull();
    expect(row).toContain("Build · Up next");   // where the spec is now (spec-row R1)
    expect(moving(row)).toBe(false);
  });

  it("stops on the user [live-activity#R2.S2]", () => {
    log([ev(3, "stage.step", { stage: "plan", step: "designing", work: W }), ev(1, "question.asked", { n: 1, text: "Approve N1?" })]);
    const { s, row } = views();
    expect(activityText(s.activity!)).toBe("Asking you");
    expect(moving(row)).toBe(false);
  });

  it("paused [live-activity#R3.S1]", () => {
    log([ev(30, "stage.step", { stage: "build", work: W }), ev(25, "task.started", { task: "T2" }, true)]);
    const { s, row } = views();
    expect(s.activity!.paused).toBe(true);
    expect(activityText(s.activity!)).toBe("Paused · 25 min ago");
    expect(moving(row)).toBe(false);
  });

  it("a failed task stops the ellipsis", () => {
    log([ev(3, "task.started", { task: "T2" }, true), ev(1, "task.failed", { task: "T2", reason: "over budget" }, true)]);
    expect(state().activity).toBeNull();
  });

  it("the newest plan's activity", () => {
    log([ev(5, "stage.step", { stage: "verify" }), ev(1, "stage.step", { stage: "plan", step: "designing" })]);
    expect(activityText(state().activity!)).toBe("Planning… designing");
  });
});

describe("step words", () => {
  it("the writing step [live-activity#R1.S7]", () => {
    log([ev(2, "spec.step", { step: "gaps", title: "report" }), ev(1, "spec.step", { step: "writing" })]);
    expect(activityText(state().activity!)).toBe("Writing…");
  });
  it("no label repeats its step", () => {
    for (const step of ["gaps", "observe", "questions", "writing", "checking", "approval"]) {
      log([ev(1, "spec.step", { step })]);
      expect(activityText(state().activity!)).not.toMatch(/^(\w+)… \1/i);
    }
    for (const step of ["starting", "reading the repo", "designing", "writing tasks", "checking"]) {
      log([ev(1, "stage.step", { stage: "plan", step })]);
      expect(activityText(state().activity!)).not.toMatch(/^Planning… planning/i);
    }
  });
});

describe("a spinner while busy", () => {
  const build = [ev(5, "stage.step", { stage: "build", work: W }), ev(4, "task.started", { task: "T1" }, true), ev(3, "task.done", { task: "T1", commit: "a", lines: 10 }, true), ev(2, "task.started", { task: "T2" }, true)];
  const seg = (h: string, key: string) => { const i = h.indexOf(`data-stage="${key}"`); return h.slice(i, h.indexOf("</a>", i)); };
  it("spinner while building [live-activity#R5.S1]", () => {
    log(build);
    const { row, spine } = views();
    expect(row).toContain('class="mini-seg running"');   // the list's ring pulses on the running stage (live-activity R5, as updated)
    expect(seg(spine, "build")).toContain('class="loop-seg running"');   // the line pulses on the running stage (live-activity R5)
  });
  it("tick when finished [live-activity#R5.S2]", () => {
    log([...build, ev(1, "plan.implemented", {}, true)]);
    const { row, spine } = views();
    expect(row).not.toContain('class="spinner"');
    expect(spine).not.toContain('class="loop-seg running"');
  });
  it("no spinner when paused or asking [live-activity#R5.S3]", () => {
    log([ev(30, "stage.step", { stage: "build", work: W }), ev(25, "task.started", { task: "T2" }, true)]);
    expect(views().row).not.toContain('class="spinner"');
    log([ev(3, "stage.step", { stage: "plan", step: "designing", work: W }), ev(1, "question.asked", { n: 1, text: "Which?" })]);
    expect(views().spine).not.toContain('class="loop-seg running"');
  });
});
