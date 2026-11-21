import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceState, specDetail, statusSignature } from "../server/workspace.ts";

const exampleSpec = fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url));
const NOW = Date.parse("2026-11-16T10:00:00Z");
const at = (min: number) => new Date(NOW - min * 60000).toISOString();

let root: string;
let repo: string;
function events(lines: object[]) {
  writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}
function session(id: string, state: string, minutesAgo: number) {
  mkdirSync(join(root, "sessions"), { recursive: true });
  writeFileSync(join(root, "sessions", `${id}.json`), JSON.stringify({ id, state, message: "", cwd: repo, transcript: "", started: at(30), updated: at(minutesAgo) }));
}
// A copy of the example spec saved as <id>.md with the given status.
function specFile(id: string, status: string) {
  const text = readFileSync(exampleSpec, "utf8").replace(/^id: .*$/m, `id: ${id}`).replace(/^status: .*$/m, `status: ${status}`);
  writeFileSync(join(root, "specs", `${id}.md`), text);
}
const step = (spec: string, min: number, data: object = { step: "writing" }) => ({ ts: at(min), type: "spec.step", spec, cwd: repo, data });
const statusOf = (id: string, now = NOW) => workspaceState(root, "John Doe", now).specs.find((s) => s.id === id);

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), "factree-"));
  root = join(base, ".factree");
  repo = join(base, "web");
  mkdirSync(join(root, "specs"), { recursive: true });
  mkdirSync(repo);
  copyFileSync(exampleSpec, join(root, "specs", "link-report.md"));
});

describe("workspaceState", () => {
  it("lists specs from files with counts", () => {
    const s = workspaceState(root, "John Doe", NOW);
    expect(s.specs).toHaveLength(1);
    expect(s.specs[0]).toMatchObject({ id: "link-report", status: "approved", requirements: 6, scenarios: 13, openQuestions: 1, hasFile: true });
    expect(s.specs[0]!.live.open).toBe(false);
    expect(s.waiting).toEqual([]);   // Q2 is owned by Priya, not John Doe
  });

  it("shows a spec being written before its file exists, with the pending question", () => {
    events([
      { ts: at(10), type: "spec.step", spec: "export-button", cwd: repo, data: { step: "gaps", title: "Export button on the team page", sources: ["JIRA-517"], note: "3 asks" } },
      { ts: at(8), type: "spec.step", spec: "export-button", cwd: repo, data: { step: "questions", note: "about 3" } },
      { ts: at(7), type: "question.asked", spec: "export-button", cwd: repo, data: { n: 1, text: "Who uses the export?", why: "decides columns", proposal: "" } },
      { ts: at(6), type: "question.answered", spec: "export-button", cwd: repo, data: { n: 1, answer: "team admins" } },
      { ts: at(2), type: "question.asked", spec: "export-button", cwd: repo, data: { n: 2, text: "Hidden or disabled for non-admins?", why: "changes the page", proposal: "Hide it, like settings" } },
    ]);
    session("sess-1", "your_turn", 2);
    const s = workspaceState(root, "John Doe", NOW);
    const w = s.specs.find((x) => x.id === "export-button")!;
    expect(w).toMatchObject({ status: "needs_you", hasFile: false, title: "Export button on the team page" });
    expect(w.live.step).toBe("questions");
    expect(w.live.pendingQuestion).toMatchObject({ n: 2, text: "Hidden or disabled for non-admins?", proposal: "Hide it, like settings" });
    expect(w.live.answered.map((q) => q.answer)).toEqual(["team admins"]);
    expect(w.live.session?.id).toBe("sess-1");
    expect(s.specs[0]!.id).toBe("export-button");   // needs you sorts first
    expect(s.waiting).toEqual([{ kind: "question", spec: "export-button", text: "Hidden or disabled for non-admins?", sessionId: "sess-1" }]);
  });

  it("stops treating a spec as being written once it's approved", () => {
    events([
      { ts: at(20), type: "spec.step", spec: "link-report", cwd: repo, data: { step: "writing" } },
      { ts: at(5), type: "spec.approved", spec: "link-report", cwd: repo, data: { by: "John Doe" } },
    ]);
    const s = workspaceState(root, "John Doe", NOW);
    expect(s.specs[0]!.live.open).toBe(false);
    expect(s.specs[0]!.status).toBe("approved");
  });

  it("hides an abandoned run with no file [spec-status#R5.S3]", () => {
    events([{ ts: at(7 * 60), type: "spec.step", spec: "ghost", cwd: repo, data: { step: "gaps", title: "Ghost" } }]);
    expect(workspaceState(root, "John Doe", NOW).specs.map((s) => s.id)).toEqual(["link-report"]);
  });

  it("lists open questions owned by the current user as waiting", () => {
    const s = workspaceState(root, "Priya Shah", NOW);
    expect(s.waiting).toEqual([{ kind: "owned-question", spec: "link-report", text: "Q2 Should exports leave out fields the admin cannot see under field-level permissions?" }]);
  });

  it("ignores half-written event lines", () => {
    writeFileSync(join(root, "events.jsonl"), '{"ts":"x","type":"spec.step"\n');
    expect(() => workspaceState(root, "A", NOW)).not.toThrow();
  });
});

