import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSpec, parseFrontMatter } from "../server/parse-spec.ts";

const example = readFileSync(fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url)), "utf8");

describe("parseSpec on the example spec", () => {
  const spec = parseSpec(example, "link-report");

  it("reads front matter", () => {
    expect(spec.id).toBe("link-report");
    expect(spec.title).toBe("Link reports for teams");
    expect(spec.status).toBe("approved");
    expect(spec.owner).toBe("priya");
    expect(spec.sources).toEqual(["JIRA-482", "JIRA-517", "https://example.atlassian.net/wiki/spaces/PROD/pages/123/Link+exports"]);
    expect(spec.approvedBy).toBe("John Doe");
  });

  it("reads purpose and scope", () => {
    expect(spec.purpose).toMatch(/^Team admins load link data/);
    expect(spec.scope.in).toMatch(/^On-demand report export/);
    expect(spec.scope.out).toMatch(/^Scheduled or emailed exports/);
  });

  it("reads requirements and scenarios with steps", () => {
    expect(spec.requirements.map((r) => r.id)).toEqual(["R1", "R2", "R3", "R4", "R5", "R6"]);
    const r2 = spec.requirements[1]!;
    expect(r2.name).toBe("Export contents");
    expect(r2.statement).toMatch(/SHALL include exactly one row per active link/);
    expect(r2.source).toBe("JIRA-482");
    expect(r2.scenarios.map((s) => s.id)).toEqual(["S1", "S2", "S3"]);
    expect(r2.scenarios[1]!.steps.map((s) => s.kind)).toEqual(["GIVEN", "WHEN", "THEN", "AND"]);
    expect(spec.requirements.reduce((n, r) => n + r.scenarios.length, 0)).toBe(13);
  });

  it("reads observations, decisions, open questions and code", () => {
    expect(spec.observations.map((o) => o.id)).toEqual(["O1", "O2", "O3"]);
    expect(spec.decisions.map((d) => d.id)).toEqual(["D1", "D2", "D3", "D4"]);
    expect(spec.decisions[0]).toMatchObject({ who: "Priya", date: "2026-11-15", resolves: ["Q1"], superseded: false });
    expect(spec.decisions[0]!.text).not.toMatch(/2026-11-15/);
    expect(spec.questions).toEqual([{ id: "Q2", text: "Should exports leave out fields the admin cannot see under field-level permissions?", owner: "Priya", blocks: [] }]);
    expect(spec.code.length).toBeGreaterThan(0);
    expect(spec.problems).toEqual([]);
  });
});

describe("parseSpec edge cases", () => {
  it("reports problems instead of failing", () => {
    const spec = parseSpec("# Just a title\n\nSome text\n", "loose");
    expect(spec.title).toBe("Just a title");
    expect(spec.status).toBe("draft");
    expect(spec.problems).toContain("No front matter");
    expect(spec.problems.some((p) => p.includes("Requirements"))).toBe(true);
  });

  it("reads blocked requirements, owners and superseded decisions", () => {
    const text = [
      "---", "id: x", "title: X", "status: draft", "retired: [R3]", "---", "# X",
      "## Requirements", "### Requirement: R1 Thing", "The service SHALL do it.", "Blocked by: Q2, Q4",
      "#### Scenario: S1 Case", "- **WHEN** a", "- **THEN** b",
      "## Decisions", "- D1 ~~Old way~~ Superseded by D2. (2026-11-01, Sam)",
      "## Open questions", "- Q2 Which way? Owner: John Doe. Blocks: R1.",
    ].join("\n");
    const spec = parseSpec(text);
    expect(spec.requirements[0]!.blockedBy).toEqual(["Q2", "Q4"]);
    expect(spec.decisions[0]!.superseded).toBe(true);
    expect(spec.questions[0]).toEqual({ id: "Q2", text: "Which way?", owner: "John Doe", blocks: ["R1"] });
  });

  it("parses inline lists and strips comments in front matter", () => {
    const { fm } = parseFrontMatter("---\nscope: [R1, R2]   # in scope\nstatus: draft # note\n---\n");
    expect(fm.scope).toEqual(["R1", "R2"]);
    expect(fm.status).toBe("draft");
  });
});
