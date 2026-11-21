import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { workspaceState, specDetail } from "../server/workspace.ts";
import { SpecView } from "../src/components/SpecView.tsx";
import { WaitingLine } from "../src/components/Notices.tsx";
import { parsePath } from "../src/links.ts";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const at = (min: number) => new Date(NOW - min * 60000).toISOString();
let root: string;
const events = (lines: object[]) => writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
const writing = { ts: at(30), type: "spec.step", spec: "spec-order", data: { step: "gaps", title: "Spec list order", sources: ["conversation"] } };
const asked = (n: number, text: string) => ({ ts: at(10), type: "question.asked", spec: "spec-order", data: { n, text, proposal: `Recommended ${n}`, options: [`Other ${n} — changes things`] } });
const page = (tab: string | null) => {
  const d = specDetail(root, "spec-order", NOW)!;
  const cards = workspaceState(root, "John Doe", NOW).decisions.filter((c) => c.spec === "spec-order");
  return renderToStaticMarkup(createElement(SpecView, { detail: d, user: "", focus: null, tab, cards, onDecide: async () => null }));
};

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
});

describe("deciding before the spec has a file", () => {
  it("shows the Decisions tab with a card per question [companion-decide#R1.S1]", () => {
    events([writing, asked(1, "What counts as activity?"), asked(2, "Do waiting specs come first?")]);
    const h = page("decisions");
    expect(h).toContain("No file yet.");
    expect(h).toMatch(/class="tab attention"[^>]*>Decisions/);
    expect(h).toContain("What counts as activity?");   // one at a time (decide-focus): question 1 of 2 first
    expect(h).not.toContain("Do waiting specs come first?");
    expect(h).toContain("1 of 2");
    expect(h).toContain("Recommended 1 <kbd>Enter</kbd>");
    expect(h).toMatch(/Other 1 <kbd>2<\/kbd>/);
  });

  it("Decide opens that tab [companion-decide#R1.S2]", () => {
    events([writing, asked(1, "What counts as activity?"), asked(2, "Do waiting specs come first?")]);
    const line = renderToStaticMarkup(createElement(WaitingLine, { spec: "spec-order", n: 2 }));
    const href = /href="([^"]+)"/.exec(line)![1]!;
    expect(parsePath(href)).toMatchObject({ page: "spec", spec: "spec-order", tab: "decisions" });
    expect(page(parsePath(href).tab)).toContain("What counts as activity?");
  });

  it("an answered question leaves [companion-decide#R1.S3]", () => {
    events([writing, asked(1, "What counts as activity?"), asked(2, "Do waiting specs come first?"),
      { ts: at(5), type: "question.answered", spec: "spec-order", data: { n: 1, answer: "Recommended 1", by: "John Doe", via: "companion" } }]);
    const h = page("decisions");
    expect(h).not.toContain("What counts as activity?");
    expect(h).toContain("Do waiting specs come first?");
  });

  it("nothing waiting: no tabs [companion-decide#R1.S4]", () => {
    events([writing]);
    const h = page(null);
    expect(h).toContain("No file yet.");
    expect(h).not.toContain('class="tabs"');
  });
});
