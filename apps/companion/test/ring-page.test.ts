import { allCss } from "./css.ts";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { currentStageHref } from "../src/progress.ts";
import { LoopLine } from "../src/components/LoopLine.tsx";
import type { Spec, SpecSummary } from "../shared/types.ts";

const base = (over: Partial<SpecSummary>): SpecSummary => ({
  id: "link-report", title: "report", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 2, scenarios: 4, openQuestions: 0,
  live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null },
  plan: null, verify: null, activity: null, loop: { stale: [false, false, false, false, false], round: 1 }, ...over,
});
const plan = (over: object) => ({ work: "002-link-report", status: "approved", approvedAt: "2026-11-20", others: 0, tasks: 3, done: 0, implemented: false, review: null, ...over }) as SpecSummary["plan"];
const spec = { status: "approved", approvedAt: "2026-11-20" } as Spec;
const ring = (s: SpecSummary, view = "spec", waiting = 0) => renderToStaticMarkup(createElement(LoopLine, { summary: s, spec, view, waiting }));
const segState = (h: string, stage: string) => new RegExp(`data-stage="${stage}"[\\s\\S]*?class="loop-seg ([a-z]+)"`).exec(h)?.[1];
const building = base({ plan: plan({ done: 1 }), activity: { stage: "build", label: "Building", step: "T2 of 3", since: "2026-11-20T10:00:00Z", paused: false, asking: false } });

describe("the ring", () => {
  it("building [spec-ring#R1.S1]", () => {
    const h = ring(building, "build");
    expect(["spec", "plan", "build"].map((s) => segState(h, s))).toEqual(["done", "done", "running"]);
    expect(h).toMatch(/class="loop-pct">47<small>/);
    expect(h).toContain("Building… T2 of 3");
  });

  it("waiting on the user [spec-ring#R1.S2]", () => {
    const h = ring(base({ status: "needs_you" }), "spec", 1);
    expect(segState(h, "spec")).toBe("waiting");
    expect(h).toContain("1 decision waiting");
    expect(h).toMatch(/href="\/work\/link-report\/spec\/decisions"[^>]*>Decide/);
  });

  it("merged [spec-ring#R1.S3]", () => {
    const h = ring(base({ plan: plan({ done: 3, implemented: true, review: { url: "u", state: "MERGED", comments: [] } }), verify: { proved: 4, failing: 0, unverified: 0, at: "2026-11-20T10:00:00Z" } }), "review");
    expect(["spec", "plan", "build", "verify", "review"].map((s) => segState(h, s))).toEqual(["done", "done", "done", "done", "done"]);
    expect(h).toMatch(/class="loop-pct">100<small>/);
    expect(h).toContain("Merged");
  });
});

describe("stages from the ring", () => {
  it("open Verify [spec-ring#R2.S1]", () => {
    const built = base({ plan: plan({ done: 3, implemented: true }) });
    expect(ring(built)).toMatch(/<a class="loop-link [a-z]+" data-stage="verify" href="\/work\/link-report\/verify"/);
    const onVerify = ring(built, "verify");
    expect(onVerify).toMatch(/data-stage="verify"[\s\S]*?class="loop-open"/);
    expect(onVerify).not.toMatch(/data-stage="spec"[\s\S]*?class="loop-open"[\s\S]*?data-stage="plan"/);
  });

  it("not yet [spec-ring#R2.S2]", () => {
    const h = ring(base({ plan: plan({ status: "draft" }) }));
    expect(h).toMatch(/<div class="loop-link [a-z]+" data-stage="build" aria-disabled="true"/);
    expect(h).not.toContain('data-stage="build" href=');
  });
});

describe("opening where the work is", () => {
  it("built, not verified [spec-ring#R3.S1]", () => {
    expect(currentStageHref(base({ plan: plan({ done: 3, implemented: true }) }), spec)).toBe("/work/link-report/verify");
  });
  it("still a draft [spec-ring#R3.S2]", () => {
    expect(currentStageHref(base({ status: "writing" }), { status: "draft" } as Spec)).toBe("/work/link-report/spec");
  });
});

