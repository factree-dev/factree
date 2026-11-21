import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { specDetail } from "../server/workspace.ts";
import { decisionGroups } from "../src/decisions.ts";

const exampleSpec = fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url));
const NOW = Date.parse("2026-11-17T10:00:00Z");
const at = (min: number) => new Date(NOW - min * 60000).toISOString();
let root: string;
function events(lines: object[]) { writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n"); }

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  copyFileSync(exampleSpec, join(root, "specs", "link-report.md"));
});

describe("decisions from the event log", () => {
  it("lists every unanswered question of a brief [decisions-view#R1.S1]", () => {
    events([
      { ts: at(20), type: "spec.step", spec: "link-report", data: { step: "questions" } },
      { ts: at(10), type: "question.asked", spec: "link-report", data: { n: 3, text: "Where does the button go?", why: "", proposal: "Beside each id" } },
      { ts: at(10), type: "question.asked", spec: "link-report", data: { n: 4, text: "Double click?", why: "", proposal: "Copy once" } },
    ]);
    const d = specDetail(root, "link-report", NOW)!;
    expect(d.summary.live.pending.map((q) => q.n)).toEqual([3, 4]);
    expect(decisionGroups(d).waiting.map((w) => [w.text, w.recommendation])).toEqual([["Where does the button go?", "Beside each id"], ["Double click?", "Copy once"]]);
  });

  it("names who decided each kind [decisions-view#R2.S1]", () => {
    mkdirSync(join(root, "work", "012-x"), { recursive: true });
    writeFileSync(join(root, "work", "012-x", "plan.md"), "---\nwork: 012-x\nspec: link-report\nscope: [R1]\nverticals: [frontend]\nstatus: approved\napproved_by: preference: approve_plans\napproved_at: 2026-11-17\n---\n# Plan\n");
    events([{ ts: at(5), type: "decision.recorded", spec: "link-report", data: { id: "call-1", by: "Claude", call: true, text: "panel in the side column" } }]);
    const g = decisionGroups(specDetail(root, "link-report", NOW)!);
    expect(g.decisions[0]).toMatchObject({ id: "D1", decider: "Priya" });
    expect(g.approvals.find((a) => a.id === "Plan" && a.text === "012-x approved")).toMatchObject({ decider: "preference: approve_plans" });
    expect(g.calls[0]).toMatchObject({ id: "call-1", text: "panel in the side column", decider: "Claude's call" });
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpecView } from "../src/components/SpecView.tsx";
import { specTabs } from "../src/tabs.ts";

describe("the Decisions tab", () => {
  const page = (d: ReturnType<typeof specDetail>) => renderToStaticMarkup(createElement(SpecView, { detail: d!, user: "", focus: null, tab: "decisions" }));

  it("lists approvals of the spec and its plans [decisions-view#R1.S2]", () => {
    mkdirSync(join(root, "work", "012-preferences"), { recursive: true });
    writeFileSync(join(root, "work", "012-preferences", "plan.md"), "---\nwork: 012-preferences\nspec: link-report\nscope: [R1]\nverticals: [frontend]\nstatus: approved\napproved_by: preference: approve_plans\napproved_at: 2026-11-17\n---\n# Plan\n");
    const h = page(specDetail(root, "link-report", NOW));
    expect(h).toMatch(/>Spec<\/span><div class="dbody"><span>Approved<\/span>.*John Doe/s);
    expect(h).toMatch(/>Plan<\/span><div class="dbody"><span>012-preferences approved<\/span>.*preference: approve_plans/s);
  });

  it("hides empty groups and leaves the tab unmarked [decisions-view#R1.S3]", () => {
    const d = specDetail(root, "link-report", NOW)!;
    const h = page(d);
    expect(h).not.toContain('aria-label="Waiting on you"');
    expect(h).not.toContain("Claude&#x27;s calls");
    expect(h).toContain('aria-label="Decisions"');
    expect(specTabs(d.spec!, 0, "", d.summary.live.pending.length).find((t) => t.id === "decisions")!.attention).toBe(false);
  });

  it("copies an override for a call [decisions-view#R3.S1]", () => {
    events([{ ts: at(5), type: "decision.recorded", spec: "link-report", data: { id: "call-2", by: "Claude", call: true, text: "sub-tabs instead of stacked" } }]);
    const g = decisionGroups(specDetail(root, "link-report", NOW)!);
    expect(g.calls[0]!.override).toBe(`Change Claude's call call-2 on link-report ("sub-tabs instead of stacked") to: `);
    expect(page(specDetail(root, "link-report", NOW))).toContain("Copy override");
  });
});
