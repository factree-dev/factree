import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { specDetail } from "../server/workspace.ts";
import { LoopLine } from "../src/components/LoopLine.tsx";
import { progressOf } from "../src/progress.ts";

let root: string;
const at = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const step = (min: number, s: string) => ({ ts: at(min), type: "spec.step", spec: "spec-order", data: { step: s, ...(s === "gaps" ? { title: "Spec list order" } : {}) } });
const log = (lines: object[]) => writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
const page = () => {
  const d = specDetail(root, "spec-order")!;
  return { d, h: renderToStaticMarkup(createElement(LoopLine, { summary: d.summary, spec: d.spec, view: "spec" })) };
};
const noPanel = (h: string) => { expect(h).not.toContain('class="live'); expect(h).not.toContain('class="steps"'); };
beforeEach(() => { root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree"); mkdirSync(join(root, "specs"), { recursive: true }); });

describe("spec progress", () => {
  it("reading the code, no panel [spec-progress#R1.S1]", () => {
    log([step(3, "gaps"), step(1, "observe")]);
    const { h } = page();
    expect(h).toMatch(/Writing<span class="ellipsis"[^]*?<\/span> reading the code/);
    noPanel(h);
  });

  it("paused [spec-progress#R1.S2]", () => {
    log([step(50, "gaps"), step(40, "observe")]);
    const { h } = page();
    expect(h).toContain("Paused · 40 min ago");
    noPanel(h);
  });

  it("asking [spec-progress#R1.S3]", () => {
    log([step(3, "gaps"), step(2, "questions"), { ts: at(1), type: "question.asked", spec: "spec-order", data: { n: 1, text: "Which?", proposal: "This" } }]);
    const { h } = page();
    expect(h).toContain(">Asking you<");
    noPanel(h);
  });

  it("finishing [spec-progress#R1.S4]", () => {
    log([step(3, "gaps"), step(1, "approval")]);
    const { h, d } = page();
    expect(h).toMatch(/Writing<span class="ellipsis"[^]*?<\/span> finishing/);
    expect(h.toLowerCase()).not.toContain("your approval");
    expect(progressOf(d.summary, null).centre).not.toContain("approval");
  });

  it("the list doesn't say your approval", () => {
    log([step(3, "gaps"), step(1, "approval")]);
    expect(progressOf(page().d.summary, null).centre).not.toContain("your approval");
  });
});
