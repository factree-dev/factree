// The companion's stylesheets as one text, in cascade order, for tests that check a rule (spec codebase-health R5).
import { readFileSync } from "node:fs";

export function allCss(): string {
  const index = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  return [...index.matchAll(/@import "\.\/([^"]+)";/g)].map((m) => readFileSync(new URL(`../src/${m[1]}`, import.meta.url), "utf8")).join("\n");
}
