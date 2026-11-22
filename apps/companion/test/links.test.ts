import { describe, it, expect } from "vitest";
import { vi } from "vitest";
vi.mock("../src/features.ts", () => ({ VERIFY_ON: true }));
import { tokenize, codeHref, planHref, type LinkEnv } from "../src/links.ts";
import { webUrlFromRemote } from "../server/repo.ts";

const env: LinkEnv = {
  specId: "spec-status",
  refs: new Set(["R2", "R2.S1", "O3", "D1", "Q1"]),
  specIds: new Set(["spec-status", "link-report"]),
  repo: { web: "https://github.com/factree-dev/factree", ref: "main" },
};
const links = (text: string) =>
  tokenize(text, env).flatMap((t) => (t.t === "link" || (t.t === "code" && t.href) ? [[t.text, t.href]] : []));

describe("tokenize", () => {
  it("links IDs that exist in the spec, and leaves unknown ones as text", () => {
    expect(links("Source: O3, resolves Q1 and R9")).toEqual([["O3", "/work/spec-status/spec/observations/O3"], ["Q1", "/work/spec-status/spec/questions/Q1"]]);
  });

  it("links scenarios and IDs in other specs", () => {
    expect(links("see R2.S1 and link-report#R2.S1")).toEqual([
      ["R2.S1", "/work/spec-status/spec/requirements/R2.S1"],
      ["link-report#R2.S1", "/work/link-report/spec/requirements/R2.S1"],
    ]);
  });

  it("does not link IDs inside words or other specs that don't exist", () => {
    expect(links("UR2 R2x nope#R2 R2-R5")).toEqual([]);
  });

  it("links code paths with line ranges to GitHub", () => {
    expect(links("in `apps/companion/server/workspace.ts:76-86`")).toEqual([
      ["apps/companion/server/workspace.ts:76-86", "https://github.com/factree-dev/factree/blob/main/apps/companion/server/workspace.ts#L76-L86"],
    ]);
  });

  it("leaves code that isn't a path as plain code", () => {
    expect(links("`SpecSummary.status` and `liveFor` and `0.5`")).toEqual([]);
  });

  it("links URLs without trailing punctuation", () => {
    expect(links("from https://example.com/a/b.")).toEqual([["https://example.com/a/b", "https://example.com/a/b"]]);
  });

  it("links inside bold and struck text", () => {
    const [t] = tokenize("~~D1~~", env);
    expect(t).toMatchObject({ t: "del", children: [{ t: "link", text: "D1" }] });
  });
});

describe("codeHref", () => {
  it("returns nothing without a repo", () => {
    expect(codeHref("src/a.ts", null)).toBeUndefined();
  });

  it("links root files and directories", () => {
    expect(codeHref("CLAUDE.md", env.repo)).toBe("https://github.com/factree-dev/factree/blob/main/CLAUDE.md");
    expect(codeHref("plugins/factree/lenses/", env.repo)).toBe("https://github.com/factree-dev/factree/blob/main/plugins/factree/lenses/");
  });
});

describe("webUrlFromRemote", () => {
  it.each([
    ["git@github.com:factree-dev/factree.git", "https://github.com/factree-dev/factree"],
    ["https://github.com/factree-dev/factree.git", "https://github.com/factree-dev/factree"],
    ["ssh://git@github.com/factree-dev/factree.git", "https://github.com/factree-dev/factree"],
    ["https://token@github.com/factree-dev/factree", "https://github.com/factree-dev/factree"],
  ])("%s", (remote, web) => {
    expect(webUrlFromRemote(remote)).toBe(web);
  });

  it("returns null for no remote", () => {
    expect(webUrlFromRemote("")).toBeNull();
  });
});

