import { describe, it, expect } from "vitest";
import { parseFlow, parseSpec } from "../server/parse-spec.ts";
import { layoutFlow, type FlowLayout } from "../src/flow.ts";

type Rect = { x: number; y: number; w: number; h: number };
const inside = (r: Rect) => ({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 });   // touching an edge isn't crossing
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const segRect = (p: [number, number], q: [number, number]): Rect => ({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]) || 0.01, h: Math.abs(p[1] - q[1]) || 0.01 });
const card = (l: FlowLayout, name: string) => l.cards.find((c) => c.name === name)!;
function crossings(l: FlowLayout) {
  const out: string[] = [];
  for (const a of l.arrows) for (let i = 1; i < a.points.length; i++) for (const c of l.cards)
    if (hits(segRect(a.points[i - 1]!, a.points[i]!), inside(c))) out.push(`${a.from} -> ${a.to} crosses ${c.name}`);
  for (const a of l.arrows) for (const c of l.cards) if (hits(a.labelBox, inside(c))) out.push(`label "${a.action}" on ${c.name}`);
  for (const c of l.cards) for (const d of l.cards) if (c !== d && hits(c, d)) out.push(`${c.name} overlaps ${d.name}`);
  return out;
}

const exportFlow = parseFlow(`Team page -> Exporting : export [R2.S1, R2.S2]
Exporting -> File : rows [R2.S1]
Exporting -> Busy : export again [R4.S1]
File -> Team page : back`);

const liveActivity = parseFlow(`Draft -> Writing : reading the code [R1.S6]
Writing -> Planning : spec approved [R1.S1]
Writing -> Writing step : step writing [R1.S7]
Planning -> Building : plan approved [R1.S2, R2.S1]
Planning -> Asking you : asks a question [R2.S2]
Asking you -> Planning : you answer
Building -> Self-reviewing : all tasks merged [R1.S3]
Building -> Paused : 25 minutes quiet [R3.S1]
Paused -> Building : work resumes
Self-reviewing -> Verifying : verify starts [R1.S4]
Verifying -> Opening the PR : push starts [R1.S5]
Verifying -> Verify failed : a test fails
Opening the PR -> Waiting for reviewers : PR opened`);

describe("the flow, laid out for reading", () => {
  it("parses lines, actions and citations", () => {
    expect(exportFlow[0]).toEqual({ from: "Team page", to: "Exporting", action: "export", cites: ["R2.S1", "R2.S2"] });
    expect(exportFlow[3]).toEqual({ from: "File", to: "Team page", action: "back", cites: [] });
  });

  it("skips a malformed line", () => {
    expect(parseFlow("Team page -> Exporting : export\nExporting then File\n")).toHaveLength(1);
  });

  it("a flow block becomes the spec's flow", () => {
    const s = parseSpec("---\nid: x\ntitle: X\nstatus: draft\n---\n# X\n\n## Purpose\nP\n\n## Sketch\n```flow\nA -> B : go [R1.S1]\n```\n", "x");
    expect(s.flow).toEqual([{ from: "A", to: "B", action: "go", cites: ["R1.S1"] }]);
    expect(parseSpec("---\nid: x\ntitle: X\nstatus: draft\n---\n# X\n\n## Sketch\n```\nA box\n```\n", "x").flow).toBeNull();
  });

  it("main path in one row [spec-flow#R2.S1]", () => {
    const l = layoutFlow(exportFlow);
    const [g, e, f, b] = ["Team page", "Exporting", "File", "Busy"].map((n) => card(l, n));
    expect(g!.y).toBe(e!.y); expect(e!.y).toBe(f!.y);
    expect(g!.x).toBeLessThan(e!.x); expect(e!.x).toBeLessThan(f!.x);
    expect(b!.x).toBe(e!.x); expect(b!.y).toBeGreaterThan(e!.y);
  });

  it("going back [spec-flow#R2.S2]", () => {
    const l = layoutFlow(exportFlow);
    const back = l.arrows.find((a) => a.from === "File" && a.to === "Team page")!;
    expect(Math.min(...back.points.map((p) => p[1]))).toBeLessThan(card(l, "Team page").y);   // above the row
    expect(crossings(l)).toEqual([]);
  });

  it("nothing overlaps [spec-flow#R2.S3]", () => {
    const l = layoutFlow(liveActivity);
    expect(l.cards).toHaveLength(12);
    expect(l.arrows).toHaveLength(13);
    expect(crossings(l)).toEqual([]);
  });

  it("unreached state", () => {
    const l = layoutFlow(parseFlow("A -> B : go\nC -> B : also"));
    expect(card(l, "C").x).toBe(card(l, "A").x);
    expect(card(l, "C").y).toBeGreaterThan(card(l, "A").y);
    expect(crossings(l)).toEqual([]);
  });
});
