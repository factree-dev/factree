import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { workspaceState } from "../server/workspace.ts";
import { applyDecision } from "../server/decisions.ts";
import { Inbox, inboxKey } from "../src/components/Inbox.tsx";

const example = readFileSync(fileURLToPath(new URL("../../../tests/fixtures/workspace/specs/link-report.md", import.meta.url)), "utf8");
const NOW = Date.parse("2026-11-18T12:00:00Z");
let root: string;
const log = (lines: object[]) => writeFileSync(join(root, "events.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
const proposed = (min: number) => ({ ts: new Date(NOW - min * 60000).toISOString(), type: "lesson.proposed", spec: "link-report",
  data: { key: "pref:approve_plans", text: "Approve plans with nothing new automatically?", file: "preferences.md", change: "approve_plans: nothing-new", evidence: ["a", "b", "c"] } });
const cards = () => workspaceState(root, "John Doe", NOW).decisions;
const decide = (body: object) => applyDecision(root, "John Doe", body, cards(), "2026-11-18");

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs", "link-report.md"), example);
});

describe("lessons in the companion", () => {
  it("a proposed lesson is a card on its spec [self-improving#R7.S1]", () => {
    log([proposed(10)]);
    const c = cards().filter((x) => x.kind === "lesson");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ spec: "link-report", title: "Approve plans with nothing new automatically?", lesson: { key: "pref:approve_plans", file: "preferences.md", change: "approve_plans: nothing-new", evidence: 3 } });
    const h = renderToStaticMarkup(createElement(Inbox, { cards: c, onDecide: async () => null }));
    expect(h).toContain("approve_plans: nothing-new");
    expect(h).toContain(".factree/preferences.md");
    expect(h).toContain("Approve <kbd>Enter</kbd>");
    expect(h).toContain("Not this <kbd>x</kbd>");
  });

  it("approving logs lesson.approved via the companion [self-improving#R8.S1]", () => {
    log([proposed(10)]);
    decide({ kind: "approve-lesson", spec: "link-report", key: "pref:approve_plans" });
    const last = readFileSync(join(root, "events.jsonl"), "utf8").trim().split("\n").pop()!;
    expect(last).toMatch(/"type":"lesson.approved".*"key":"pref:approve_plans".*"via":"companion"/);
    expect(cards().filter((x) => x.kind === "lesson")).toHaveLength(0);
  });

  it("rejecting logs lesson.rejected; x is the key", () => {
    log([proposed(10)]);
    const c = cards().filter((x) => x.kind === "lesson");
    expect(inboxKey("x", 0, c)).toEqual({ t: "decide", body: { kind: "reject-lesson", spec: "link-report", key: "pref:approve_plans" } });
    decide({ kind: "reject-lesson", spec: "link-report", key: "pref:approve_plans" });
    expect(readFileSync(join(root, "events.jsonl"), "utf8")).toMatch(/"type":"lesson.rejected"/);
  });

  it("one card per lesson", () => {
    log([proposed(20), proposed(10)]);
    expect(cards().filter((x) => x.kind === "lesson")).toHaveLength(1);
  });

  it("a lesson not waiting is refused", () => {
    log([]);
    expect(() => decide({ kind: "approve-lesson", spec: "link-report", key: "pref:approve_plans" })).toThrow("isn't waiting");
  });
});
