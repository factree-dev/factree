import { allCss } from "./css.ts";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Inbox, inboxKey } from "../src/components/Inbox.tsx";
import type { DecisionCard } from "../shared/types.ts";

const card = (over: Partial<DecisionCard>): DecisionCard => ({
  id: "x", kind: "question", spec: "link-report", title: "Where?", why: "", options: [], links: [], since: "2026-11-19T10:00:00Z", session: null, approvable: true, ...over,
});
const three = [
  card({ id: "q1", n: 1, title: "Include deleted links?", why: "The export feeds BI of current holders.", recommendation: "Leave them out", options: ["Include with a Deleted column — one more column"] }),
  card({ id: "q2", n: 2, title: "A second export while one runs?", recommendation: "Refuse it" }),
  card({ id: "q3", n: 3, title: "Date format?", recommendation: "ISO 8601" }),
];
const view = (cards: DecisionCard[], done = 0) => renderToStaticMarkup(createElement(Inbox, { cards, onDecide: async () => null, done }));
const segments = (h: string) => [...h.matchAll(/<span class="seg( [a-z]+)?"/g)].map((m) => (m[1] ?? "").trim());

describe("decide one at a time", () => {
  it("three waiting [decide-focus#R1.S1]", () => {
    const h = view(three);
    expect(h).toContain("Include deleted links?");
    expect(h).not.toContain("A second export while one runs?");
    expect(h).toContain("1 of 3");
    expect(segments(h)).toEqual(["now", "", ""]);
    expect(h).toMatch(/<details[^>]*><summary>Why<\/summary>[\s\S]*The export feeds BI of current holders\./);
  });

  it("enter [decide-focus#R2.S1]", () => {
    expect(inboxKey("Enter", 0, three)).toEqual({ t: "decide", body: { kind: "answer", spec: "link-report", n: 1, answer: "Leave them out" } });
    const h = view(three.slice(1), 1);   // the first is decided and gone; one done this visit
    expect(h).toContain("2 of 3");
    expect(segments(h)).toEqual(["done", "now", ""]);
    expect(h).toContain("Refuse it <kbd>Enter</kbd>");
  });

  it("another option [decide-focus#R2.S2]", () => {
    expect(inboxKey("2", 0, three)).toEqual({ t: "decide", body: { kind: "answer", spec: "link-report", n: 1, answer: "Include with a Deleted column" } });
    const h = view(three);
    expect(h).toContain("Include with a Deleted column <kbd>2</kbd>");
    expect(h).toContain("Something else <kbd>r</kbd>");
  });

  it("back [decide-focus#R3.S1]", () => {
    expect(inboxKey("ArrowLeft", 1, three)).toEqual({ t: "move", to: 0 });
    expect(inboxKey("ArrowRight", 0, three)).toEqual({ t: "move", to: 1 });
  });
});

describe("decisions at full width", () => {
  it("full width [decide-focus#R1.S2]", () => {
    const css = allCss();
    const rules = [...css.matchAll(/^\.(focus|inbox) \{[^}]*\}/gm)].map((m) => m[0]);
    expect(rules.length).toBeGreaterThanOrEqual(1);
    for (const r of rules) expect(r).not.toContain("max-width");
  });
});

describe("no link to where you are", () => {
  it("on the spec's own page [decide-focus#R4.S1]", () => {
    const c = card({ id: "q9", n: 9, title: "Which?", recommendation: "This", links: [{ label: "link-report", href: "/work/link-report/spec" }, { label: "R5", href: "/work/link-report/spec/requirements/R5" }] });
    const h = view([c]);
    expect(h).not.toContain('href="/work/link-report/spec"');
    expect(h).toContain('href="/work/link-report/spec/requirements/R5"');
  });
});