describe("plan links", () => {
  const planEnv: LinkEnv = {
    specId: "link-report",
    refs: new Set(["R2", "R2.S1"]),
    specIds: new Set(["link-report"]),
    repo: { web: "https://github.com/acme/app", ref: "main" },
    local: new Map([["T2", "/work/link-report/plan/002/backend/tasks/T2"], ["P2", "/work/link-report/plan/002/backend/design/P2"]]),
    resolve: (h) => (h === "../backend/design.md#api-contract" ? "/work/link-report/plan/002/backend/design" : undefined),
  };
  const planLinks = (text: string) =>
    tokenize(text, planEnv).flatMap((t) => (t.t === "link" || (t.t === "code" && t.href) ? [[t.text, t.href]] : []));

  it("links a proved scenario to the spec [plan-view#R5.S1]", () => {
    expect(planLinks("**Proves:** link-report#R2.S1")).toEqual([["link-report#R2.S1", "/work/link-report/spec/requirements/R2.S1"]]);
  });

  it("links a task in another vertical [plan-view#R5.S2]", () => {
    expect(planLinks("**Depends on:** T2 (the 429 contract)")).toEqual([["T2", "/work/link-report/plan/002/backend/tasks/T2"]]);
    expect(planHref("link-report", "002", "backend", "T2")).toBe("/work/link-report/plan/002/backend/tasks/T2");   // opens Tasks (plan-view R12)
  });

  it("links code paths to the repo [plan-view#R5.S4]", () => {
    expect(planLinks("following `src/teams/routes.ts:22`")).toEqual([["src/teams/routes.ts:22", "https://github.com/acme/app/blob/main/src/teams/routes.ts#L22"]]);
  });

  it("leaves a missing task as text [plan-view#R5.S5]", () => {
    expect(planLinks("**Depends on:** T9")).toEqual([]);
  });

  it("links a pattern in the same design [plan-view#R5.S6]", () => {
    expect(planLinks("following P2, as in `P2`")).toEqual([
      ["P2", "/work/link-report/plan/002/backend/design/P2"],
      ["P2", "/work/link-report/plan/002/backend/design/P2"],
    ]);
  });

  it("leaves an unknown ID in the plan's spec as text [plan-view#R5.S7]", () => {
    expect(planLinks("**Proves:** link-report#R9.S1")).toEqual([]);
  });

  it("resolves plan-relative markdown links and keeps URLs", () => {
    expect(planLinks("defined in [backend/design.md](../backend/design.md#api-contract), see [docs](https://x.dev/a)")).toEqual([
      ["backend/design.md", "/work/link-report/plan/002/backend/design"],
      ["docs", "https://x.dev/a"],
    ]);
    expect(tokenize("[notes](./notes.txt)", planEnv)).toEqual([{ t: "text", text: "notes" }]);
  });

  it("doesn't link task or pattern IDs outside a plan", () => {
    expect(links("T2 and P1")).toEqual([]);
  });
});

import { parsePath, fromLegacyHash, refHref as refPath } from "../src/links.ts";
describe("paths", () => {
  it("an item path opens its view with the item [deep-links#R2.S1]", () => {
    expect(refPath("link-report", "R2.S1")).toBe("/work/link-report/spec/requirements/R2.S1");
    expect(parsePath("/work/link-report/spec/requirements/R2.S1")).toMatchObject({ page: "spec", spec: "link-report", tab: null, ref: "R2.S1" });
    expect(parsePath("/work/build/plan/015-build/claude-plugin/tasks/T2")).toMatchObject({ page: "plan", spec: "build", plan: "015-build", tab: "claude-plugin", view: "tasks", ref: "T2" });
    expect(parsePath("/work/x/spec/decisions/D1")).toMatchObject({ page: "spec", tab: "decisions", ref: "D1" });
    expect(parsePath("/work/x/build/015-build")).toMatchObject({ page: "plan", tab: "build" });
    expect(parsePath("/work/x/verify")).toMatchObject({ page: "verify", spec: "x" });
    expect(parsePath("/decisions")).toMatchObject({ page: "decisions" });
    expect(parsePath("/")).toMatchObject({ page: "home" });
    expect(parsePath("/work/x/plan/015-build/backend/nonsense")).toMatchObject({ page: "notfound" });
  });

  it("old #spec= links become paths [deep-links#R4.S1]", () => {
    expect(fromLegacyHash("#spec=link-report&plan=002-link-report&tab=backend&ref=T1&view=tasks")).toBe("/work/link-report/plan/002-link-report/backend/tasks/T1");
    expect(fromLegacyHash("#spec=link-report&ref=R2.S1")).toBe("/work/link-report/spec/requirements/R2.S1");
    expect(fromLegacyHash("#spec=link-report&tab=verify")).toBe("/work/link-report/verify");
    expect(fromLegacyHash("#spec=link-report")).toBe("/work/link-report/spec");
    expect(fromLegacyHash("#nothing")).toBeNull();
  });
});

import { fromLegacyPath } from "../src/links.ts";
describe("yesterday's paths", () => {
  it("open the same view at the current path [deep-links#R4.S2]", () => {
    expect(fromLegacyPath("/specs/build/plan/015-build/build")).toBe("/work/build/build/015-build");
    expect(fromLegacyPath("/specs/link-report")).toBe("/work/link-report/spec");
    expect(fromLegacyPath("/specs/link-report/requirements/R2.S1")).toBe("/work/link-report/spec/requirements/R2.S1");
    expect(fromLegacyPath("/specs/link-report/plan/002-link-report/frontend/tasks/T2")).toBe("/work/link-report/plan/002-link-report/frontend/tasks/T2");
    expect(fromLegacyPath("/specs/link-report/verify")).toBe("/work/link-report/verify");
    expect(fromLegacyPath("/work/link-report/spec")).toBeNull();
    expect(parsePath("/work/build/build/015-build")).toMatchObject({ page: "plan", plan: "015-build", tab: "build" });
  });
});
