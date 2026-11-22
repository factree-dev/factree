import { VERIFY_ON } from "./features.ts";
// Turn a line of spec markdown into tokens, linking everything that points somewhere:
// URLs, code paths (to the repo on GitHub), IDs in this spec (R2, R2.S1, O3, D1, Q2)
// IDs in other specs (link-report#R2.S1), and, in a plan, tasks (T2), patterns (P1) and markdown links.

import type { RepoLink } from "../shared/types.ts";

export interface LinkEnv {
  specId: string;                 // the spec being shown; bare IDs point into it
  refs: ReadonlySet<string>;      // IDs that exist in that spec
  specIds: ReadonlySet<string>;   // specs in the workspace, for cross-spec links
  repo: RepoLink | null;
  local?: ReadonlyMap<string, string>;               // plan IDs (T2, P1) and where they link
  resolve?: (href: string) => string | undefined;   // a relative markdown link in a plan, or undefined to show it as text
}

export const NO_LINKS: LinkEnv = { specId: "", refs: new Set(), specIds: new Set(), repo: null };

export type Token =
  | { t: "text"; text: string }
  | { t: "code"; text: string; href?: string }
  | { t: "link"; text: string; href: string; external: boolean }
  | { t: "strong" | "del"; children: Token[] };

const ID = String.raw`(?:R\d+(?:\.S\d+)?|[ODQTPN]\d+)`;
const FORMAT = /(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\[[^\]]+\]\([^)\s]+\))/g;
const LINKABLE = new RegExp(
  String.raw`(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]` +            // a URL, minus trailing punctuation
  String.raw`|[a-z0-9][a-z0-9-]*#${ID}(?![\w-])` +                  // other-spec#R2.S1
  String.raw`|(?<![\w#.\/-])${ID}(?![\w-]))`,                       // R2, R2.S1, O3, D1, Q2
  "g",
);
// path/to/file.ts, path/to/file.ts:12, path/to/file.ts:12-20, path/to/dir/, or a root file like CLAUDE.md.
// A dotted name without a slash (`SpecSummary.status`) is code, not a path, unless its extension is a file type.
const CODE_PATH = /^(?:\.\/)?((?:[\w.@-]+\/)+[\w.@-]*|[\w.@-]+\.[A-Za-z][A-Za-z0-9]*)(?::(\d+)(?:-(\d+))?)?$/;
const ROOT_FILE = /\.(md|json|ya?ml|toml|lock|txt|sh|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|css|html)$/i;

// Every view and item has a path, led by its stage (spec deep-links, D3):
//   /work/<spec>/spec[/<section>[/<ref>]]                           the spec and its sections
//   /work/<spec>/plan[/<work>[/<vertical>/<design|tasks>[/<ref>]]]   a plan
//   /work/<spec>/build[/<work>]      /work/<spec>/verify      /decisions
const SPEC_SECTIONS = ["requirements", "scope", "flow", "sketch", "decisions", "questions", "observations", "code", "activity"];
const sectionOf = (ref: string) => (/^R\d/.test(ref) ? "requirements" : /^D\d/.test(ref) ? "decisions" : /^Q\d/.test(ref) ? "questions" : /^O\d/.test(ref) ? "observations" : "requirements");

export const DECISIONS_PATH = "/decisions";
/** Where an old /decisions link goes: the oldest waiting spec's Decisions tab, or home (companion-decisions R2.S5). */
export function decisionsRedirect(cards: { spec: string }[]): string {
  return cards[0] ? `/work/${cards[0].spec}/spec/decisions` : "/";
}
export function specPath(specId: string): string { return `/work/${specId}/spec`; }
export function verifyHref(specId: string): string { return `/work/${specId}/verify`; }

/** A spec item (R2, R2.S1, D1, Q2, O3) in the section that holds it, or the spec itself. */
export function refHref(specId: string, ref?: string): string {
  return ref ? `/work/${specId}/spec/${sectionOf(ref)}/${ref}` : specPath(specId);
}

/**
 * A plan page, optionally a tab (a vertical, "build", or "overview"), an item in it, and the vertical's sub-tab
 * (plan-view R12). A task opens Tasks and a pattern opens Design unless a view is given. An empty work means the newest
 * plan. The build is its own stage: /work/<spec>/build/<work>.
 */
