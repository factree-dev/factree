// The search index (spec search R2): everything in the workspace that has an address, built fresh per request.

import { readSpecs, readEvents } from "./read.ts";
import { readPlans } from "./loop.ts";
import { VERIFY_ON } from "../src/features.ts";
import { refHref, planHref, specPath, verifyHref } from "../src/links.ts";

export interface SearchItem { kind: string; id: string; title: string; text: string; context: string; href: string }

export function searchIndex(root: string): SearchItem[] {
  const specs = readSpecs(root);
  const plans = readPlans(root, readEvents(root), specs);
  const out: SearchItem[] = [];
  for (const [id, s] of specs) {
    out.push({ kind: "Spec", id, title: s.title, text: s.purpose, context: "", href: specPath(id) });
    const newest = plans.find((p) => p.spec === id);
    out.push({ kind: "Stage", id, title: `Spec · ${id}`, text: "", context: id, href: specPath(id) });
    if (newest) {
      out.push({ kind: "Stage", id, title: `Plan · ${id}`, text: "", context: id, href: planHref(id, newest.work) });
      out.push({ kind: "Stage", id, title: `Build · ${id}`, text: "", context: id, href: planHref(id, newest.work, "build") });
    }
    if (VERIFY_ON) out.push({ kind: "Stage", id, title: `Verify · ${id}`, text: "", context: id, href: verifyHref(id) });
    for (const r of s.requirements) {
      out.push({ kind: "Requirement", id: r.id, title: r.name, text: r.statement, context: id, href: refHref(id, r.id) });
      for (const sc of r.scenarios) {
        const ref = `${r.id}.${sc.id}`;
        out.push({ kind: "Scenario", id: ref, title: sc.name, text: sc.steps.map((x) => x.text).join(" "), context: id, href: refHref(id, ref) });
      }
    }
    for (const d of s.decisions) out.push({ kind: "Decision", id: d.id, title: d.text.slice(0, 120), text: d.text, context: id, href: refHref(id, d.id) });
    for (const q of s.questions) out.push({ kind: "Question", id: q.id, title: q.text, text: q.owner, context: id, href: refHref(id, q.id) });
  }
  for (const p of plans) {
    out.push({ kind: "Plan", id: p.work, title: `Plan ${p.work}`, text: p.verticals.map((v) => v.name).join(" "), context: p.spec, href: planHref(p.spec, p.work) });
    for (const v of p.verticals) {
      for (const t of v.tasks ?? []) {
        out.push({ kind: "Task", id: t.id, title: t.title, text: t.proves.join(" "), context: `${p.spec} · ${p.work} · ${v.name}`, href: planHref(p.spec, p.work, v.name, t.id) });
      }
      for (const s of v.design ?? []) {
        if (s.name !== "Patterns") continue;
        for (const b of s.blocks) if (b.t === "list") for (const it of b.items) {
          const m = /^\*\*([PN]\d+)\s+([^:*]+)/.exec(it.text);
          if (m) out.push({ kind: "Pattern", id: m[1]!, title: m[2]!.trim(), text: it.text, context: `${p.spec} · ${p.work} · ${v.name}`, href: planHref(p.spec, p.work, v.name, m[1]) });
        }
      }
    }
  }
  return out;
}
