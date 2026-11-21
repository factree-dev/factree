// Reading a Factree workspace from disk: events, sessions and specs (spec codebase-health R5).

import { ENDED_SESSION_MS, SESSION_STALE_MS } from "../shared/config.ts";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { FactreeEvent, Session, Spec } from "../shared/types.ts";
import { parseSpec } from "./parse-spec.ts";

export function readText(path: string): string | null {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

export function readEvents(root: string): FactreeEvent[] {
  const text = readText(join(root, "events.jsonl"));
  if (!text) return [];
  const out: FactreeEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as FactreeEvent;
      if (e && typeof e.type === "string" && typeof e.ts === "string") out.push({ ...e, data: e.data ?? {} });
    } catch { /* a half-written line; skip */ }
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}

export function readSessions(root: string, now = Date.now()): Session[] {
  const dir = join(root, "sessions");
  if (!existsSync(dir)) return [];
  const out: Session[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const text = readText(join(dir, f));
    if (!text) continue;
    try {
      const s = JSON.parse(text) as Session;
      const age = now - Date.parse(s.updated);
      if (s.state === "ended" && age > ENDED_SESSION_MS) continue;
      if (age > SESSION_STALE_MS) continue;
      out.push(s);
    } catch { /* skip */ }
  }
  return out.sort((a, b) => b.updated.localeCompare(a.updated));
}

export function readSpecs(root: string): Map<string, Spec> {
  const dir = join(root, "specs");
  const out = new Map<string, Spec>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const id = basename(f, ".md");
    const text = readText(join(dir, f));
    if (text !== null) out.set(id, parseSpec(text, id));
  }
  return out;
}

export function isDir(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
