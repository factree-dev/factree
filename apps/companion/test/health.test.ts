import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Checks that keep the companion maintainable (spec codebase-health).
const app = fileURLToPath(new URL("..", import.meta.url));
function sources(dir: string, ext: RegExp): string[] {
  return readdirSync(join(app, dir)).flatMap((n) => {
    const p = join(dir, n);
    return statSync(join(app, p)).isDirectory() ? sources(p, ext) : ext.test(n) ? [p] : [];
  });
}
const code = () => ["src", "server", "shared"].flatMap((d) => sources(d, /\.tsx?$/));

/** The words a class can come from: inside className expressions and string literals in the components, comments
 *  stripped, lower-cased (so a class built from data, like .review-state.merged from "MERGED", counts). */
function codeWords(): Set<string> {
  const words = new Set<string>();
  const add = (s: string) => { for (const w of s.toLowerCase().split(/[^a-z0-9_-]+/)) if (w) words.add(w); };
  for (const f of sources("src", /\.tsx?$/)) {
    const text = readFileSync(join(app, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "");
    for (const m of text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) add(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return words;
}
const cssFiles = () => sources("src", /\.css$/);

describe("codebase health", () => {
  it("no unused CSS [codebase-health#R3.S1]", () => {
    const words = codeWords();
    // Built from data at run time: .review-state.<pull request state, lower-cased> (ReviewView).
    for (const c of ["changes_requested"]) words.add(c);
    const unused = cssFiles().flatMap((f) => {
      const css = readFileSync(join(app, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      return [...new Set([...css.matchAll(/\.([a-z][a-z0-9_-]*)/g)].map((m) => m[1]!))].filter((c) => !words.has(c)).map((c) => `${f}: .${c}`);
    });
    expect(unused).toEqual([]);
  });

  it("companion settings in config [codebase-health#R2.S1]", () => {
    const homes = new Set(["shared/config.ts", "src/words.ts"]);
    const settings = [/\b4747\b/, /"Stale · spec changed"/, /"Up next"/, /"Waiting for reviewers"/, /\d+ \* 60 \* 1000/];
    const strays = code().filter((f) => !homes.has(f)).flatMap((f) => {
      const text = readFileSync(join(app, f), "utf8");
      return settings.filter((re) => re.test(text)).map((re) => `${f}: ${re}`);
    });
    expect(strays).toEqual([]);
  });
  it("no source file over 300 lines [codebase-health#R5.S1]", () => {
    const long = [...code(), ...cssFiles()].map((f) => [f, readFileSync(join(app, f), "utf8").split("\n").length] as const).filter(([, n]) => n > 300);
    expect(long).toEqual([]);
  });
});
