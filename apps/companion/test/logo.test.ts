import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Logo } from "../src/components/bits.tsx";

const repo = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const app = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

describe("one logo everywhere", () => {
  it("the README [logo#R1.S1]", () => {
    const first = /<img src="([^"]+)"/.exec(readFileSync(repo("README.md"), "utf8"))?.[1];
    expect(first).toBe("docs/logo.svg");
    expect(existsSync(repo("docs/logo.svg"))).toBe(true);
  });
  it("the companion [logo#R1.S2]", () => {
    expect(renderToStaticMarkup(createElement(Logo))).toMatch(/<img[^>]*src="\/logo\.svg"/);
    expect(readFileSync(app("index.html"), "utf8")).toMatch(/<link rel="icon" href="\/logo\.svg"/);
    expect(readFileSync(app("public/logo.svg"), "utf8")).toBe(readFileSync(repo("docs/logo.svg"), "utf8"));   // one logo, no drift
  });
});
