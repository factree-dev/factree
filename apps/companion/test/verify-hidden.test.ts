import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePath } from "../src/links.ts";
import { FlowView } from "../src/components/FlowView.tsx";
import { ReviewView } from "../src/components/ReviewView.tsx";
import { parseSpec } from "../server/parse-spec.ts";
import { searchIndex } from "../server/search.ts";
import { workspaceState, specDetail } from "../server/workspace.ts";
import type { SpecDetail, VerifyResult } from "../shared/types.ts";

const fixtures = fileURLToPath(new URL("../../../tests/fixtures/workspace", import.meta.url));
const spec = parseSpec(`---
id: link-report
title: report
status: approved
---
# report

## Purpose
P

## Requirements

### Requirement: R2 Export
The service SHALL export.

#### Scenario: S1 Mixed
- **GIVEN** a
- **WHEN** b
- **THEN** c

#### Scenario: S2 Empty
- **GIVEN** a
- **WHEN** b
- **THEN** c

## Sketch

\`\`\`flow
Team page -> Exporting : export [R2.S1, R2.S2]
Exporting -> Team page : back
\`\`\`
`, "link-report");
const verify: VerifyResult = { proved: 0, failing: 2, unverified: 0, at: "x", results: { "R2.S1": { status: "failing", evidence: "t" }, "R2.S2": { status: "proved", evidence: "t" } } };

let root: string;
beforeEach(() => { root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree"); cpSync(fixtures, root, { recursive: true }); });
const log = (lines: object[]) => writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");

describe("verify hidden while paused", () => {
  it("a verify link opens the spec page [verify-paused#R4.S2]", () => {
    expect(parsePath("/work/link-report/verify")).toMatchObject({ page: "spec", spec: "link-report" });
  });

  it("flow arrows are neutral with verify off [verify-paused#R4.S3]", () => {
    const h = renderToStaticMarkup(createElement(FlowView, { spec, verify }));
    expect(h).not.toMatch(/class="(edge|flabel|fdot) ?[^"]*\b(bad|ok|none|failing|proved|unverified)\b/);
    expect(h).toContain("edge neutral");
  });

  it("an old verify activity isn't shown as Verifying [verify-paused#R4.S5]", () => {
    log([{ ts: new Date().toISOString(), type: "stage.step", spec: "link-report", data: { stage: "verify" } }]);
    expect(workspaceState(root, "A").specs.find((s) => s.id === "link-report")!.live.step).not.toBe("verify");
    expect(JSON.stringify(workspaceState(root, "A"))).not.toContain("Verifying");
  });

  it("a workspace with spec.verified events loads, nothing shown [verify-paused#R5.S1]", () => {
    log([{ ts: "2026-11-19T10:00:00Z", type: "spec.verified", spec: "link-report", data: { proved: 1, failing: 2, unverified: 0, results: {} } }]);
    const d = specDetail(root, "link-report") as SpecDetail;
    expect(d).toBeTruthy();
    const html = renderToStaticMarkup(createElement(ReviewView, { detail: d }));
    expect(html).not.toMatch(/verif|failing/i);
  });

  it("search has no Verify stage [verify-paused#R4.S2]", () => {
    expect(searchIndex(root).filter((i) => i.title.startsWith("Verify"))).toEqual([]);
  });
});
