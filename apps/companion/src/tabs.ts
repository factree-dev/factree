// The spec page's tabs (spec spec-tabs): which tabs exist, their counts, and which tab an address opens.

import type { Spec } from "../shared/types.ts";
import { firstName } from "../shared/names.ts";

export type SpecTab = "scope" | "requirements" | "flow" | "sketch" | "decisions" | "questions" | "observations" | "code" | "activity";

const IDS: SpecTab[] = ["scope", "requirements", "flow", "sketch", "decisions", "questions", "observations", "code", "activity"];


/** Tabs in order, with counts; Observations, Code and Activity only when they have something (R1, R5). */
export function specTabs(spec: Spec, activity: number, user: string, waiting = 0): { id: SpecTab; label: string; count: number | null; attention: boolean }[] {
  const mine = Boolean(user) && spec.questions.some((q) => firstName(q.owner) === firstName(user));
  const tabs: { id: SpecTab; label: string; count: number | null; attention: boolean }[] = [
    { id: "scope", label: "Scope", count: null, attention: false },
    { id: "requirements", label: "Requirements", count: spec.requirements.length, attention: false },
    ...(spec.flow ? [{ id: "flow" as const, label: "Flow", count: null, attention: false }]   // a flow block draws as a flow (spec-flow R2)
      : spec.sketch ? [{ id: "sketch" as const, label: "Sketch", count: null, attention: false }] : []),   // spec-writing R1
    { id: "decisions", label: "Decisions", count: spec.decisions.length, attention: waiting > 0 },   // marked while a brief waits (decisions-view R1)
    { id: "questions", label: "Open questions", count: spec.questions.length, attention: mine },
  ];
  if (spec.observations.length) tabs.push({ id: "observations", label: "Observations", count: spec.observations.length, attention: false });
  if (spec.code.length) tabs.push({ id: "code", label: "Code", count: null, attention: false });
  if (activity) tabs.push({ id: "activity", label: "Activity", count: activity, attention: false });
  return tabs;
}

/** The tab an item lives on (R4). */
export function tabForRef(ref: string | null): SpecTab | null {
  if (!ref) return null;
  if (/^R\d/.test(ref)) return "requirements";
  if (/^D\d/.test(ref)) return "decisions";
  if (/^Q\d/.test(ref)) return "questions";
  if (/^O\d/.test(ref)) return "observations";
  return null;
}

/** The tab to show: the one in the address, else the one holding the linked item, else Requirements (R2). */
export function resolveSpecTab(tab: string | null, ref: string | null): SpecTab {
  if (tab && (IDS as string[]).includes(tab)) return tab as SpecTab;
  return tabForRef(ref) ?? "requirements";
}

export function specTabHref(specId: string, tab: SpecTab): string {
  return tab === "requirements" ? `/work/${specId}/spec` : `/work/${specId}/spec/${tab}`;
}
