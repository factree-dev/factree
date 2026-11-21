// How each display status looks: its label, its icon, and whether the icon moves (spec-status R1, R6, R7).
// Only statuses where something is happening animate, so movement on screen always means activity (D1).

import type { DisplayStatus, Activity } from "../shared/types.ts";
import { ago } from "./api.ts";

export type StatusIconName = "crane" | "bell" | "pencil" | "check" | "rocket";

export const STATUS_META: Record<DisplayStatus, { label: string; icon: StatusIconName; animated: boolean }> = {
  needs_you: { label: "Needs you", icon: "bell", animated: true },
  writing: { label: "Writing", icon: "crane", animated: true },
  draft: { label: "Draft", icon: "pencil", animated: false },
  approved: { label: "Approved", icon: "check", animated: false },
  live: { label: "Live", icon: "rocket", animated: false },
};




/** Decisions waiting per spec (companion-decisions R1). */
export function waitingCounts(cards: { spec: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c.spec, (m.get(c.spec) ?? 0) + 1);
  return m;
}
/** "2 decisions" on a waiting spec's row, or null when nothing waits (companion-decisions R1). */
export function waitingLabel(n: number): string | null {
  return n > 0 ? `${n} decision${n === 1 ? "" : "s"}` : null;
}

/** What's running, in words: "Planning… designing", "Asking you", "Paused · 25 min ago" (live-activity R1–R3). */
export function activityText(a: Activity, now = Date.now()): string {
  if (a.asking) return "Asking you";
  if (a.paused) return `Paused · ${ago(a.since, now)}`;
  return `${a.label}…${a.step ? ` ${a.step}` : ""}`;
}

