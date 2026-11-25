import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, cpSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceState } from "../server/workspace.ts";
import { readState, cksum } from "../server/state.ts";
import { progressOf } from "../src/progress.ts";
import { activityText, STATUS_META } from "../src/status.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const FIXTURE = here("../../../tests/fixtures/workspace");
const STATE_SH = here("../../../plugins/factree/scripts/state.sh");
// A snapshot of this repo's own workspace, when it is there (copied, never written to).
const REAL = process.env.FACTREE_SNAPSHOT ?? "/Users/abhishek/Documents/work/factree-dev/factree/.factree";
const NOW = Date.now();
const at = (min: number) => new Date(NOW - min * 60000).toISOString();

let root: string;
const sh = (...args: string[]) => execFileSync("bash", [STATE_SH, ...args], { env: { ...process.env, FACTREE_HOME: root }, encoding: "utf8" });
const statePath = () => join(root, "state", "link-report.json");
/** Set keys of link-report's state file, keeping the line format state.sh writes; undefined removes the key. */
function setState(keys: Record<string, string | undefined>) {
  const kv = new Map<string, string>();
  for (const l of readFileSync(statePath(), "utf8").split("\n")) { const m = /^ {2}"([^"]*)": "([^"]*)",?$/.exec(l); if (m) kv.set(m[1]!, m[2]!); }
  for (const [k, v] of Object.entries(keys)) if (v === undefined) kv.delete(k); else kv.set(k, v);
  const lines = [...kv].map(([k, v]) => `  "${k}": "${v}"`);
  writeFileSync(statePath(), `{\n${lines.join(",\n")}\n}\n`);
}
const log = (lines: object[]) => writeFileSync(join(root, "events.jsonl"), readFileSync(join(FIXTURE, "events.jsonl"), "utf8") + lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
const summary = (now = NOW) => workspaceState(root, "John Doe", now).specs.find((s) => s.id === "link-report")!;
const specFile = () => join(root, "specs", "link-report.md");
const editSpec = (f: (t: string) => string) => writeFileSync(specFile(), f(readFileSync(specFile(), "utf8")));
const shStale = () => sh("link-report", "stale").split("\n").filter(Boolean).sort();
const tsStale = () => Object.entries(readState(root, "link-report")!.works).filter(([, w]) => w.stale).map(([k]) => k).sort();

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-state-")), ".factree");
  cpSync(FIXTURE, root, { recursive: true });
});

describe("cksum", () => {
  it("matches the cksum command", () => {
    for (const s of ["", "a", "### Requirement: R1 Admin-only access", "é ünïcode ✓", "x".repeat(70000)]) {
      const out = execFileSync("cksum", { input: Buffer.from(s, "utf8"), encoding: "utf8" }).trim().split(/\s+/);
      expect(`${cksum(Buffer.from(s, "utf8"))} ${Buffer.byteLength(s)}`).toBe(`${out[0]} ${out[1]}`);
    }
  });
});

describe("staleness as state.sh works it out [status-state#R4]", () => {
  beforeEach(() => { sh("migrate"); });
  const cases: [string, () => void][] = [
    ["as migrated", () => {}],
    ["a word in Purpose", () => editSpec((t) => t.replace("## Purpose\n", "## Purpose\nTypo fixed.\n"))],
    ["an uncovered requirement changed", () => editSpec((t) => t.replace("### Requirement: R1 Admin-only access", "### Requirement: R1 Admin-only access now"))],
    ["a covered scenario added", () => editSpec((t) => t.replace("### Requirement: R6", "#### Scenario: S9 More\n- **GIVEN** x\n\n### Requirement: R6"))],
    ["CRLF and extra spaces", () => editSpec((t) => t.replace(/ /g, "  ").replace(/\n/g, "\r\n"))],
    ["a Source: line changed", () => editSpec((t) => t.replace(/^Source: .*$/m, "Source: elsewhere"))],
    ["a covered requirement retired", () => editSpec((t) => t.replace("retired: []", "retired: [R6]"))],
    ["a covered requirement retired after merge [status-state#D6]", () => { editSpec((t) => t.replace("retired: []", "retired: [R6]")); setState({ "review.002-link-report": "merged", "prs.002-link-report": "7" }); }],
    ["a covered requirement changed after merge", () => { editSpec((t) => t.replace("### Requirement: R6 One export at a time", "### Requirement: R6 Two exports")); setState({ "review.002-link-report": "merged" }); }],
  ];
  for (const [name, change] of cases) it(name, () => { change(); expect(tsStale()).toEqual(shStale()); });
});

