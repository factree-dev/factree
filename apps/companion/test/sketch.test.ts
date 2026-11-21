import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseSpec } from "../server/parse-spec.ts";
import { specTabs } from "../src/tabs.ts";
import { SpecView } from "../src/components/SpecView.tsx";
import type { SpecDetail } from "../shared/types.ts";

const example = readFileSync(fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url)), "utf8");
const withSketch = example.replace("## Code\n", "## Sketch\n```\nTeam: Finance   [ Download report ]\n  Name   Email\n```\n\n## Code\n");
const page = (text: string, tab: string) => {
  const spec = parseSpec(text, "link-report");
  const detail = { summary: { id: "link-report", title: spec.title, status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 0, scenarios: 0, openQuestions: 0,
    live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null }, plan: null, verify: null },
    spec, activity: [], plans: [], sessions: [] } as unknown as SpecDetail;
  return renderToStaticMarkup(createElement(SpecView, { detail, user: "", focus: null, tab }));
};

describe("sketch and anti-goals", () => {
  it("shows the sketch on its own tab, exactly as written [spec-writing#R1.S2]", () => {
    const spec = parseSpec(withSketch, "link-report");
    expect(spec.sketch).toBe("Team: Finance   [ Download report ]\n  Name   Email");
    expect(specTabs(spec, 0, "").map((t) => t.id)).toContain("sketch");
    expect(page(withSketch, "sketch")).toContain('<pre class="sketch" aria-label="Sketch">Team: Finance   [ Download report ]\n  Name   Email</pre>');
  });

  it("no sketch, no Sketch tab", () => {
    const spec = parseSpec(example, "link-report");
    expect(spec.sketch).toBeNull();
    expect(specTabs(spec, 0, "").map((t) => t.id)).not.toContain("sketch");
  });

  it("shows anti-goals on the Scope tab", () => {
    expect(parseSpec(example, "link-report").scope.anti).toContain("silently drops or duplicates rows");
    expect(page(example, "scope")).toMatch(/<dt>Must not<\/dt><dd>an export that silently drops/);
  });
});