import { SpecLink } from "../src/components/Sidebar.tsx";
describe("a mini ring per spec", () => {
  it("in the list [spec-ring#R5.S1]", () => {
    const h = renderToStaticMarkup(createElement(SpecLink, { s: building, active: false }));
    expect(h).toContain('class="mini-line"');
    expect(h).not.toContain("status-icon");
    const segs = [...h.matchAll(/class="mini-seg ([a-z]+)"/g)].map((m) => m[1]);
    expect(segs.slice(0, 3)).toEqual(["done", "done", "running"]);
  });
});

import { progressOf } from "../src/progress.ts";
describe("stale is never shown as done", () => {
  it("everything agrees [spec-ring#R4.S4]", () => {
    const s = base({ plan: plan({ done: 3, implemented: true, review: { url: "u", state: "MERGED", comments: [] } }), verify: { proved: 4, failing: 0, unverified: 0, at: "2026-11-20T10:00:00Z" },
      loop: { stale: [false, true, true, true, false], round: 2 } });
    const h = ring(s);
    for (const name of ["plan", "build", "verify"]) {
      const i = h.indexOf(`data-stage="${name}"`), seg = h.slice(i, h.indexOf("</a>", i));
      expect(seg).toContain('class="loop-seg stale"');
      expect(seg).toContain("Stale · spec changed");
    }
    expect(progressOf(s, spec).centre).toBe("Plan · Stale · spec changed");
    expect(progressOf(s, spec).current).toBe("plan");
  });
});

describe("running never shows behind a stale stage", () => {
  it("running behind a stale stage [spec-ring#R1.S4]", () => {
    const s = base({ plan: plan({ done: 7, tasks: 8 }), loop: { stale: [false, true, true, true, false], round: 2 },
      activity: { stage: "build", label: "Building", step: "T8 of 8", since: "2026-11-20T10:00:00Z", paused: false, asking: false } });
    const r = progressOf(s, spec);
    expect(r.current).toBe("plan");
    expect(r.centre).toBe("Plan · Stale · spec changed");
    expect(r.stages[2]!.state).not.toBe("running");
  });
});

describe("a running stage always shows", () => {
  it("just started [spec-ring#R1.S5]", () => {
    const planning = progressOf(base({ activity: { stage: "plan", label: "Planning", step: "designing", since: "2026-11-21T10:00:00Z", paused: false, asking: false } }), spec);
    expect(planning.stages[1]!.state).toBe("running");
    expect(planning.stages[1]!.fill).toBeGreaterThan(0);
    const building = progressOf(base({ plan: plan({ done: 0 }), activity: { stage: "build", label: "Building", step: "T1 of 3", since: "2026-11-21T10:00:00Z", paused: false, asking: false } }), spec);
    expect(building.stages[2]!.state).toBe("running");
    expect(building.stages[2]!.fill).toBeGreaterThan(0);
  });
});

import { openCurrentHref } from "../src/progress.ts";
describe("switching specs", () => {
  it("switching specs [spec-ring#R3.S3]", () => {
    const a = base({ id: "link-report", plan: plan({ done: 3, implemented: true }) });
    expect(openCurrentHref("/work/bulk-export", a, spec)).toBeNull();   // link-report still loaded: wait
    expect(openCurrentHref("/work/link-report", a, spec)).toBe("/work/link-report/verify");
    expect(openCurrentHref("/work/link-report/plan/002-link-report", a, spec)).toBeNull();   // a stage address stays
  });

  it("the row: line beside the id and the status line [spec-ring#R5.S1]", () => {
    const h = renderToStaticMarkup(createElement(SpecLink, { s: building, active: false }));
    expect(h).toMatch(/^<a [^>]*class="spec-link[^"]*"[^>]*><span class="mini-line"/);
  });
});

describe("summary under the line; status lines flush left", () => {
  const css = allCss();
  const last = (sel: string) => [...css.matchAll(new RegExp(`^${sel.replace(/[.>]/g, (c) => `\\${c}`)} \\{([^}]*)\\}`, "gm"))].pop()?.[1] ?? "";
  it("the summary sits under the line [spec-ring#R1.S1]", () => {
    expect(last(".loop-line")).toContain("flex-direction: column");
  });
  it("the status line starts at the row's left edge [spec-ring#R5.S1]", () => {
    expect(last(".spec-link > .stage-line")).toContain("grid-column: 1 / -1");
  });
});