export function planHref(specId: string, work: string, tab?: string, ref?: string, view?: "design" | "tasks"): string {
  if (tab === "build") return `/work/${specId}/build${work ? `/${work}` : ""}`;
  const base = `/work/${specId}/plan${work ? `/${work}` : ""}`;
  if (!tab || tab === "overview") return base;
  const v = view ?? (ref && /^T\d/.test(ref) ? "tasks" : "design");
  return `${base}/${tab}/${v}${ref ? `/${ref}` : ""}`;
}

export interface Route {
  page: "home" | "spec" | "plan" | "verify" | "review" | "decisions" | "notfound";
  spec: string | null;
  plan: string | null;   // "" = the newest plan
  tab: string | null;    // a spec section, a vertical, or "build"
  view: string | null;   // a vertical's sub-tab
  ref: string | null;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const REF = /^[A-Z][A-Z0-9.]*$/;
/** The view and item a path names (deep-links R1, R2); anything else is notfound (R6). */
export function parsePath(pathname: string): Route {
  const s = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const r: Route = { page: "notfound", spec: null, plan: null, tab: null, view: null, ref: null };
  if (s.length === 0) return { ...r, page: "home" };
  if (s[0] === "decisions" && s.length === 1) return { ...r, page: "decisions" };
  if (s[0] !== "work" || !s[1] || !SLUG.test(s[1])) return r;
  const spec = s[1];
  const stage = s[2] ?? "spec";
  if (stage === "spec") {
    if (s.length <= 3) return { ...r, page: "spec", spec };
    if (!SPEC_SECTIONS.includes(s[3]!) || s.length > 5) return r;
    const ref = s[4] ?? null;
    if (ref && !REF.test(ref)) return r;
    return { ...r, page: "spec", spec, tab: s[3] === "requirements" ? null : s[3]!, ref };
  }
  if (stage === "verify") return s.length === 3 ? (VERIFY_ON ? { ...r, page: "verify", spec, tab: "verify" } : { ...r, page: "spec", spec }) : r;   // paused: the spec page (verify-paused R4.S2)
  if (stage === "review") return s.length === 3 ? { ...r, page: "review", spec, tab: "review" } : r;   // review R8
  if (stage === "build") {
    if (s.length > 4 || (s[3] && !/^[\w.-]+$/.test(s[3]))) return r;
    return { ...r, page: "plan", spec, plan: s[3] ?? "", tab: "build" };
  }
  if (stage !== "plan") return r;
  if (s.length === 3) return { ...r, page: "plan", spec, plan: "" };
  const work = s[3]!;
  if (!/^[\w.-]+$/.test(work)) return r;
  if (s.length === 4) return { ...r, page: "plan", spec, plan: work };
  const vertical = s[4]!;
  if (!SLUG.test(vertical) || s.length > 7) return r;
  const view = s[5] ?? "design";
  if (view !== "design" && view !== "tasks") return r;
  const ref = s[6] ?? null;
  if (ref && !REF.test(ref)) return r;
  return { ...r, page: "plan", spec, plan: work, tab: vertical, view, ref };
}

/** The current path for yesterday's /specs/… paths, or null if it isn't one (deep-links R4.S2). */
export function fromLegacyPath(pathname: string): string | null {
  const s = pathname.split("/").filter(Boolean);
  if (s[0] !== "specs" || !s[1]) return null;
  const spec = s[1];
  if (s.length === 2) return specPath(spec);
  if (s[2] === "verify") return verifyHref(spec);
  if (s[2] === "plan") {
    if (s[4] === "build") return planHref(spec, s[3] ?? "", "build");
    return `/work/${spec}/plan${s.length > 3 ? `/${s.slice(3).join("/")}` : ""}`;
  }
  return `/work/${spec}/spec/${s.slice(2).join("/")}`;
}

/** The path for an old `#spec=…` link, or null if it isn't one (deep-links R4). */
export function fromLegacyHash(hash: string): string | null {
  const m = /^#spec=([a-z0-9-]+)((?:&[a-z]+=[\w.-]*)*)$/.exec(hash);
  if (!m) return null;
  const spec = m[1]!;
  const p = new URLSearchParams((m[2] ?? "").slice(1));
  const ref = p.get("ref") ?? undefined, tab = p.get("tab") ?? undefined, view = p.get("view");
  if (p.has("plan")) return planHref(spec, p.get("plan") ?? "", tab, ref, view === "tasks" || view === "design" ? view : undefined);
  if (tab === "verify") return verifyHref(spec);
  if (ref) return refHref(spec, ref);
  if (tab && tab !== "requirements") return `/work/${spec}/spec/${tab}`;
  return specPath(spec);
}

export function codeHref(text: string, repo: RepoLink | null): string | undefined {
  if (!repo) return undefined;
  const m = CODE_PATH.exec(text.trim());
  if (!m || !m[1] || /^https?:/.test(text)) return undefined;
  if (!m[1].includes("/") && !ROOT_FILE.test(m[1])) return undefined;
  const path = m[1].split("/").map(encodeURIComponent).join("/");
  const lines = m[2] ? `#L${m[2]}${m[3] ? `-L${m[3]}` : ""}` : "";
  return `${repo.web}/blob/${encodeURIComponent(repo.ref)}/${path}${lines}`;
}

function linkify(text: string, env: LinkEnv): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(LINKABLE)) {
    const s = m[0];
    const at = m.index ?? 0;
    let href: string | undefined;
    let external = false;
    if (/^https?:/.test(s)) { href = s; external = true; }
    else if (s.includes("#")) {
      const [spec, ref] = s.split("#") as [string, string];
      if (spec === env.specId ? env.refs.has(ref) : env.specIds.has(spec)) href = refHref(spec, ref);
    } else if (env.refs.has(s)) href = refHref(env.specId, s);
    else href = env.local?.get(s);
    if (!href) continue;
    if (at > last) out.push({ t: "text", text: text.slice(last, at) });
    out.push({ t: "link", text: s, href, external });
    last = at + s.length;
  }
  if (last < text.length) out.push({ t: "text", text: text.slice(last) });
  return out;
}

