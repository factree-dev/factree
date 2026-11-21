// Parse a Factree spec (markdown with front matter) into structured data.
// The format is defined in plugins/factree/skills/spec-format/SKILL.md.
// Lenient by design: anything it can't read goes into `problems` rather than failing.

import type { Decision, FlowLine, Observation, OpenQuestion, Requirement, Scenario, Spec, SpecStatus } from "../shared/types.ts";

type FrontMatter = Record<string, string | string[]>;

export function parseFrontMatter(text: string): { fm: FrontMatter; body: string; problems: string[] } {
  const problems: string[] = [];
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return { fm: {}, body: text, problems: ["No front matter"] };
  const fm: FrontMatter = {};
  let current: string | null = null;
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line === "---") break;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && current) {
      const prev = fm[current];
      const list = Array.isArray(prev) ? prev : prev ? [prev] : [];
      list.push(clean(item[1] ?? ""));
      fm[current] = list;
      continue;
    }
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (kv) {
      current = kv[1] ?? null;
      let value = stripComment(kv[2] ?? "");
      if (current) {
        if (/^\[.*\]$/.test(value)) {
          fm[current] = value.slice(1, -1).split(",").map(clean).filter(Boolean);
        } else {
          fm[current] = clean(value);
        }
      }
    }
  }
  if (i >= lines.length) problems.push("Front matter is not closed with ---");
  return { fm, body: lines.slice(i + 1).join("\n"), problems };
}

function stripComment(v: string): string {
  return v.replace(/\s+#.*$/, "").trim();
}
function clean(v: string): string {
  return v.trim().replace(/^["']|["']$/g, "");
}
function str(fm: FrontMatter, key: string): string {
  const v = fm[key];
  return Array.isArray(v) ? v.join(", ") : v ?? "";
}
function list(fm: FrontMatter, key: string): string[] {
  const v = fm[key];
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

/** Split the body into `## Section` blocks. */
export function sections(body: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let name = "";
  for (const line of body.split(/\r?\n/)) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      name = (h[1] ?? "").trim();
      out.set(name, []);
      continue;
    }
    if (name) out.get(name)?.push(line);
  }
  return out;
}

function isPlaceholder(line: string): boolean {
  const t = line.trim();
  return t === "" || t.startsWith("<!--") || /^none yet\.?$/i.test(t) || /^none\.?$/i.test(t);
}

function bullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (/^- /.test(line)) out.push(line.slice(2).trim());
    else if (/^\s{2,}\S/.test(line) && out.length) out[out.length - 1] += " " + line.trim();
  }
  return out;
}

export function parseObservations(lines: string[]): Observation[] {
  return bullets(lines).flatMap((b) => {
    const m = /^(O\d+)\s+(.*)$/.exec(b);
    return m ? [{ id: m[1] ?? "", text: m[2] ?? "" }] : [];
  });
}

export function parseDecisions(lines: string[]): Decision[] {
  return bullets(lines).flatMap((b) => {
    const m = /^(D\d+)\s+(.*)$/.exec(b);
    if (!m) return [];
    let text = m[2] ?? "";
    let who = "";
    let date = "";
    const tail = /\((\d{4}-\d{2}-\d{2}),\s*([^)]+)\)\s*$/.exec(text);
    if (tail) {
      date = tail[1] ?? "";
      who = (tail[2] ?? "").trim();
      text = text.slice(0, tail.index).trim();
    }
    const superseded = /~~/.test(text) || /Superseded by/i.test(text);
    const resolves = [...text.matchAll(/Resolves (Q\d+)/g)].map((r) => r[1] ?? "");
    return [{ id: m[1] ?? "", text, who, date, resolves, superseded }];
  });
}

export function parseQuestions(lines: string[]): OpenQuestion[] {
  return bullets(lines).flatMap((b) => {
    const m = /^(Q\d+)\s+(.*)$/.exec(b);
    if (!m) return [];
    let text = m[2] ?? "";
    const owner = /Owner:\s*([^.]+)\./.exec(text)?.[1]?.trim() ?? "";
    const blocksRaw = /Blocks:\s*([^.]+)\.?/.exec(text)?.[1] ?? "";
    const blocks = blocksRaw.split(",").map((s) => s.trim()).filter((s) => /^R\d+$/.test(s));
    const cut = text.search(/\s+Owner:/);
    if (cut >= 0) text = text.slice(0, cut).trim();
    return [{ id: m[1] ?? "", text, owner, blocks }];
  });
}

