import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { workspaceState, newerVersion } from "../server/workspace.ts";
import { VersionBanner } from "../src/components/Header.tsx";

let root: string;
beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "factree-")), ".factree");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "events.jsonl"), JSON.stringify({ ts: "2026-11-17T10:00:00Z", type: "spec.step", spec: "x", v: "0.5.0", data: {} }) + "\n");
});

describe("version banner", () => {
  it("shows when the companion is older than the workspace [version-check#R3.S1]", () => {
    const s = workspaceState(root, "A", Date.now(), null, "0.4.0");
    expect(s.versionGap).toEqual({ running: "0.4.0", workspace: "0.5.0" });
    expect(renderToStaticMarkup(createElement(VersionBanner, { gap: s.versionGap }))).toContain(
      "Factree 0.4.0 is older than the 0.5.0 that last wrote this workspace. Update: /plugin → factree, then restart.");
  });

  it("is absent when up to date [version-check#R3.S2]", () => {
    expect(workspaceState(root, "A", Date.now(), null, "0.5.0").versionGap).toBeNull();
    expect(newerVersion("0.10.0", "0.9.0")).toBe(true);
    expect(newerVersion("0.9.0", "0.10.0")).toBe(false);
    expect(renderToStaticMarkup(createElement(VersionBanner, { gap: null }))).toBe("");
  });
});
