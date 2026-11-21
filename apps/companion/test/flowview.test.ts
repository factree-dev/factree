import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowView } from "../src/components/FlowView.tsx";
import { parseSpec } from "../server/parse-spec.ts";
import { specTabs } from "../src/tabs.ts";
import type { VerifyResult } from "../shared/types.ts";

const spec = parseSpec(`---
id: link-report
title: report export
status: approved
---
# report export

## Purpose
P

## Requirements

### Requirement: R2 Export contents
The export service SHALL include one row per active link.

#### Scenario: S1 Mixed team
- **GIVEN** 2 active and 1 deleted
- **WHEN** an admin exports
- **THEN** a header and 2 rows

#### Scenario: S2 Empty team
- **GIVEN** a team with no links
- **WHEN** an admin exports the team
- **THEN** only the header row

## Sketch
\`\`\`flow
Team page -> Exporting : export [R2.S1, R2.S2]
Exporting -> File : rows [R2.S1]
Exporting -> Empty file : no rows [R2.S2]
File -> Team page : back
\`\`\`
`, "link-report");
const verify: VerifyResult = { proved: 1, failing: 1, unverified: 0, at: "2026-11-19T10:00:00Z", results: { "R2.S1": { status: "proved", evidence: "t" }, "R2.S2": { status: "failing", evidence: "t" } } };
const view = (playing: string | null = null, step = 0) => renderToStaticMarkup(createElement(FlowView, { spec, verify, playing, step }));
const arrowClass = (h: string, action: string) => new RegExp(`class="edge ([a-z]+)"[^>]*><title>${action}`).exec(h)?.[1];
const now = (h: string) => [...h.matchAll(/class="fcard now"[^>]*>(?:<[^>]+>)*([^<]+)</g)].map((m) => m[1]);

describe("the Flow tab", () => {
  it("shows a Flow tab in place of Sketch", () => {
    const ids = specTabs(spec, 0, "").map((t) => t.id);
    expect(ids).toContain("flow");
    expect(ids).not.toContain("sketch");
  });

  it("a failing scenario [spec-flow#R3.S1]", () => {
    const h = view();
    expect(arrowClass(h, "no rows")).toBe("bad");
    expect(arrowClass(h, "rows")).toBe("ok");
    expect(arrowClass(h, "export")).toBe("bad");   // the worst of its scenarios
  });

  it("a gap [spec-flow#R3.S2]", () => {
    const h = view();
    expect(arrowClass(h, "back")).toBe("gap");
    expect(h).toMatch(/Not covered[\s\S]*File → Team page: back/);
  });

  it("play [spec-flow#R4.S1]", () => {
    expect(now(view("R2.S2", 0))).toEqual(["Team page"]);
    expect(now(view("R2.S2", 1))).toEqual(["Exporting"]);
    const last = view("R2.S2", 2);
    expect(now(last)).toEqual(["Empty file"]);
    expect(last).toContain("a team with no links");
    expect(last).toContain("an admin exports the team");
    expect(last).toContain("only the header row");
  });
});

import { parsePath } from "../src/links.ts";
import { specTabHref } from "../src/tabs.ts";
describe("opening the Flow tab", () => {
  it("opening the tab [spec-flow#R2.S4]", () => {
    expect(specTabHref("live-activity", "flow")).toBe("/work/live-activity/spec/flow");
    expect(parsePath("/work/live-activity/spec/flow")).toMatchObject({ page: "spec", spec: "live-activity", tab: "flow" });
    for (const t of specTabs(spec, 1, "").map((x) => x.id)) expect(parsePath(specTabHref("x", t)).tab).toBe(t === "requirements" ? null : t);   // every tab opens; Requirements is the default
  });
});