describe("display status", () => {
  it("shows one status per spec [spec-status#R1.S1]", () => {
    specFile("a-draft", "draft");
    specFile("b-live", "live");
    events([step("w-new", 2, { step: "gaps", title: "New" })]);
    const s = workspaceState(root, "John Doe", NOW);
    expect(Object.fromEntries(s.specs.map((x) => [x.id, x.status]))).toEqual({
      "w-new": "writing", "a-draft": "draft", "link-report": "approved", "b-live": "live",
    });
  });

  it("never shows a stalled status [spec-status#R1.S2]", () => {
    specFile("old", "draft");
    expect(statusOf("old", NOW + 40 * 24 * 3600 * 1000)?.status).toBe("draft");
  });

  it("is writing after a recent step [spec-status#R3.S1]", () => {
    specFile("x", "draft");
    events([step("x", 2)]);
    expect(statusOf("x")?.status).toBe("writing");
  });

  it("is writing while the session works [spec-status#R3.S2]", () => {
    specFile("x", "draft");
    events([step("x", 25)]);
    session("s1", "working", 0);
    expect(statusOf("x")?.status).toBe("writing");
  });

  it("lists a new run before its file [spec-status#R3.S3]", () => {
    events([step("x", 1, { step: "gaps", title: "Brand new" })]);
    expect(statusOf("x")).toMatchObject({ status: "writing", hasFile: false, title: "Brand new" });
  });

  it("pauses when quiet and idle [spec-status#R4.S1]", () => {
    specFile("x", "draft");
    events([step("x", 25)]);
    session("s1", "idle", 25);
    expect(statusOf("x")).toMatchObject({ status: "draft", lastMoved: at(25) });
    expect(statusOf("x")?.live.open).toBe(true);
  });

  it("pauses with no session [spec-status#R4.S2]", () => {
    specFile("x", "draft");
    events([step("x", 180)]);
    expect(statusOf("x")).toMatchObject({ status: "draft", lastMoved: at(180) });
  });

  it("keeps a paused run without a file listed [spec-status#R4.S3]", () => {
    events([step("x", 30, { step: "gaps", title: "Paused" })]);
    session("s1", "idle", 30);
    expect(statusOf("x")).toMatchObject({ status: "draft", hasFile: false });
  });

  it("resumes writing on a new step [spec-status#R4.S4]", () => {
    specFile("x", "draft");
    events([step("x", 30), step("x", 0)]);
    session("s1", "idle", 30);
    expect(statusOf("x")?.status).toBe("writing");
  });

  it("keeps the file status for a paused edit [spec-status#R4.S5]", () => {
    events([step("link-report", 40)]);
    session("s1", "idle", 40);
    expect(statusOf("link-report")).toMatchObject({ status: "approved", lastMoved: at(40) });
    expect(statusOf("link-report")?.live.open).toBe(true);
  });

  it("shows approved once approval is logged [spec-status#R5.S1]", () => {
    events([step("link-report", 3, { step: "approval" }), { ts: at(0), type: "spec.approved", spec: "link-report", cwd: repo, data: { by: "John Doe" } }]);
    expect(statusOf("link-report")).toMatchObject({ status: "approved" });
    expect(statusOf("link-report")?.live.open).toBe(false);
  });

  it("shows live from the file [spec-status#R5.S2]", () => {
    specFile("shipped", "live");
    expect(statusOf("shipped", NOW + 30 * 24 * 3600 * 1000)?.status).toBe("live");
  });

  it("keeps a run open at 5h50 [spec-status#R10.S1]", () => {
    specFile("x", "draft");
    events([step("x", 350)]);
    expect(statusOf("x")?.live.open).toBe(true);
  });

  it("reopens on a late answer [spec-status#R10.S2]", () => {
    specFile("x", "draft");
    events([
      step("x", 7 * 60 + 5, { step: "questions" }),
      { ts: at(7 * 60), type: "question.asked", spec: "x", cwd: repo, data: { n: 1, text: "Which?" } },
      { ts: at(1), type: "question.answered", spec: "x", cwd: repo, data: { n: 1, answer: "That one" } },
    ]);
    expect(statusOf("x")).toMatchObject({ status: "writing" });
    expect(statusOf("x")?.live.open).toBe(true);
  });

  const ask = (min: number, n = 1) => ({ ts: at(min), type: "question.asked", spec: "x", cwd: repo, data: { n, text: "Which?" } });
  const answer = (min: number, n = 1) => ({ ts: at(min), type: "question.answered", spec: "x", cwd: repo, data: { n, answer: "That" } });

  it("needs you while a question waits [spec-status#R2.S1]", () => {
    specFile("x", "draft");
    events([step("x", 50, { step: "questions" }), ask(45)]);
    session("s1", "your_turn", 45);
    expect(statusOf("x")?.status).toBe("needs_you");
  });

  it("needs you at approval [spec-status#R2.S2]", () => {
    specFile("x", "draft");
    events([step("x", 5, { step: "approval" })]);
    session("s1", "your_turn", 5);
    expect(statusOf("x")?.status).toBe("needs_you");
  });

  it("goes back to writing once answered [spec-status#R2.S3]", () => {
    specFile("x", "draft");
    events([step("x", 50, { step: "questions" }), ask(45), answer(0)]);
    session("s1", "working", 0);
    expect(statusOf("x")?.status).toBe("writing");
  });

  it("falls to the file status when the run closes [spec-status#R2.S4]", () => {
    specFile("x", "draft");
    events([step("x", 7 * 60 + 5, { step: "questions" }), ask(7 * 60)]);
    expect(statusOf("x")?.status).toBe("draft");
  });

  it("is writing while reworking after approval [spec-status#R2.S5]", () => {
    specFile("x", "draft");
    events([step("x", 3, { step: "approval" })]);
    session("s1", "working", 0);
    expect(statusOf("x")?.status).toBe("writing");
  });

  it("needs you on a permission prompt [spec-status#R2.S6]", () => {
    specFile("x", "draft");
    events([step("x", 1)]);
    session("s1", "waiting", 0);
    expect(statusOf("x")?.status).toBe("needs_you");
  });

  it("needs you at approval with no session [spec-status#R2.S7]", () => {
    specFile("x", "draft");
    events([step("x", 20, { step: "approval" })]);
    expect(statusOf("x")?.status).toBe("needs_you");
  });
});