describe("the UI reads the state", () => {
  it("a state file building 3/5 reads that [status-state#R1.S1]", () => {
    sh("migrate");
    setState({ "plan.002-link-report": "building", "tasks.002-link-report": "T1 T2 T3", "total.002-link-report": "5" });
    const st = readState(root, "link-report")!;
    expect(st).toMatchObject({ spec: "approved", plan: "002-link-report" });
    expect(st.works["002-link-report"]).toMatchObject({ stage: "building", done: 3, total: 5, review: "none", stale: false });
    expect(st.works["002-link-report"]!.hold).toBeUndefined();
    const s = summary();
    expect(s.status).toBe("approved");
    expect(s.plan).toMatchObject({ work: "002-link-report", status: "approved", done: 3, tasks: 5, implemented: false, review: null });
    expect(s.plan!.hold).toBeUndefined();
    expect(s.loop!.stale.every((x) => !x)).toBe(true);
  });

  it("no state folder reads as today [status-state#R1.S2]", () => {
    expect(readState(root, "link-report")).toBeNull();
    const s = summary();
    expect(s.status).toBe("approved");
    expect(s.plan).toMatchObject({ work: "002-link-report", status: "approved", done: 0, tasks: 2 });
  });

  it("re-edit with a question reads needs you [status-state#R3.S2]", () => {
    sh("migrate");
    sh("link-report", "edit");
    log([{ ts: at(2), type: "spec.step", spec: "link-report", data: { step: "questions" } },
      { ts: at(1), type: "question.asked", spec: "link-report", data: { n: 1, text: "Which teams?", why: "scope", proposal: "" } }]);
    expect(readState(root, "link-report")!.spec).toBe("writing");
    expect(summary().status).toBe("needs_you");
  });

  it("a recorded writing stage with no activity for 10 minutes reads Writing (paused) [status-state#D5]", () => {
    sh("migrate");
    setState({ spec: "writing" });
    log([{ ts: at(30), type: "spec.step", spec: "link-report", data: { step: "writing" } }]);
    expect(STATUS_META[summary().status].label).toBe("Writing (paused)");
    log([{ ts: at(2), type: "spec.step", spec: "link-report", data: { step: "writing" } }]);
    expect(summary().status).toBe("writing");
  });

  it("building 3/5 with T4 running reads 3/5 merged and Building T4 [status-state#R5.S1]", () => {
    sh("migrate");
    setState({ "plan.002-link-report": "building", "tasks.002-link-report": "T1 T2 T3", "total.002-link-report": "5" });
    log([{ ts: at(1), type: "agent.started", work: "002-link-report", data: { task: "T4", role: "build" } }]);
    const s = summary();
    const p = progressOf(s, null);
    expect(p.stages.find((x) => x.key === "build")!.sub).toBe("3/5 merged");
    expect(activityText(s.activity!)).toBe("Building… T4");
  });

  it("approved state and a later spec.step reads approved [status-state#R5.S2]", () => {
    sh("migrate");
    editSpec((t) => t.replace(/^status: approved$/m, "status: draft"));
    log([{ ts: at(1), type: "spec.step", spec: "link-report", data: { step: "checking" } }]);
    expect(summary().status).toBe("approved");
  });

  it("a state with no spec stage, empty or {}, reads as today [status-state#R1.S2]", () => {
    const today = JSON.stringify(summary());
    for (const text of ["", "{}\n", "{\n  \"plan\": \"002-link-report\""]) {
      mkdirSync(join(root, "state"), { recursive: true });
      writeFileSync(statePath(), text);
      expect(readState(root, "link-report")).toBeNull();
      expect(JSON.stringify(summary())).toBe(today);
    }
  });

  it("an unreadable state file reads as today", () => {
    const today = JSON.stringify(summary());
    sh("migrate");
    chmodSync(statePath(), 0);
    try {
      expect(readState(root, "link-report")).toBeNull();
      expect(JSON.stringify(summary())).toBe(today);
    } finally { chmodSync(statePath(), 0o644); }
  });

  it("a recorded draft stays draft whatever runs [status-state#R5]", () => {
    sh("migrate");
    setState({ spec: "draft" });
    log([{ ts: at(2), type: "spec.step", spec: "link-report", data: { step: "questions" } },
      { ts: at(1), type: "question.asked", spec: "link-report", data: { n: 1, text: "Which teams?", why: "scope", proposal: "" } }]);
    expect(summary().status).toBe("draft");
  });

  it("a hold comes from the state", () => {
    sh("migrate");
    setState({ "hold.002-link-report": "review acceptance run", "hold_since.002-link-report": "2026-11-24T10:00:00Z" });
    expect(summary().plan!.hold).toEqual({ stage: "review", reason: "acceptance run", since: "2026-11-24T10:00:00Z" });
  });
});

/** What a user sees of each spec: its status label, percentage, centre text, and each stage done, stale and its words. */
function seen(): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of workspaceState(root, "", NOW).specs) {
    const p = progressOf(s, null);
    out.set(s.id, [STATUS_META[s.status].label, `${p.pct}%`, p.centre, ...p.stages.map((st) =>
      `${st.key}:${st.state === "stale" ? "stale" : st.fill >= 1 ? "done" : "-"}:${st.sub}`)].join(" | "));
  }
  return out;
}
/** Specs that read differently from the old reader once migrated; `change` alters the migrated workspace first. */
function compare(src: string, change: () => void = () => {}): string[] {
  rmSync(root, { recursive: true, force: true });
  cpSync(src, root, { recursive: true });
  rmSync(join(root, "state"), { recursive: true, force: true });
  const old = seen();
  sh("migrate");
  change();
  const now = seen();
  const diff: string[] = [];
  for (const [id, o] of old) if (now.get(id) !== o) diff.push(`${id}: ${o} → ${now.get(id)}`);
  return diff;
}

describe("old and new readers agree [status-state#R6.S3]", () => {
  it("old and new readers agree on every spec of the migrated fixture and repo snapshot except releases and build-status [status-state#R6.S3]", () => {
    expect(compare(FIXTURE)).toEqual([]);
    if (!existsSync(join(REAL, "specs"))) return;
    const diff = compare(REAL);
    if (diff.length) console.log(diff.join("\n"));
    expect(diff.filter((d) => !/^(releases|build-status):/.test(d))).toEqual([]);
  });

  it("the comparison reports a spec whose state reads differently", () => {
    expect(compare(FIXTURE, () => setState({ "tasks.002-link-report": "T1" }))).toEqual([expect.stringMatching(/^link-report: /)]);
  });
});
