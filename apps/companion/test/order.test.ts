import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceState } from "../server/workspace.ts";

const NOW = Date.parse("2026-11-18T12:00:00Z");
let root: string;
let lines: object[];
const t = (hhmm: string, day = "2026-11-18") => `${day}T${hhmm}:00Z`;
const log = (...ev: object[]) => { lines.push(...ev); writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n"); };
const step = (spec: string, ts: string) => ({ ts, type: "spec.approved", spec, data: { by: "A" } });
const asked = (spec: string, ts: string) => [{ ts, type: "spec.step", spec, data: { step: "questions" } }, { ts, type: "question.asked", spec, data: { n: 1, text: "Which?", proposal: "This" } }];
function spec(id: string, updated = "2026-11-17") {
  writeFileSync(join(root, "specs", `${id}.md`), `---\nid: ${id}\ntitle: ${id}\nstatus: approved\nowner: A\nsources:\n  - x\napproved_by: A\napproved_at: 2026-11-17\nretired: []\ncreated: 2026-11-01\nupdated: ${updated}\n---\n# ${id}\n\n## Purpose\nx\n`);
}
function plan(work: string, specId: string) {
  mkdirSync(join(root, "work", work, "frontend"), { recursive: true });
  writeFileSync(join(root, "work", work, "plan.md"), `---\nwork: ${work}\nspec: ${specId}\nscope: [R1]\nverticals: [frontend]\nstatus: approved\n---\n# Plan\n`);
  writeFileSync(join(root, "work", work, "frontend", "tasks.md"), `---\nwork: ${work}\nvertical: frontend\n---\n### T2: Two\n**Proves:** ${specId}#R1.S1\n**Depends on:** none\n`);
}
const order = () => workspaceState(root, "A", NOW).specs.map((s) => s.id);

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  lines = [];
  spec("alpha"); spec("beta");
});

describe("spec list order", () => {
  it("latest activity first [spec-order#R1.S1]", () => {
    log(step("alpha", t("10:00")), step("beta", t("10:30")));
    expect(order()).toEqual(["beta", "alpha"]);
  });

  it("a plan's build task counts as activity [spec-order#R1.S2]", () => {
    plan("010-alpha", "alpha");
    log(step("alpha", t("10:00")), step("beta", t("10:30")), { ts: t("11:00"), type: "task.done", work: "010-alpha", data: { task: "T2", commit: "abc", lines: 10 } });
    expect(order()).toEqual(["alpha", "beta"]);
    expect(workspaceState(root, "A", NOW).specs[0]!.lastActivity).toBe(t("11:00"));
  });

  it("a spec waiting on the user comes first [spec-order#R1.S3]", () => {
    spec("gamma");
    log(...asked("gamma", t("09:00")), step("beta", t("10:30")), step("alpha", t("10:00")));
    expect(order()).toEqual(["gamma", "beta", "alpha"]);
  });

  it("two waiting: the newer first [spec-order#R1.S4]", () => {
    spec("gamma"); spec("delta");
    log(...asked("gamma", t("09:00")), ...asked("delta", t("09:45")), step("beta", t("10:30")));
    expect(order().slice(0, 2)).toEqual(["delta", "gamma"]);
  });

  it("no events: the file's updated date [spec-order#R1.S5]", () => {
    spec("epsilon", "2026-11-10");
    log(step("alpha", t("09:00")));
    const o = order();
    expect(o.indexOf("alpha")).toBeLessThan(o.indexOf("epsilon"));
    expect(o.indexOf("beta")).toBeLessThan(o.indexOf("epsilon"));   // beta's file (2026-11-17) is newer than epsilon's
  });

  it("same second: by id [spec-order#R1.S6]", () => {
    log(step("beta", t("10:00")), step("alpha", t("10:00")));
    expect(order()).toEqual(["alpha", "beta"]);
  });

  it("new activity moves a spec up on the next state [spec-order#R2.S1]", () => {
    log(step("alpha", t("10:00")), step("beta", t("10:30")));
    expect(order()).toEqual(["beta", "alpha"]);
    log({ ts: t("11:00"), type: "spec.step", spec: "alpha", data: { step: "writing" } });
    expect(order()).toEqual(["alpha", "beta"]);
  });
});
