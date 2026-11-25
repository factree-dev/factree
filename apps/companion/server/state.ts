// A spec's recorded state, <workspace>/state/<spec>.json, as state.sh writes it (status-state R1, R4, R5), with
// staleness worked out on read by the same rule as `state.sh <spec> stale` (D3, D6).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Hold } from "../shared/types.ts";

export interface WorkState { stage: string; done: number; total: number; review: string; prs: string[]; hold?: Hold; stale: boolean }
export interface SpecState { spec: string; plan: string; works: Record<string, WorkState> }

// POSIX cksum: CRC-32 with polynomial 0x04C11DB7, most significant bit first, over the bytes then the length.
const TABLE = new Uint32Array(256).map((_, i) => {
  let c = i << 24;
  for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
  return c >>> 0;
});
export function cksum(bytes: Uint8Array): number {
  let c = 0;
  const add = (b: number) => { c = ((c << 8) ^ TABLE[((c >>> 24) ^ b) & 255]!) >>> 0; };
  for (const b of bytes) add(b);
  for (let n = bytes.length; n > 0; n = Math.floor(n / 256)) add(n & 255);
  return ~c >>> 0;
}

// Files are read byte for byte (latin1), as state.sh's awk reads them under LC_ALL=C.
const read = (p: string) => (existsSync(p) ? readFileSync(p, "latin1") : null);
const lines = (t: string) => t.split("\n").map((l) => l.replace(/\r$/, ""));
const front = (t: string) => { const l = lines(t); if (l[0] !== "---") return []; const end = l.indexOf("---", 1); return l.slice(1, end < 0 ? l.length : end); };
/** A front-matter value, as state.sh's fm() reads it. */
function fm(t: string, key: string): string {
  const l = front(t).find((x) => x.startsWith(key + ":"));
  return l === undefined ? "" : l.replace(/^[^:]*: */, "").replace(/ +#.*/, "");
}

/** "<crc> <size>" of each requirement in the plan's scope as the spec reads now: its block from the heading to the next,
 *  whitespace collapsed, Source: lines left out; retired ones not at all (state.sh covers). */
function covers(root: string, work: string, specText: string): Map<string, string> {
  const out = new Map<string, string>();
  const head = read(join(root, "work", work, "plan.md")) ?? read(join(root, "work", work, "tasks.md"));
  if (head === null) return out;
  const scope = ` ${fm(head, "scope").replace(/[[\],]/g, "")} `;
  const gone = new Set<string>();
  for (const l of front(specText)) if (/^retired:/.test(l)) l.replace(/[[\],]/g, " ").trim().split(/\s+/).slice(1).forEach((r) => gone.add(r));
  let id = "", txt = "";
  const flush = () => {
    if (id && scope.includes(` ${id} `) && !gone.has(id)) {
      const text = txt.replace(/[ \t\r]+/g, " ").replace(/^ /, "").replace(/ $/, "");
      out.set(`cover.${work}.${id}`, `${cksum(Buffer.from(text, "latin1"))} ${text.length}`);
    }
    id = ""; txt = "";
  };
  const all = lines(specText);
  const body = all[0] === "---" ? all.slice(all.indexOf("---", 1) < 0 ? all.length : all.indexOf("---", 1) + 1) : all;
  for (const l of body) {
    if (/^## /.test(l) || (/^### /.test(l) && !/^### Requirement:/.test(l))) { flush(); continue; }
    if (/^### Requirement: R[0-9]+/.test(l)) { flush(); id = l.trim().split(/[ \t]+/)[2] ?? ""; }
    if (id && !/^[ \t]*Source:/.test(l)) txt += " " + l;
  }
  flush();
  return out;
}

/** The spec's state, or null with no state file. One that can't be read, or records no spec stage, is null too: the
 *  caller reads that spec as before, and one state file never fails the UI (design). */
export function readState(root: string, id: string): SpecState | null {
  try { return parseState(root, id); } catch (e) { console.error(`state/${id}.json can't be read (${(e as Error).message}); reading ${id} from events`); return null; }
}
function parseState(root: string, id: string): SpecState | null {
  const text = read(join(root, "state", `${id}.json`));
  if (text === null) return null;
  const kv = new Map<string, string>();
  for (const l of text.split("\n")) {
    if (l === "{" || l === "}" || l === "") continue;
    const m = /^ {2}"([^"]*)": "([^"]*)",?$/.exec(l);
    if (!m) { console.error(`state/${id}.json is not readable; reading ${id} from events`); return null; }
    kv.set(m[1]!, m[2]!);
  }
  if (!kv.has("spec")) { console.error(`state/${id}.json records no spec stage; reading ${id} from events`); return null; }
  const specText = read(join(root, "specs", `${id}.md`));
  const works: Record<string, WorkState> = {};
  for (const [k, stage] of kv) {
    if (!k.startsWith("plan.")) continue;
    const w = k.slice(5), get = (p: string) => kv.get(`${p}.${w}`) ?? "";
    const list = (p: string) => get(p).split(" ").filter(Boolean);
    const held = get("hold"), sp = held.indexOf(" ");
    const review = get("review") || "none";
    let stale = false;
    if (specText !== null && ["approved", "building", "implemented"].includes(stage)) {
      // A covered requirement's sum differs, or one is retired or missing; once merged, only a change to one still there (D6).
      const stored = [...kv].filter(([x]) => x.startsWith(`cover.${w}.`));
      const have = new Map(stored);
      let bad = false, hit = 0;
      for (const [x, sum] of covers(root, w, specText)) if (have.get(x) !== sum) bad = true; else hit++;
      stale = bad || (review !== "merged" && hit !== stored.length);
    }
    works[w] = { stage, done: list("tasks").length, total: Number(get("total") || 0), review, prs: list("prs"), stale,
      ...(held ? { hold: { stage: sp < 0 ? held : held.slice(0, sp), reason: sp < 0 ? "" : held.slice(sp + 1), since: get("hold_since") } } : {}) };
  }
  return { spec: kv.get("spec")!, plan: kv.get("plan") ?? "", works };
}
