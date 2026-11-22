import { vi } from "vitest";
vi.mock("../src/features.ts", () => ({ VERIFY_ON: true }));   // these cases are verify on (verify-paused R6)
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { workspaceState, specDetail } from "../server/workspace.ts";
import { reviewStage, buildStage } from "../src/stages.ts";
import { LoopLine } from "../src/components/LoopLine.tsx";
import { ReviewView } from "../src/components/ReviewView.tsx";
import { parsePath } from "../src/links.ts";
import type { Spec, SpecSummary } from "../shared/types.ts";

const example = readFileSync(fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url)), "utf8");
let root: string;
const ev = (type: string, data: object, min = 10) => ({ ts: new Date(Date.parse("2026-11-18T12:00:00Z") - min * 60000).toISOString(), type, work: "002-link-report", data });
const log = (lines: object[]) => writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs", "link-report.md"), example);
  mkdirSync(join(root, "work", "002-link-report", "frontend"), { recursive: true });
  writeFileSync(join(root, "work", "002-link-report", "plan.md"), "---\nwork: 002-link-report\nspec: link-report\nscope: [R1]\nverticals: [frontend]\nstatus: approved\napproved_by: A\napproved_at: 2026-11-18\nimplemented_at: 2026-11-18\n---\n# Plan\n");
  writeFileSync(join(root, "work", "002-link-report", "frontend", "tasks.md"), "---\nwork: 002-link-report\nvertical: frontend\n---\n### T1: One\n**Proves:** link-report#R1.S1\n**Depends on:** none\n");
});

const summary = (over: Partial<SpecSummary>): SpecSummary => ({
  id: "link-report", title: "report", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 2, scenarios: 4, openQuestions: 0,
  live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null },
  plan: { work: "002-link-report", status: "approved", approvedAt: "2026-11-18", others: 0, tasks: 3, done: 3, implemented: true, review: null },
  verify: null, ...over,
});
const spine = (s: SpecSummary) => renderToStaticMarkup(createElement(LoopLine, { summary: s, spec: { status: "approved", approvedAt: "2026-11-18" } as Spec, view: "plan" }));

describe("the Review stage", () => {
  it("no pull request: Review greyed, no Ship [stage-spine#R3.S1]", () => {
    const s = summary({});
    expect(reviewStage(s)).toMatchObject({ sub: "Verify it first", href: null });
    const h = spine(s);
    expect(h.indexOf('data-stage="verify"')).toBeLessThan(h.indexOf('data-stage="review"'));
    expect(h).not.toContain("Ship");
  });

  it("pull request open [stage-spine#R3.S2]", () => {
    log([ev("review.opened", { pr: "7", url: "https://github.com/o/r/pull/7", base: "main" })]);
    const s = workspaceState(root, "A").specs[0]!;
    expect(s.plan!.review).toMatchObject({ url: "https://github.com/o/r/pull/7", state: "OPEN" });
    expect(reviewStage(s)).toMatchObject({ sub: "Waiting for reviewers", href: "/work/link-report/review" });
    expect(parsePath("/work/link-report/review")).toMatchObject({ page: "review", spec: "link-report" });
  });

  it("the Review page [review#R8.S1]", () => {
    log([
      ev("review.opened", { pr: "7", url: "https://github.com/o/r/pull/7", base: "main" }, 30),
      ev("review.comment", { pr: "7", id: "101", author: "priya", path: "src/App.tsx", line: "42", body: "this loop is off by one" }, 20),
      ev("review.reply", { pr: "7", comment: "101", kind: "fixed", commit: "abc1234" }, 10),
    ]);
    const h = renderToStaticMarkup(createElement(ReviewView, { detail: specDetail(root, "link-report")! }));
    expect(h).toContain('href="https://github.com/o/r/pull/7"');
    expect(h).toContain("Waiting for reviewers");
    expect(h).toMatch(/priya.*src\/App\.tsx:42.*this loop is off by one.*fixed in abc1234/s);
  });

  it("fix under way [review#R8.S2]", () => {
    const s = summary({ plan: { work: "002-link-report", status: "approved", approvedAt: "2026-11-18", others: 0, tasks: 4, done: 3, implemented: false,
      review: { url: "https://github.com/o/r/pull/7", state: "CHANGES_REQUESTED", comments: [] } } });
    expect(buildStage(s).sub).toBe("3/4 tasks done");
    expect(reviewStage(s)).toMatchObject({ sub: "Changes requested", href: "/work/link-report/review" });
  });

  it("conflict shows on Review [review#R10.S1]", () => {
    log([ev("review.opened", { pr: "7", url: "u7", base: "main" }, 30), ev("review.state", { pr: "7", state: "CONFLICTING" }, 10)]);
    const s = workspaceState(root, "A").specs[0]!;
    expect(reviewStage(s)).toMatchObject({ sub: "Conflicts with the base", done: false });
    expect(renderToStaticMarkup(createElement(ReviewView, { detail: specDetail(root, "link-report")! }))).toContain("Conflicts with the base");
  });

  it("resolved reads waiting [review#R10.S2]", () => {
    log([ev("review.opened", { pr: "7", url: "u7", base: "main" }, 30), ev("review.state", { pr: "7", state: "CONFLICTING" }, 20), ev("review.state", { pr: "7", state: "OPEN" }, 10)]);
    expect(reviewStage(workspaceState(root, "A").specs[0]!).sub).toBe("Waiting for reviewers");
  });

  it("the newest plan's pull request", () => {
    log([ev("review.opened", { pr: "7", url: "u7", base: "main" }, 30), ev("review.opened", { pr: "9", url: "u9", base: "main" }, 10), ev("review.state", { pr: "9", state: "MERGED" }, 5)]);
    const r = workspaceState(root, "A").specs[0]!.plan!.review!;
    expect(r).toMatchObject({ url: "u9", state: "MERGED" });
    expect(reviewStage(workspaceState(root, "A").specs[0]!).sub).toBe("Merged");
  });
});

describe("why there's no pull request", () => {
  const counts = (proved: number, failing: number) => ({ proved, failing, unverified: 0, at: "2026-11-18T10:00:00Z" });
  it("verified, no pull request [stage-spine#R3.S3]", () => {
    expect(reviewStage(summary({ verify: counts(8, 0) }))).toMatchObject({ sub: "No pull request yet", href: "/work/link-report/review" });
  });
  it("verified with failures [stage-spine#R3.S4]", () => {
    expect(reviewStage(summary({ verify: counts(7, 1) }))).toMatchObject({ sub: "Fix what's failing first", href: null });
  });
  it("an older verify doesn't open Review", () => {
    const s = summary({ verify: counts(8, 0), plan: { work: "003-link-report", status: "approved", approvedAt: "2026-11-18", others: 1, tasks: 2, done: 1, implemented: false, review: null } });
    expect(reviewStage(s)).toMatchObject({ sub: "Verify it first", href: null });
  });
});
