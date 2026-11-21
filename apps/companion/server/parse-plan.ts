// Parse a Factree plan (one work folder) into structured data.
// Layouts come from spec plan-verticals: plan.md plus <vertical>/design.md and tasks.md,
// or the older design.md and tasks.md, shown as one "general" vertical.
// Lenient like the spec parser: anything it can't read goes into `problems`.

import type { Block, Plan, PlanComponent, PlanSection, PlanStatus, PlanTask, PlanVertical } from "../shared/types.ts";
import { parseFrontMatter, sections } from "./parse-spec.ts";

export interface PlanFiles {
  plan?: string;                                                   // plan.md; absent for old plans
  verticals: Record<string, { design?: string; tasks?: string }>;  // in the plan's order
}

type FrontMatter = ReturnType<typeof parseFrontMatter>["fm"];

function str(fm: FrontMatter, key: string): string {
  const v = fm[key];
  return Array.isArray(v) ? v.join(", ") : v ?? "";
}
function list(fm: FrontMatter, key: string): string[] {
  const v = fm[key];
  return Array.isArray(v) ? v : v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}
function asStatus(v: string): PlanStatus {
  return v === "approved" || v === "design-approved" ? v : "draft";
}

const ITEM = /^(\d+\.|-)\s+(?:\[( |x|X)\]\s+)?(.*)$/;

/** Markdown lines → blocks: paragraphs, ### headings, lists (with checkboxes), tables, fenced code. */
export function parseBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) out.push({ t: "p", text: para.join(" ") }); para = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") { flush(); continue; }
    if (/^<!--.*-->$/.test(trimmed)) continue;
    const fence = /^```(\S*)/.exec(trimmed);
    if (fence && !/^\s/.test(line)) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^```\s*$/.test((lines[i] ?? "").trim()); i++) body.push(lines[i] ?? "");
      out.push({ t: "code", lang: fence[1] ?? "", text: body.join("\n") });
      continue;
    }
    if (trimmed.startsWith("|")) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && (lines[i] ?? "").trim().startsWith("|"); i++) {
        const row = (lines[i] ?? "").trim();
        if (/^\|[\s|:-]+\|$/.test(row)) continue;
        rows.push(row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      }
      i--;
      out.push({ t: "table", head: rows[0] ?? [], rows: rows.slice(1) });
      continue;
    }
    const h = /^#{3,6}\s+(.*)$/.exec(trimmed);
    if (h && !/^\s/.test(line)) { flush(); out.push({ t: "h", text: h[1] ?? "" }); continue; }
    const item = ITEM.exec(line);
    if (item) {
      flush();
      const ordered = /^\d/.test(item[1] ?? "");
      const items: { text: string; done?: boolean }[] = [];
      for (; i < lines.length; i++) {
        const l = lines[i] ?? "";
        const m = ITEM.exec(l);
        if (m) {
          items.push(m[2] === undefined ? { text: m[3] ?? "" } : { text: m[3] ?? "", done: m[2] !== " " });
          continue;
        }
        const last = items[items.length - 1];
        if (last && /^\s+\S/.test(l)) { last.text += "\n" + l.replace(/^ {2}/, ""); continue; }
        // A blank line ends the list unless the list carries on after it.
        if (!l.trim() && i + 1 < lines.length && (ITEM.exec(lines[i + 1] ?? "") || /^\s+\S/.test(lines[i + 1] ?? ""))) continue;
        break;
      }
      i--;
      out.push({ t: "list", ordered, items });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return out;
}

function toSections(body: string, skip: string[] = []): PlanSection[] {
  return [...sections(body)].filter(([name]) => !skip.includes(name)).map(([name, lines]) => ({ name, blocks: parseBlocks(lines) }));
}