describe("the round", () => {
  it("round last, plain [spec-ring#R1.S1]", () => {
    const h = ring(base({ plan: plan({ done: 1 }), loop: { stale: [false, false, false, false, false], round: 2 } }));
    const pct = h.indexOf('class="loop-pct"'), now = h.indexOf('class="loop-now'), round = h.indexOf(">Round 2<");
    expect(pct).toBeGreaterThan(-1);
    expect(round).toBeGreaterThan(now);
    expect(now).toBeGreaterThan(pct);
    expect(h).toMatch(/class="loop-now loop-round">Round 2</);
  });
});

describe("stations on the line", () => {
  const rule = (css: string, sel: string) => [...css.matchAll(new RegExp(`(?:^|[},]\\s*)${sel.replace(/[.]/g, "\\.")}(?:::after)? \\{([^}]*)\\}`, "gm"))].map((m) => m[1]).join(" ");
  const node = (h: string, stage: string) => new RegExp(`data-stage="${stage}"[\\s\\S]*?class="loop-node ([a-z]+)"`).exec(h)?.[1];
  it("flowing while running [spec-ring#R1.S6]", () => {
    const h = ring(building, "build");
    expect(["spec", "plan", "build", "verify"].map((s) => node(h, s))).toEqual(["done", "done", "running", "idle"]);
    expect(segState(h, "build")).toBe("running");   // the track into Build is partly filled
    const css = allCss();
    expect(rule(css, ".loop-node.running")).toMatch(/background: var\(--info\)/);
    expect(css).toMatch(/\.loop-node\.running::after, \.loop-node\.waiting::after \{[^}]*animation:[^;]*loop-ripple/);
    expect(css).toMatch(/@keyframes loop-ripple/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*\.loop-node\.running::after[^}]*animation: none/);
    expect(css).toMatch(/\.loop-node\.done::before \{[^}]*content: "✓"/);
  });
  it("no gaps on the track [spec-ring#R1.S8]", () => {
    expect(rule(allCss(), ".loop-link:first-child")).toMatch(/width: 18px/);   // just its station, so the track starts right after it
  });
  it("waiting flows too [spec-ring#R1.S7]", () => {
    const h = ring(base({ status: "needs_you" }), "spec", 1);
    expect(node(h, "spec")).toBe("waiting");
    expect(rule(allCss(), ".loop-node.waiting")).toMatch(/background: var\(--accent\)/);
    expect(h).toMatch(/class="btn primary small"[^>]*>Decide/);
    expect(rule(allCss(), "a.btn")).toMatch(/text-decoration: none/);
  });
});

describe("review on the line", () => {
  const node = (h: string, stage: string) => new RegExp(`data-stage="${stage}"[\\s\\S]*?class="loop-node ([a-z]+)"`).exec(h)?.[1];
  const inReview = (comments: object[]) => base({ plan: plan({ done: 3, implemented: true, review: { url: "u", state: "OPEN", comments } }), verify: { proved: 4, failing: 0, unverified: 0, at: "2026-11-20T10:00:00Z" } });
  it("in review [spec-ring#R1.S9]", () => {
    const h = ring(inReview([]), "review");
    expect(node(h, "review")).toBe("running");
    expect(h).toContain("Review · Waiting for reviewers");
  });
  it("a comment to handle [spec-ring#R1.S10]", () => {
    const s = inReview([{ author: "jdoe", path: "a.ts", line: "3", body: "why?", handled: null }, { author: "jdoe", path: "", line: "", body: "done", handled: "answered" }]);
    const h = ring(s, "review");
    expect(node(h, "review")).toBe("waiting");
    expect(h).toContain("Review · 1 comment to handle");
    expect(progressOf(s, spec).centre).toBe("Review · 1 comment to handle");   // the list reads the same (spec-row R1)
  });
});
