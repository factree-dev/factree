// Every decision about a spec, grouped for its Decisions tab (spec decisions-view): what waits on the user,
// what people decided, who approved the spec and its plans, and the calls Claude made alone.

import type { SpecDetail } from "../shared/types.ts";

export interface DecisionItem {
  id: string;
  text: string;
  decider: string;          // a person, "preference: <key>", "Claude's call", or "you" for waiting items
  when: string;
  recommendation?: string;  // waiting items
  override?: string;        // Claude's calls: text to paste into Claude Code to change it (R3)
}

export function decisionGroups(d: SpecDetail): { waiting: DecisionItem[]; decisions: DecisionItem[]; approvals: DecisionItem[]; calls: DecisionItem[] } {
  const id = d.summary.id;
  const waiting = d.summary.live.pending.map((q) => ({ id: `Question ${q.n}`, text: q.text, decider: "you", when: q.askedAt, recommendation: q.proposal || undefined }));
  const decisions = (d.spec?.decisions ?? []).map((x) => ({ id: x.id, text: x.text, decider: x.who || "unknown", when: x.date }));
  const approvals: DecisionItem[] = [];
  if (d.spec?.approvedBy) approvals.push({ id: "Spec", text: "Approved", decider: d.spec.approvedBy, when: d.spec.approvedAt });
  for (const p of d.plans) {
    if (p.approvedBy) approvals.push({ id: "Plan", text: `${p.work} approved`, decider: p.approvedBy, when: p.approvedAt });
    else if (p.designApprovedBy) approvals.push({ id: "Plan", text: `${p.work} design approved`, decider: p.designApprovedBy, when: p.designApprovedAt });
  }
  const calls = d.calls.map((c) => ({
    id: c.id, text: c.text, decider: "Claude's call", when: c.ts,
    override: `Change Claude's call ${c.id} on ${id} ("${c.text}") to: `,
  }));
  return { waiting, decisions, approvals, calls };
}