export function parseRequirements(lines: string[], problems: string[]): Requirement[] {
  const reqs: Requirement[] = [];
  let req: Requirement | null = null;
  let scen: Scenario | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const rh = /^### Requirement: (R\d+)\s+(.+)$/.exec(line);
    if (rh) {
      req = { id: rh[1] ?? "", name: (rh[2] ?? "").trim(), statement: "", source: "", blockedBy: [], scenarios: [] };
      reqs.push(req);
      scen = null;
      continue;
    }
    if (/^### /.test(line)) {
      problems.push(`Unreadable requirement heading: ${line}`);
      req = null;
      scen = null;
      continue;
    }
    if (!req) continue;
    const sh = /^#### Scenario: (S\d+)\s+(.+)$/.exec(line);
    if (sh) {
      scen = { id: sh[1] ?? "", name: (sh[2] ?? "").trim(), steps: [] };
      req.scenarios.push(scen);
      continue;
    }
    if (scen) {
      const st = /^- \*\*(GIVEN|WHEN|THEN|AND)\*\*\s*(.*)$/.exec(line);
      if (st) scen.steps.push({ kind: st[1] as "GIVEN" | "WHEN" | "THEN" | "AND", text: (st[2] ?? "").trim() });
      continue;
    }
    if (/^Source:/.test(line)) req.source = line.slice(7).trim();
    else if (/^Blocked by:/.test(line)) req.blockedBy = line.slice(11).split(",").map((s) => s.trim()).filter(Boolean);
    else if (!req.statement && line.trim() && !line.startsWith("<!--")) req.statement = line.trim();
  }
  return reqs;
}

export function parseSpec(text: string, fileId?: string): Spec {
  const { fm, body, problems } = parseFrontMatter(text);
  const sec = sections(body);
  const status = str(fm, "status");
  const validStatus: SpecStatus = status === "approved" || status === "live" ? status : "draft";
  if (status && status !== validStatus) problems.push(`Unknown status "${status}"`);

  const scopeLines = sec.get("Scope") ?? [];
  const scopeIn = scopeLines.find((l) => /^\*\*In:\*\*/.test(l))?.replace(/^\*\*In:\*\*\s*/, "") ?? "";
  const scopeOut = scopeLines.find((l) => /^\*\*Out:\*\*/.test(l))?.replace(/^\*\*Out:\*\*\s*/, "") ?? "";
  const scopeAnti = scopeLines.find((l) => /^\*\*Anti-goals:\*\*/.test(l))?.replace(/^\*\*Anti-goals:\*\*\s*/, "") ?? "";
  const sketchLines = sec.get("Sketch") ?? [];
  const open = sketchLines.findIndex((l) => /^```/.test(l));
  const close = open < 0 ? -1 : sketchLines.findIndex((l, i) => i > open && /^```/.test(l));
  const sketch = open >= 0 && close > open ? sketchLines.slice(open + 1, close).join("\n") : null;
  const flow = sketch !== null && /^```flow\b/.test(sketchLines[open]!) ? parseFlow(sketch) : null;
  const purpose = (sec.get("Purpose") ?? []).filter((l) => !isPlaceholder(l)).join(" ").trim();
  const titleLine = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? "";

  for (const name of ["Purpose", "Scope", "Requirements", "Code", "Decisions", "Open questions"]) {
    if (!sec.has(name)) problems.push(`Missing section "${name}"`);
  }

  return {
    id: str(fm, "id") || fileId || "",
    title: str(fm, "title") || titleLine || fileId || "Untitled spec",
    status: validStatus,
    owner: str(fm, "owner"),
    sources: list(fm, "sources"),
    approvedBy: str(fm, "approved_by"),
    approvedAt: str(fm, "approved_at"),
    created: str(fm, "created"),
    updated: str(fm, "updated"),
    purpose,
    scope: { in: scopeIn.trim(), out: scopeOut.trim(), anti: scopeAnti.trim() },
    sketch,
    flow,
    observations: parseObservations(sec.get("Observations") ?? []),
    requirements: parseRequirements(sec.get("Requirements") ?? [], problems),
    code: (sec.get("Code") ?? []).filter((l) => !isPlaceholder(l)).map((l) => l.replace(/^- /, "").trim()),
    decisions: parseDecisions(sec.get("Decisions") ?? []),
    questions: parseQuestions(sec.get("Open questions") ?? []),
    problems,
  };
}

/** A flow block's lines, "From -> To : action [R2.S1, R2.S2]"; lines without "->" are skipped (spec-flow R1). */
export function parseFlow(text: string): FlowLine[] {
  const out: FlowLine[] = [];
  for (const raw of text.split("\n")) {
    const m = /^\s*(.+?)\s*->\s*(.+?)\s*(?::\s*(.*?))?\s*(?:\[([^\]]*)\])?\s*$/.exec(raw);
    if (!m) continue;
    out.push({ from: m[1]!, to: m[2]!, action: (m[3] ?? "").trim(), cites: (m[4] ?? "").split(",").map((c) => c.trim()).filter(Boolean) });
  }
  return out;
}
