// Laying out a spec's flow for reading (spec spec-flow R2): the main path left to right in one row, every other state
// below the state it's first reached from, and every arrow routed through the space around the cards, never over one.
// Pure, so tests can check the geometry: no card over another, no arrow or label over a card.

import type { FlowLine } from "../shared/types.ts";

export type Point = [number, number];
export interface FlowCard { name: string; x: number; y: number; w: number; h: number; main: boolean }
export interface FlowArrow extends FlowLine { points: Point[]; label: Point; labelBox: { x: number; y: number; w: number; h: number } }
export interface FlowLayout { cards: FlowCard[]; arrows: FlowArrow[]; width: number; height: number }

const W = 184, H = 56, GY = 72, M = 24, LANE = 26, LABEL_H = 18;
const labelWidth = (s: string) => Math.ceil(s.length * 6.6) + 16;

export function layoutFlow(lines: FlowLine[]): FlowLayout {
  const names: string[] = [];
  for (const l of lines) for (const n of [l.from, l.to]) if (!names.includes(n)) names.push(n);
  const grid = new Map<string, { col: number; row: number }>();
  const used = new Map<number, Set<number>>();   // rows taken in each column
  const put = (n: string, col: number, row: number) => { grid.set(n, { col, row }); (used.get(col) ?? used.set(col, new Set()).get(col)!).add(row); };
  const freeRow = (col: number) => { let r = 1; while (used.get(col)?.has(r)) r++; return r; };

  // The main path: from the first line's state, follow each state's first line to a state not yet on it.
  if (lines.length) {
    let cur = lines[0]!.from, col = 0;
    put(cur, col, 0);
    for (;;) {
      const next = lines.find((l) => l.from === cur && !grid.has(l.to));
      if (!next) break;
      put(next.to, ++col, 0); cur = next.to;
    }
  }
  // Every other state: below the state it's first reached from; a state never reached goes below the start.
  for (let changed = true; changed;) {
    changed = false;
    for (const l of lines) if (grid.has(l.from) && !grid.has(l.to)) { const c = grid.get(l.from)!.col; put(l.to, c, freeRow(c)); changed = true; }
  }
  for (const n of names) if (!grid.has(n)) put(n, 0, freeRow(0));

  // Which arrows are straight steps, and which go round through a lane above the row.
  const straight = (l: FlowLine) => {
    const a = grid.get(l.from)!, b = grid.get(l.to)!;
    if (a.row === b.row && b.col === a.col + 1) return "right";
    if (a.col === b.col && Math.abs(a.row - b.row) === 1) return b.row > a.row ? "down" : "up";
    return null;
  };
  const laned = lines.filter((l) => !straight(l));
  // Columns are spaced for the widest label sitting between them.
  const GX = Math.max(120, ...lines.filter((l) => straight(l) === "right").map((l) => labelWidth(l.action) + 24));
  const top = M + laned.length * LANE + 12;
  const box = (n: string) => { const g = grid.get(n)!; return { x: M + g.col * (W + GX), y: top + g.row * (H + GY), w: W, h: H }; };
  const cards: FlowCard[] = names.map((n) => ({ name: n, ...box(n), main: grid.get(n)!.row === 0 }));

  const arrows: FlowArrow[] = lines.map((l) => {
    const a = box(l.from), b = box(l.to), kind = straight(l), lw = labelWidth(l.action);
    let points: Point[], label: Point;
    if (kind === "right") {
      const y = a.y + H / 2;
      points = [[a.x + W, y], [b.x, y]]; label = [(a.x + W + b.x) / 2, y - 14];
    } else if (kind === "down" || kind === "up") {
      const dx = kind === "down" ? -24 : 24, x = a.x + W / 2 + dx;   // a pair going down and back up sit side by side
      const y1 = kind === "down" ? a.y + H : a.y, y2 = kind === "down" ? b.y : b.y + H;
      points = [[x, y1], [x, y2]]; label = [x + (kind === "down" ? -lw / 2 - 6 : lw / 2 + 6), (y1 + y2) / 2];
    } else {
      // Out to the channel right of the source, up to its own lane above the row, across, and down the channel right
      // of the target into its right side. Channels and lanes hold no cards.
      const k = laned.indexOf(l), laneY = M + k * LANE + 8, off = 12 + (k % 6) * 7;
      const sx = a.x + W + off, tx = b.x + W + off, sy = a.y + H / 2 + 8, ty = b.y + H / 2 - 8;
      points = [[a.x + W, sy], [sx, sy], [sx, laneY], [tx, laneY], [tx, ty], [b.x + W, ty]];
      label = [(sx + tx) / 2, laneY];
    }
    return { ...l, points, label, labelBox: { x: label[0] - lw / 2, y: label[1] - LABEL_H / 2, w: lw, h: LABEL_H } };
  });
  const width = Math.max(...cards.map((c) => c.x + c.w), ...arrows.map((a) => a.labelBox.x + a.labelBox.w)) + M + GX;
  const height = Math.max(...cards.map((c) => c.y + c.h)) + M;
  return { cards, arrows, width, height };
}
