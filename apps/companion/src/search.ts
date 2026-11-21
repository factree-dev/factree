// Ranking for the search palette (spec search R3): exact ids first, then titles, then any text.
// Letters may have gaps between them ("link rep" finds link-report); matched letters are marked for highlighting.

import type { SearchItem } from "../server/search.ts";

export type SearchHit = SearchItem & { marks: number[]; score: number };
export const PER_KIND = 8;
export const TOTAL = 30;

/** Positions in `text` matching the query's letters in order (spaces ignored), or null. */
export function fuzzyMarks(text: string, query: string): number[] | null {
  const t = text.toLowerCase(), q = query.toLowerCase().replace(/\s+/g, "");
  const marks: number[] = [];
  let from = 0;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at < 0) return null;
    marks.push(at); from = at + 1;
  }
  return marks;
}

function score(it: SearchItem, tokens: string[], query: string): { score: number; marks: number[] } | null {
  const id = it.id.toLowerCase(), title = it.title.toLowerCase(), ctx = it.context.toLowerCase(), text = it.text.toLowerCase();
  const inCtx = (tok: string) => ctx.split(/[\s·]+/).includes(tok);
  const marks = fuzzyMarks(it.title, query) ?? [];
  if (tokens.some((tok) => tok === id)) {
    const rest = tokens.filter((tok) => tok !== id);
    if (rest.every((tok) => inCtx(tok) || title.includes(tok))) return { score: 1000 + (rest.length && rest.every(inCtx) ? 200 : 0), marks };
  }
  const head = `${id} ${title} ${ctx}`;
  if (tokens.every((tok) => head.includes(tok))) return { score: 500 - Math.min(title.length, 200) / 10, marks };
  if (fuzzyMarks(`${id} ${title}`, query)) return { score: 300 - (marks.length ? marks[marks.length - 1]! - marks[0]! : 100), marks };
  if (tokens.every((tok) => `${head} ${text}`.includes(tok))) return { score: 100, marks: [] };
  return null;
}

/** Ranked results grouped by kind, groups in order of their best result, ≤8 per kind and ≤30 in all. */
export function searchItems(items: SearchItem[], query: string): { kind: string; items: SearchHit[] }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const hits: SearchHit[] = [];
  for (const it of items) { const s = score(it, tokens, q); if (s) hits.push({ ...it, ...s }); }
  hits.sort((a, b) => b.score - a.score || a.title.length - b.title.length);
  const groups = new Map<string, SearchHit[]>();
  let total = 0;
  for (const h of hits) {
    if (total >= TOTAL) break;
    const g = groups.get(h.kind) ?? [];
    if (g.length >= PER_KIND) continue;
    g.push(h); groups.set(h.kind, g); total++;
  }
  return [...groups].map(([kind, list]) => ({ kind, items: list }));
}

// ---------- The palette's keys and memory (spec search R1, R4, R5) ----------

/** ⌘ / (or Ctrl / where there's no ⌘) opens the palette; / alone stays the sidebar filter (R1). */
export function isPaletteKey(e: { key: string; metaKey: boolean; ctrlKey: boolean }, typing = true): boolean {
  // ⌘ / anywhere; / alone outside a text field (header-search R1).
  return e.key === "/" && (e.metaKey || e.ctrlKey || !typing);
}

export type PaletteAction = { t: "move"; to: number } | { t: "open"; newTab: boolean } | { t: "close" } | { t: "none" };
/** ↑/↓ move, Enter opens (⌘ Enter in a new tab), Esc closes (R4). */
export function paletteKey(key: string, sel: number, count: number, meta: boolean): PaletteAction {
  if (key === "ArrowDown") return { t: "move", to: Math.min(sel + 1, Math.max(count - 1, 0)) };
  if (key === "ArrowUp") return { t: "move", to: Math.max(sel - 1, 0) };
  if (key === "Enter") return count ? { t: "open", newTab: meta } : { t: "none" };
  if (key === "Escape") return { t: "close" };
  return { t: "none" };
}

export type RecentItem = Pick<SearchItem, "kind" | "id" | "title" | "context" | "href">;
const RECENT_KEY = "factree.recent";
export const MAX_RECENT = 5;

/** Recently opened items, newest first; this browser only, and empty if storage is blocked (R5). */
export function loadRecent(): RecentItem[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? (v as RecentItem[]).slice(0, MAX_RECENT) : []; }
  catch { return []; }
}
export function withRecent(list: RecentItem[], it: RecentItem): RecentItem[] {
  return [it, ...list.filter((x) => x.href !== it.href)].slice(0, MAX_RECENT);
}
export function saveRecent(it: RecentItem): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(withRecent(loadRecent(), it))); } catch { /* storage blocked: nothing remembered */ }
}