describe("specDetail", () => {
  it("returns the parsed spec and newest-first activity", () => {
    events([
      { ts: at(30), type: "spec.created", spec: "link-report", data: { requirements: 4 } },
      { ts: at(20), type: "spec.approved", spec: "link-report", data: { by: "John Doe" } },
    ]);
    const d = specDetail(root, "link-report", NOW)!;
    expect(d.spec?.requirements).toHaveLength(6);
    expect(d.activity.map((e) => e.type)).toEqual(["spec.approved", "spec.created"]);
  });

  it("rejects unsafe ids", () => {
    expect(specDetail(root, "../etc", NOW)).toBeNull();
  });
});

describe("statusSignature", () => {
  it("changes the signature when a run goes quiet [spec-status#R7.S2]", () => {
    specFile("x", "draft");
    events([step("x", 9)]);
    session("s1", "idle", 9);
    const before = statusSignature(workspaceState(root, "John Doe", NOW));
    const after = statusSignature(workspaceState(root, "John Doe", NOW + 2 * 60000));
    expect(before).toContain("x:writing");
    expect(after).toContain("x:draft");
    expect(after).not.toBe(before);
  });

  it("keeps the signature when nothing changes", () => {
    expect(statusSignature(workspaceState(root, "John Doe", NOW))).toBe(statusSignature(workspaceState(root, "John Doe", NOW)));
  });
});
