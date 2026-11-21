// What the plan page and the spec page work out from a plan and its spec (spec plan-view).
// Pure functions, so they can be tested without a browser.

import type { Plan, PlanTask, Spec } from "../shared/types.ts";
import { planHref, refHref, refsOf } from "./links.ts";

/** A ref as a task or component writes it (`link-report#R2.S1`, `R2.S1`, `R2`) → its ID in the plan's spec, or null if it names another spec. */
export function localRef(ref: string, specId: string): string | null {
  const m = /^(?:([a-z0-9][a-z0-9-]*)#)?(R\d+(?:\.S\d+)?)$/.exec(ref.trim());
  if (!m) return null;
  return !m[1] || m[1] === specId ? (m[2] as string) : null;
}

/**
 * Is a task or component backed by the spec (plan-view R6)? Backed when it cites at least one ID
 * and every ID exists in the spec, or when it's a foundation task that says why.
 */
export function backing(ids: string[], foundation: string | null, refs: ReadonlySet<string>, specId: string): { backed: boolean; unknown: string[] } {
  if (ids.length === 0) return { backed: Boolean(foundation), unknown: [] };
  const unknown = ids.filter((r) => { const id = localRef(r, specId); return !id || !refs.has(id); });
  return { backed: unknown.length === 0, unknown };
}

export function allTasks(plan: Plan): PlanTask[] {
  return plan.verticals.flatMap((v) => v.tasks ?? []);
}

/** Every in-scope scenario with the tasks that prove it, in spec order (plan-view R2). */
export function coverage(plan: Plan, spec: Spec): { ref: string; name: string; tasks: { id: string; vertical: string }[] }[] {
  const tasks = allTasks(plan);
  return spec.requirements.filter((r) => plan.scope.includes(r.id)).flatMap((r) =>
    r.scenarios.map((s) => {
      const ref = `${r.id}.${s.id}`;
      return { ref, name: s.name, tasks: tasks.filter((t) => t.proves.some((p) => localRef(p, spec.id) === ref)).map((t) => ({ id: t.id, vertical: t.vertical })) };
    }),
  );
}

/** In-scope scenarios no task proves (plan-view R7.S1). */
export function unproved(plan: Plan, spec: Spec): { ref: string; name: string }[] {
  return coverage(plan, spec).filter((c) => c.tasks.length === 0).map(({ ref, name }) => ({ ref, name }));
}

/** Requirements of the spec this plan doesn't cover (plan-view R7.S2). */
export function outsideScope(plan: Plan, spec: Spec): { id: string; name: string }[] {
  return spec.requirements.filter((r) => !plan.scope.includes(r.id)).map((r) => ({ id: r.id, name: r.name }));
}

/** Tasks and design components that aren't backed by the spec (plan-view R6), for the overview. */
export function notBacked(plan: Plan, spec: Spec): { kind: "task" | "component"; id: string; vertical: string; unknown: string[] }[] {
  const refs = refsOf(spec);
  const out: { kind: "task" | "component"; id: string; vertical: string; unknown: string[] }[] = [];
  for (const v of plan.verticals) {
    for (const t of v.tasks ?? []) {
      const b = backing(t.proves, t.foundation, refs, spec.id);
      if (!b.backed) out.push({ kind: "task", id: t.id, vertical: v.name, unknown: b.unknown });
    }
    for (const c of v.components) {
      const b = backing(c.serves, null, refs, spec.id);
      if (!b.backed) out.push({ kind: "component", id: c.path, vertical: v.name, unknown: b.unknown });
    }
  }
  return out;
}

/** Which sub-tab of a vertical to show (plan-view R12): the one in the address, else where the linked item lives, else Design. */
export function planView(view: string | null, ref: string | null): "design" | "tasks" {
  if (view === "design" || view === "tasks") return view;
  return ref && /^T\d/.test(ref) ? "tasks" : "design";
}

/** Links for the IDs a plan defines: tasks to their vertical's tab, patterns to the design that names them. */
export function planLocal(plan: Plan): Map<string, string> {
  const local = new Map<string, string>();
  for (const v of plan.verticals) {
    for (const t of v.tasks ?? []) local.set(t.id, planHref(plan.spec, plan.work, v.name, t.id));
    for (const p of v.patterns) local.set(p, planHref(plan.spec, plan.work, v.name, p));
  }
  return local;
}

/**
 * Where a relative markdown link in a plan goes: the plan's own files to their tab,
 * a spec file to its page. `from` is the vertical whose file holds the link ("" for plan.md).
 */
export function planResolver(plan: Plan, from: string): (href: string) => string | undefined {
  const names = new Set(plan.verticals.map((v) => v.name));
  return (href) => {
    const spec = /(?:^|\/)specs\/([a-z0-9][a-z0-9-]*)\.md(?:#.*)?$/.exec(href);
    if (spec) return refHref(spec[1] as string);
    const m = /^(?:\.\.\/|\.\/)?(?:([\w-]+)\/)?(design|tasks|plan)\.md(?:#.*)?$/.exec(href);
    if (!m) return undefined;
    if (m[2] === "plan") return planHref(plan.spec, plan.work, "overview");
    const vertical = m[1] ?? from;
    return names.has(vertical) ? planHref(plan.spec, plan.work, vertical) : undefined;
  };
}

/** For the spec page: each requirement's tasks, across every plan for the spec (plan-view R8). */
export function tasksByRequirement(plans: Plan[]): Map<string, { work: string; task: string; vertical: string }[]> {
  const out = new Map<string, { work: string; task: string; vertical: string }[]>();
  for (const plan of plans) {
    for (const t of allTasks(plan)) {
      const reqs = new Set(t.proves.flatMap((p) => localRef(p, plan.spec)?.split(".")[0] ?? []));
      for (const r of reqs) {
        const list = out.get(r) ?? [];
        list.push({ work: plan.work, task: t.id, vertical: t.vertical });
        out.set(r, list);
      }
    }
  }
  return out;
}

export { refsOf };