function codeToken(text: string, env: LinkEnv): Token {
  const ref = new RegExp(`^(?:([a-z0-9][a-z0-9-]*)#)?(${ID})$`).exec(text);
  if (ref) {
    const spec = ref[1] ?? env.specId;
    const known = spec === env.specId ? env.refs.has(ref[2] as string) : env.specIds.has(spec);
    if (known) return { t: "code", text, href: refHref(spec, ref[2]) };
    const local = !ref[1] ? env.local?.get(ref[2] as string) : undefined;
    if (local) return { t: "code", text, href: local };
  }
  if (/^https?:\/\/\S+$/.test(text)) return { t: "code", text, href: text };
  return { t: "code", text, href: codeHref(text, env.repo) };
}

// [text](href): kept when it's a URL, resolved by the plan when relative, otherwise just the text.
function mdLink(s: string, env: LinkEnv): Token {
  const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(s);
  const text = m?.[1] ?? s, href = m?.[2] ?? "";
  if (/^https?:\/\//.test(href)) return { t: "link", text, href, external: true };
  const local = env.resolve?.(href);
  return local ? { t: "link", text, href: local, external: false } : { t: "text", text };
}

/** Text only, never HTML: the caller renders tokens as React elements. */
export function tokenize(text: string, env: LinkEnv = NO_LINKS): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(FORMAT)) {
    const s = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(...linkify(text.slice(last, at), env));
    if (s.startsWith("[")) out.push(mdLink(s, env));
    else if (s.startsWith("`")) out.push(codeToken(s.slice(1, -1), env));
    else out.push({ t: s.startsWith("**") ? "strong" : "del", children: linkify(s.slice(2, -2), env) });
    last = at + s.length;
  }
  if (last < text.length) out.push(...linkify(text.slice(last), env));
  return out;
}

/** Every ID a spec defines, for deciding which bare IDs to link. */
export function refsOf(spec: {
  requirements: { id: string; scenarios: { id: string }[] }[];
  observations: { id: string }[]; decisions: { id: string }[]; questions: { id: string }[];
}): Set<string> {
  const refs = new Set<string>();
  for (const r of spec.requirements) {
    refs.add(r.id);
    for (const s of r.scenarios) refs.add(`${r.id}.${s.id}`);
  }
  for (const x of [...spec.observations, ...spec.decisions, ...spec.questions]) refs.add(x.id);
  return refs;
}

/**
 * The in-app path a click should follow with history.pushState, or null to leave it to the browser:
 * only plain left-clicks on same-origin path links without a target or download (deep-links R3).
 */
export function linkTarget(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean },
  a: { getAttribute(name: string): string | null } | null): string | null {
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const href = a.getAttribute("href");
  if (!href || !href.startsWith("/") || href.startsWith("//") || a.getAttribute("target") || a.getAttribute("download") !== null) return null;
  return href;
}
