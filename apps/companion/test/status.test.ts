import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { STATUS_META } from "../src/status.ts";
import { SpecLink } from "../src/components/Sidebar.tsx";
import type { FactreeEvent, Live, Session, SpecSummary } from "../shared/types.ts";
import { displayStatus, liveFor } from "../server/live.ts";

const statuses = Object.keys(STATUS_META) as (keyof typeof STATUS_META)[];

describe("STATUS_META", () => {
  it("labels the five statuses [spec-status#R1.S1]", () => {
    expect(statuses.map((s) => STATUS_META[s].label)).toEqual(["Needs you", "Writing", "Draft", "Approved", "Live"]);
  });

  it("gives every status its own icon [spec-status#R6.S1]", () => {
    expect(new Set(statuses.map((s) => STATUS_META[s].icon)).size).toBe(5);
  });

  it("animates only writing and needs you [spec-status#R7.S1]", () => {
    expect(statuses.filter((s) => STATUS_META[s].animated)).toEqual(["needs_you", "writing"]);
  });

  it("keeps draft, approved and live still [spec-status#R7.S3]", () => {
    for (const s of ["draft", "approved", "live"] as const) expect(STATUS_META[s].animated).toBe(false);
  });
});

const summary = (over: Partial<SpecSummary>): SpecSummary => ({
  id: "plan-view", title: "Plan view", status: "approved", lastMoved: null, lastActivity: null, hasFile: true, requirements: 3, scenarios: 9, openQuestions: 0,
  live: { open: false, step: null, stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [], session: null },
  plan: null, verify: null, ...over,
});
const approvedPlan = { work: "003-plan-view", status: "approved" as const, approvedAt: "2026-11-16", others: 0, tasks: 6, done: 0, implemented: false };

describe("the spec row", () => {
  it("stage line is quiet [companion-layout#R4.S5]", () => {
    const html = renderToStaticMarkup(createElement(SpecLink, { s: summary({ plan: approvedPlan }), active: false }));
    expect(html).toContain('class="stage-line"');
    expect(html).toContain("Build · Up next");   // where the spec is now (spec-row R1)
    expect(html).not.toMatch(/class="label /);
  });

  it("list icon matches the header while the stage is Plan [spec-status#R9.S2]", () => {
    const html = renderToStaticMarkup(createElement(SpecLink, { s: summary({ plan: approvedPlan }), active: false }));
    expect(html).toContain("class=\"mini-line\"");   // the row shows the spec's line (spec-ring R5)
  });
});

const liveRun = (over: Partial<Live> = {}): Live => ({
  open: true, step: "checking", stepNote: "", steps: [], pendingQuestion: null, pending: [], answered: [],
  session: { state: "working" } as Live["session"], ...over,
});

describe("displayStatus", () => {
  const now = Date.parse("2026-11-24T22:50:10Z");
  it("approved during checking reads approved [spec-status#R1.S1]", () => {
    expect(displayStatus("approved", liveRun(), "2026-11-24T22:50:02Z", now)).toBe("approved");
  });

  it("a re-edit with the file back to draft reads writing [spec-status#R1.S2]", () => {
    expect(displayStatus("draft", liveRun(), "2026-11-24T22:50:02Z", now)).toBe("writing");
  });
});

describe("displayStatus after an approval", () => {
  const ev = (type: string, ts: string, data: Record<string, unknown> = {}): FactreeEvent =>
    ({ ts, type, spec: "s", data, session: "a", cwd: "/r" } as unknown as FactreeEvent);
  const now = Date.parse("2026-11-24T22:50:10Z");
  const status = (events: FactreeEvent[], state = "working") => {
    const live = liveFor("s", undefined, events, [{ id: "a", state, cwd: "/r" } as Session], now);
    return displayStatus("approved", live, events[events.length - 1]!.ts, now);
  };
  const approved = ev("spec.approved", "2026-11-24T22:50:00Z");

  it("approved file, a question asked after the approval and unanswered reads needs you [spec-status#R1.S2]", () => {
    expect(status([approved, ev("spec.step", "2026-11-24T22:50:02Z", { step: "questions" }), ev("question.asked", "2026-11-24T22:50:03Z", { n: 1, text: "?" })], "waiting")).toBe("needs_you");
  });

  it("approved file, spec.updated after the approval with a writing step reads writing [spec-status#R1.S2]", () => {
    expect(status([approved, ev("spec.updated", "2026-11-24T22:50:02Z"), ev("spec.step", "2026-11-24T22:50:03Z", { step: "writing" })])).toBe("writing");
  });

  it("approved file, only steps after the approval reads approved [spec-status#R1.S1]", () => {
    expect(status([approved, ev("spec.step", "2026-11-24T22:50:02Z", { step: "checking" })])).toBe("approved");
  });
});
