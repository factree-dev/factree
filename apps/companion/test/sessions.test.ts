import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { specDetail, sessionsFor } from "../server/workspace.ts";
import { SpecView } from "../src/components/SpecView.tsx";
import { PlanView } from "../src/components/PlanView.tsx";

const exampleSpec = fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url));
const A = "aaaa1111-0000-0000-0000-000000000000", B = "bbbb2222-0000-0000-0000-000000000000", C = "cccc3333-0000-0000-0000-000000000000";
let root: string;
function events(lines: object[]) { writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n"); }
const ev = (ts: string, session: string | undefined, extra: object) => ({ ts: `2026-11-16T${ts}:00Z`, type: "spec.updated", data: {}, ...(session ? { session } : {}), ...extra });

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  copyFileSync(exampleSpec, join(root, "specs", "link-report.md"));
});

describe("sessions", () => {
  it("shows the latest session in the spec header [spec-sessions#R2.S1]", () => {
    events([ev("09:00", A, { spec: "link-report" }), ev("11:00", B, { spec: "link-report" })]);
    const d = specDetail(root, "link-report")!;
    expect(d.sessions.map((s) => s.id)).toEqual([B, A]);
    const html = renderToStaticMarkup(createElement(SpecView, { detail: d, user: "", focus: null }));
    expect(html).toContain(`title="claude --resume ${B}">Copy resume</button>`);
    expect(html).not.toContain("bbbb2222</code>");   // the button alone, no short id
  });

  it("shows nothing without a recorded session [spec-sessions#R2.S2]", () => {
    events([ev("09:00", undefined, { spec: "link-report" })]);
    const d = specDetail(root, "link-report")!;
    expect(d.sessions).toEqual([]);
    expect(renderToStaticMarkup(createElement(SpecView, { detail: d, user: "", focus: null }))).not.toContain("session-chip");
  });

  it("shows the plan's own session in the plan header [spec-sessions#R3.S1]", () => {
    mkdirSync(join(root, "work", "002-link-report", "backend"), { recursive: true });
    writeFileSync(join(root, "work", "002-link-report", "plan.md"), "---\nwork: 002-link-report\nspec: link-report\nscope: [R5]\nverticals: [backend]\nstatus: draft\n---\n# Plan\n");
    events([ev("09:00", A, { spec: "link-report" }), { ts: "2026-11-16T10:00:00Z", type: "plan.created", work: "002-link-report", session: C, data: {} }]);
    const d = specDetail(root, "link-report")!;
    expect(d.plans[0]!.sessions.map((s) => s.id)).toEqual([C]);
    const html = renderToStaticMarkup(createElement(PlanView, { detail: d, work: null, tab: null, focus: null }));
    expect(html).toContain("--resume cccc3333");
    expect(html).not.toContain("--resume aaaa1111");
  });

  it("lists every session in Activity, newest first [spec-sessions#R4.S1]", () => {
    events([ev("09:00", A, { spec: "link-report" }), ev("10:00", B, { spec: "link-report" }), ev("11:00", B, { spec: "link-report" })]);
    expect(sessionsFor(specDetail(root, "link-report")!.activity.slice().reverse(), () => true)).toEqual([
      { id: B, last: "2026-11-16T11:00:00Z", state: "unknown" }, { id: A, last: "2026-11-16T09:00:00Z", state: "unknown" },
    ]);
    const html = renderToStaticMarkup(createElement(SpecView, { detail: specDetail(root, "link-report")!, user: "", focus: null, tab: "activity" }));
    expect(html.indexOf("--resume bbbb2222")).toBeLessThan(html.indexOf("--resume aaaa1111"));
  });
});

describe("session state in the header", () => {
  const S = "611a0794-d356-4c30-a967-cc8cb6f9f85a";
  function sessionFile(state: string) {
    mkdirSync(join(root, "sessions"), { recursive: true });
    const now = new Date().toISOString();
    writeFileSync(join(root, "sessions", `${S}.json`), JSON.stringify({ id: S, state, message: "", cwd: "/x", transcript: "", started: now, updated: now }));
  }
  const header = () => {
    events([{ ts: new Date().toISOString(), type: "spec.updated", spec: "link-report", session: S, data: {} }]);
    return renderToStaticMarkup(createElement(SpecView, { detail: specDetail(root, "link-report")!, user: "", focus: null }));
  };

  it("working: no resume button [companion-handoff#R2.S1]", () => {
    sessionFile("working");
    const h = header();
    expect(h).toContain("Claude is working");
    expect(h).not.toContain("Copy resume");
  });

  it("your turn: names the session, no button [companion-handoff#R2.S2]", () => {
    sessionFile("your_turn");
    const h = header();
    expect(h).toContain("Your turn in session <code>611a0794</code>");
    expect(h).not.toContain("Copy resume");
  });

  it("ended: offers resume [companion-handoff#R2.S3]", () => {
    sessionFile("ended");
    expect(header()).toContain("Copy resume");
  });

  it("no session file: offers resume [companion-handoff#R2.S4]", () => {
    const h = header();
    expect(specDetail(root, "link-report")!.sessions[0]!.state).toBe("unknown");
    expect(h).toContain("Copy resume");
  });
});

import { buildChanged } from "../src/api.ts";
describe("pages keep up with the companion", () => {
  it("reloads when the server runs a new build [companion-handoff#R3.S1]", () => {
    expect(buildChanged("a1b2c3d4e5f6", "0f9e8d7c6b5a")).toBe(true);
  });
  it("doesn't reload on a restart with the same build [companion-handoff#R3.S2]", () => {
    expect(buildChanged("a1b2c3d4e5f6", "a1b2c3d4e5f6")).toBe(false);
    expect(buildChanged(null, "a1b2c3d4e5f6")).toBe(false);   // first hello: just remember it
    expect(buildChanged("a1b2c3d4e5f6", "")).toBe(false);     // an older server sends no build
  });
});
