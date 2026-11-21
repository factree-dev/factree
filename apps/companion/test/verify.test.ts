import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { specDetail, workspaceState } from "../server/workspace.ts";
import { SpecView } from "../src/components/SpecView.tsx";
import { VerifyView } from "../src/components/VerifyView.tsx";
import { verifyStage } from "../src/stages.ts";

const exampleSpec = fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url));
let root: string;
beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  copyFileSync(exampleSpec, join(root, "specs", "link-report.md"));
});
const verified = (ts: string, data: object) => ({ ts, type: "spec.verified", spec: "link-report", data });

describe("verify in the companion", () => {
  it("reads the latest verify result [verify#R4.S1]", () => {
    writeFileSync(join(root, "events.jsonl"), [
      verified("2026-11-17T09:00:00Z", { proved: 1, failing: 1, unverified: 11, results: {} }),
      verified("2026-11-17T10:00:00Z", { proved: 11, failing: 0, unverified: 2, results: { "R1.S1": { status: "proved", evidence: "admin test [link-report#R1.S1]" }, "R2.S3": { status: "unverified", evidence: "no test cites it" } } }),
    ].map((l) => JSON.stringify(l)).join("\n") + "\n");
    const s = workspaceState(root, "A").specs[0]!;
    expect(s.verify).toEqual({ proved: 11, failing: 0, unverified: 2, manual: 0, at: "2026-11-17T10:00:00Z" });
    expect(verifyStage(s).sub).toBe("11 proved · 2 unverified");
    const d = specDetail(root, "link-report")!;
    expect(d.verify!.results["R2.S3"]).toEqual({ status: "unverified", evidence: "no test cites it" });
    const h = renderToStaticMarkup(createElement(VerifyView, { detail: d }));
    expect(h).toMatch(/R1\.S1.*proved.*admin test/s);
    expect(h).toMatch(/R2\.S3.*unverified.*no test cites it/s);
    expect(h).toContain('href="/work/link-report/spec/requirements/R1.S1"');
    const spec = renderToStaticMarkup(createElement(SpecView, { detail: d, user: "", focus: null }));
    expect(spec).not.toContain("tab=verify");   // the spec page has no Verify tab
  });

  it("offers the command when never verified; the verify page still works by address [verify#R4.S2] [stage-spine#R1.S1]", () => {
    const s = workspaceState(root, "A").specs[0]!;
    expect(s.verify).toBeNull();
    expect(verifyStage(s)).toMatchObject({ sub: "Build it first", href: null });   // nothing built yet (stage-spine R1)
    const h = renderToStaticMarkup(createElement(VerifyView, { detail: specDetail(root, "link-report")! }));
    expect(h).toContain("/factree:verify link-report");
  });
});
