import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { searchIndex } from "../server/search.ts";

const examples = fileURLToPath(new URL("../../../tests/fixtures/workspace", import.meta.url));
let root: string;
beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  cpSync(examples, root, { recursive: true });
});

describe("search index", () => {
  it("has every kind of item with its path, stages included [search#R2.S2]", () => {
    const items = searchIndex(root);
    const kinds = new Set(items.map((i) => i.kind));
    for (const k of ["Spec", "Stage", "Requirement", "Scenario", "Decision", "Question", "Plan", "Task", "Pattern"]) expect(kinds).toContain(k);
    expect(items).toContainEqual(expect.objectContaining({ kind: "Stage", title: "Verify · link-report", href: "/work/link-report/verify" }));
    expect(items).toContainEqual(expect.objectContaining({ kind: "Task", id: "T2", title: "Download report button", context: "link-report · 002-link-report · frontend", href: "/work/link-report/plan/002-link-report/frontend/tasks/T2" }));
    expect(items).toContainEqual(expect.objectContaining({ kind: "Scenario", id: "R2.S1", context: "link-report", href: "/work/link-report/spec/requirements/R2.S1" }));
    expect(items).toContainEqual(expect.objectContaining({ kind: "Pattern", id: "P1", href: "/work/link-report/plan/002-link-report/backend/design/P1" }));
  });

  it("is built fresh, so a new spec is found at once [search#R2.S3]", () => {
    expect(searchIndex(root).some((i) => i.kind === "Spec" && i.id === "search")).toBe(false);
    mkdirSync(join(root, "specs"), { recursive: true });
    writeFileSync(join(root, "specs", "search.md"), "---\nid: search\ntitle: Search\nstatus: draft\n---\n# Search\n\n## Purpose\nFind things.\n");
    expect(searchIndex(root).some((i) => i.kind === "Spec" && i.id === "search")).toBe(true);
  });
});

import { searchItems } from "../src/search.ts";
import type { SearchItem } from "../server/search.ts";
const item = (kind: string, id: string, title: string, context = "", text = ""): SearchItem => ({ kind, id, title, text, context, href: `/x/${kind}/${id}` });