function components(body: string): PlanComponent[] {
  const table = parseBlocks(sections(body).get("Components") ?? []).find((b) => b.t === "table");
  if (!table || table.t !== "table") return [];
  return table.rows.map((r) => ({
    path: (r[0] ?? "").replace(/`/g, "").trim(),
    serves: [...(r[r.length - 1] ?? "").matchAll(/\bR\d+(?:\.S\d+)?\b/g)].map((m) => m[0]),
  }));
}

function patterns(body: string): string[] {
  return (sections(body).get("Patterns") ?? []).flatMap((l) => /^- \*\*([PN]\d+)\b/.exec(l)?.[1] ?? []);
}

export function parseTasks(body: string, vertical: string, problems: string[], label: string): PlanTask[] {
  const tasks: PlanTask[] = [];
  let task: PlanTask | null = null;
  let part: { name: string; lines: string[] } | null = null;
  const close = () => {
    if (task && part) task.body.push({ name: part.name, blocks: parseBlocks(part.lines) });
    part = null;
  };
  for (const line of body.split(/\r?\n/)) {
    if (/^### /.test(line)) {
      close();
      const h = /^### (T\d+):\s*(.*)$/.exec(line);
      if (!h) { problems.push(`${label}: unreadable task heading "${line.slice(4)}"`); task = null; continue; }
      task = { id: h[1] ?? "", title: (h[2] ?? "").trim(), vertical, proves: [], foundation: null, dependsOn: [], estDiff: "", stepsDone: 0, stepsTotal: 0, body: [] };
      tasks.push(task);
      continue;
    }
    if (!task) continue;
    const field = /^\*\*(Proves|Depends on|Est\. diff):\*\*\s*(.*)$/.exec(line);
    if (field) {
      close();
      const v = (field[2] ?? "").trim();
      if (field[1] === "Proves") {
        const none = /^none\b\s*(?:\((.*)\))?/i.exec(v);
        if (none) task.foundation = (none[1] ?? "").trim();
        else task.proves = v.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (field[1] === "Depends on") {
        task.dependsOn = /^(none|—|-)?$/i.test(v) || /^none\b/i.test(v) ? [] : v.split(",").flatMap((s) => /^\s*(T\d+)/.exec(s)?.[1] ?? []);
      } else task.estDiff = v;
      continue;
    }
    const head = /^\*\*([A-Z][\w ]*)\*\*\s*$/.exec(line.trim());
    if (head) { close(); part = { name: head[1] ?? "", lines: [] }; continue; }
    if (part) part.lines.push(line);
  }
  close();
  for (const t of tasks) {
    for (const b of t.body.find((s) => s.name === "Steps")?.blocks ?? []) {
      if (b.t !== "list") continue;
      for (const it of b.items) if (it.done !== undefined) { t.stepsTotal++; if (it.done) t.stepsDone++; }
    }
  }
  return tasks;
}

export function parsePlan(work: string, files: PlanFiles): Plan {
  const problems: string[] = [];
  const read = (text: string, label: string) => {
    const r = parseFrontMatter(text);
    for (const p of r.problems) problems.push(`${label}: ${p}`);
    return r;
  };
  const old = files.plan === undefined;
  const verticals: PlanVertical[] = [];
  let overview: PlanSection[] = [];
  let head: FrontMatter = {};
  let status: PlanStatus = "draft";
  let designFm: FrontMatter = {};

  if (!old) {
    const p = read(files.plan ?? "", "plan.md");
    head = p.fm;
    overview = toSections(p.body);
    status = asStatus(str(head, "status"));
  }
  for (const [name, f] of Object.entries(files.verticals)) {
    const prefix = old ? "" : `${name}/`;
    const d = f.design !== undefined ? read(f.design, `${prefix}design.md`) : null;
    const t = f.tasks !== undefined ? read(f.tasks, `${prefix}tasks.md`) : null;
    if (old) {
      // Old plans keep plan-wide parts in their two files: lift them into the overview.
      designFm = d?.fm ?? {};
      head = t?.fm ?? designFm;
      if (d) overview = toSections(d.body).filter((s) => s.name === "Context" || s.name === "Spec updates");
      const ds = asStatus(str(designFm, "status"));
      const ts = asStatus(str(t?.fm ?? {}, "status"));
      status = ts === "approved" ? "approved" : ds !== "draft" ? "design-approved" : "draft";
    }
    verticals.push({
      name,
      design: d ? toSections(d.body, old ? ["Context", "Spec updates"] : []) : null,
      tasks: t ? parseTasks(t.body, name, problems, `${prefix}tasks.md`) : null,
      components: d ? components(d.body) : [],
      patterns: d ? patterns(d.body) : [],
      preamble: d ? d.body.split(/\n## /)[0]!.replace(/^# .*$/m, "").trim() : "",
    });
  }
  const approvals = old ? designFm : head;
  return {
    work,
    spec: str(head, "spec"),
    layout: old ? "old" : "vertical",
    status,
    designApprovedBy: str(approvals, "design_approved_by"),
    designApprovedAt: str(approvals, "design_approved_at"),
    approvedBy: str(head, "approved_by"),
    approvedAt: str(head, "approved_at"),
    specUpdated: str(old ? designFm : head, "spec_updated"),
    scope: list(head, "scope"),
    overview,
    verticals,
    stale: false,
    sessions: [],
    build: {},
    implementedAt: str(head, "implemented_at"),
    problems,
  };
}