describe("ranking", () => {
  it("finds a task by words, with its context [search#R2.S1]", () => {
    const items = [item("Spec", "build", "Build stage"), item("Task", "T2", "The /factree:build skill", "build · 015-build · claude-plugin")];
    const teams = searchItems(items, "build skill");
    const task = teams.find((g) => g.kind === "Task")!.items[0]!;
    expect(task).toMatchObject({ id: "T2", title: "The /factree:build skill", context: "build · 015-build · claude-plugin" });
  });

  it("puts an exact id first [search#R3.S1]", () => {
    const items = [item("Scenario", "R2.S1", "Mixed team", "plan-view"), item("Requirement", "R2", "Export contents", "link-report"), item("Scenario", "R2.S1", "Mixed team", "link-report")];
    const first = searchItems(items, "link-report R2.S1")[0]!.items[0]!;
    expect(first).toMatchObject({ kind: "Scenario", id: "R2.S1", context: "link-report" });
  });

  it("tolerates gaps and marks the matched letters [search#R3.S2]", () => {
    const hit = searchItems([item("Spec", "link-report", "link-report")], "link rep")[0]!.items[0]!;
    expect(hit.id).toBe("link-report");
    expect(hit.marks).toEqual([0, 1, 2, 3, 5, 6, 7]);   // l i n k · r e p in "link-report"
  });

  it("shows at most 8 of a kind and 30 in all [search#R3.S3]", () => {
    const many = [
      ...Array.from({ length: 40 }, (_, i) => item("Requirement", `R${i + 1}`, `The spec says ${i}`, "x")),
      ...Array.from({ length: 40 }, (_, i) => item("Task", `T${i + 1}`, `spec task ${i}`, "x")),
      ...Array.from({ length: 40 }, (_, i) => item("Scenario", `R1.S${i + 1}`, `spec case ${i}`, "x")),
      ...Array.from({ length: 40 }, (_, i) => item("Decision", `D${i + 1}`, `spec decision ${i}`, "x")),
      ...Array.from({ length: 40 }, (_, i) => item("Pattern", `P${i + 1}`, `spec pattern ${i}`, "x")),
    ];
    const teams = searchItems(many, "spec");
    for (const g of teams) expect(g.items.length).toBeLessThanOrEqual(8);
    expect(teams.reduce((n, g) => n + g.items.length, 0)).toBe(30);
    const reqs = searchItems(many.filter((i) => i.kind === "Requirement"), "spec");
    expect(reqs[0]!.items.length).toBe(8);
  });

  it("matches nothing on an empty query", () => {
    expect(searchItems([item("Spec", "a", "A")], "  ")).toEqual([]);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isPaletteKey, paletteKey, withRecent } from "../src/search.ts";
import { Palette } from "../src/components/Palette.tsx";

describe("the palette", () => {
  it("⌘ / or Ctrl / opens it [search#R1.S1]", () => {
    expect(isPaletteKey({ key: "/", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isPaletteKey({ key: "/", metaKey: false, ctrlKey: true })).toBe(true);
    expect(paletteKey("Escape", 0, 3, false)).toEqual({ t: "close" });
  });

  it("/ alone in a text field types a slash", () => {
    expect(isPaletteKey({ key: "/", metaKey: false, ctrlKey: false }, true)).toBe(false);
  });

  it("↓ then Enter opens the second result [search#R4.S1]", () => {
    let sel = 0;
    const down = paletteKey("ArrowDown", sel, 5, false);
    if (down.t === "move") sel = down.to;
    expect(sel).toBe(1);
    expect(paletteKey("Enter", sel, 5, false)).toEqual({ t: "open", newTab: false });
    expect(paletteKey("Enter", sel, 5, true)).toEqual({ t: "open", newTab: true });
  });

  it("shows recent items above the shortcuts [search#R5.S1]", () => {
    const recent = withRecent([], { kind: "Task", id: "T2", title: "The /factree:build skill", context: "build · 015-build · claude-plugin", href: "/work/build/plan/015-build/claude-plugin/tasks/T2" });
    const h = renderToStaticMarkup(createElement(Palette, { onClose: () => {}, onGo: () => {}, initialRecent: recent }));
    expect(h.indexOf(">Recent<")).toBeLessThan(h.indexOf(">Shortcuts<"));
    expect(h).toContain("The /factree:build skill");
    expect(h).toContain("Decisions waiting");
  });

  it("shows only the shortcuts when nothing is recent [search#R5.S2]", () => {
    const h = renderToStaticMarkup(createElement(Palette, { onClose: () => {}, onGo: () => {}, initialRecent: [] }));
    expect(h).not.toContain(">Recent<");
    expect(h).toContain(">Shortcuts<");
    expect(withRecent(withRecent([], { kind: "Spec", id: "a", title: "A", context: "", href: "/a" }), { kind: "Spec", id: "a", title: "A", context: "", href: "/a" })).toHaveLength(1);
  });
});

import { SearchButton } from "../src/components/Header.tsx";
import { readFileSync as readSrc } from "node:fs";
describe("header search", () => {
  it("the header opens search [header-search#R1.S1] [header-search#R1.S3]", () => {
    const h = renderToStaticMarkup(createElement(SearchButton, { onOpen: () => {} }));
    expect(h).toMatch(/<button[^>]*aria-label="Search"[^>]*>[\s\S]*Search…[\s\S]*⌘ \/[\s\S]*<\/button>/);
    expect(readSrc(new URL("../src/App.tsx", import.meta.url), "utf8")).not.toContain("Filter specs");
  });
  it("slash opens search [header-search#R1.S2]", () => {
    expect(isPaletteKey({ key: "/", metaKey: false, ctrlKey: false }, false)).toBe(true);
  });
  it("slash in a text field types", () => {
    expect(isPaletteKey({ key: "/", metaKey: false, ctrlKey: false }, true)).toBe(false);
    expect(isPaletteKey({ key: "/", metaKey: true, ctrlKey: false }, true)).toBe(true);
  });
});
