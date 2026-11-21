import { createContext, useContext, useState, type MouseEvent, type ReactNode } from "react";
import type { Activity } from "../../shared/types.ts";
import { activityText } from "../status.ts";
import { NO_LINKS, codeHref, tokenize, type LinkEnv, type Token } from "../links.ts";
import { STATUS_META, type StatusIconName } from "../status.ts";
import type { DisplayStatus, SessionRef } from "../../shared/types.ts";

/** A moving ellipsis for work in progress (live-activity R1); still under prefers-reduced-motion. */
export function Ellipsis() {
  return <span className="ellipsis" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>;
}

/** What's running: the label with a moving ellipsis and the step, or "Asking you" / "Paused · …" without one. */
export function ActivityLine({ a }: { a: Activity }) {
  if (a.asking || a.paused) return <>{activityText(a)}</>;
  return <>{a.label}<Ellipsis />{a.step && ` ${a.step}`}</>;
}

/** A stage or spec is busy while its activity runs, not when it's paused or asking (live-activity R5). */
export function busy(a: Activity | null | undefined): boolean {
  return Boolean(a && !a.paused && !a.asking);
}

/** A small spinner in place of a status icon while work runs (live-activity R5); still under reduced motion. */
export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A factory: sawtooth roof, chimney, windows. */
/** The Factree logo, the loop, from the same file as the README's (spec logo R1); decorative beside the name. */
export function Logo({ size = 22 }: { size?: number }) {
  return <img src="/logo.svg" width={size} height={size} alt="" />;
}

const STATUS_GLYPHS: Record<StatusIconName, ReactNode> = {
  // A tower crane; the hook swings while a spec is being written.
  crane: <><path d="M3 21h7M6 21V4h13M6 8l4-4" /><g className="hook"><path d="M16 4v7" /><path d="M14 11h4v1.5a2 2 0 0 1-4 0z" /></g></>,
  bell: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13 7 4 4" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  rocket: <><path d="M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10z" /><circle cx="12" cy="10" r="1.5" /><path d="m9 19-1 2M15 19l1 2M12 19v2" /></>,
};

export function StatusIcon({ status, size = 16 }: { status: DisplayStatus; size?: number }) {
  const meta = STATUS_META[status];
  return (
    <svg className={`status-icon ${status}${meta.animated ? " animated" : ""}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {STATUS_GLYPHS[meta.icon]}
    </svg>
  );
}

/** Icon plus a visible label, so status never depends on colour or shape alone. */
export function StatusBadge({ status }: { status: DisplayStatus }) {
  return <span className={`status-badge ${status}`}><StatusIcon status={status} />{STATUS_META[status].label}</span>;
}

/** What links resolve against: the spec on screen, the workspace's specs, the repo on GitHub. */
export const LinkContext = createContext<LinkEnv>(NO_LINKS);

/** Same-page links re-fire hashchange when clicked again, so the target scrolls back into view. */
function onRefClick(e: MouseEvent<HTMLAnchorElement>) {
  if (window.location.hash === e.currentTarget.getAttribute("href")) {
    e.preventDefault();
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
}

function renderTokens(tokens: Token[]): ReactNode[] {
  return tokens.map((t, k) => {
    switch (t.t) {
      case "text": return t.text;
      case "strong": return <strong key={k}>{renderTokens(t.children)}</strong>;
      case "del": return <del key={k}>{renderTokens(t.children)}</del>;
      case "link": return t.external
        ? <a key={k} href={t.href} target="_blank" rel="noreferrer">{t.text}</a>
        : <a key={k} href={t.href} className="ref" onClick={onRefClick}>{t.text}</a>;
      case "code": {
        if (!t.href) return <code key={k}>{t.text}</code>;
        const external = /^https?:/.test(t.href);
        return external
          ? <a key={k} href={t.href} target="_blank" rel="noreferrer" className="code-link"><code>{t.text}</code></a>
          : <a key={k} href={t.href} className="ref code-link" onClick={onRefClick}><code>{t.text}</code></a>;
      }
    }
  });
}

/** Render a line of spec markdown: `code`, **bold**, ~~struck~~, with links. Text only, never HTML. */
export function Inline({ text }: { text: string }) {
  const env = useContext(LinkContext);
  return <>{renderTokens(tokenize(text, env))}</>;
}

/** A command to run in Claude Code, with a copy button that falls back to selecting the text. */
/** Copies `claude --resume <id>`; the button alone, with no session id beside it. */
export function ResumeButton({ id }: { id: string }) {
  const command = `claude --resume ${id}`, label = "Copy resume";
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this command", command); }   // eslint-disable-line no-alert
  };
  return (
    <span className="copy">
      <button type="button" className="btn" title={command} onClick={copy}>{label}</button>
      {copied && <span className="copied" role="status">Copied</span>}
    </span>
  );
}

export function CopyCommand({ command, label = "Copy", shown }: { command: string; label?: string; shown?: string }) {
  const [copied, setCopied] = useState(false);
  const [id] = useState(() => `cmd-${Math.random().toString(36).slice(2, 8)}`);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = command;   // a shortened label shows the full command before selecting it
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };
  return (
    <span className="copy">
      <code id={id} title={shown ? command : undefined}>{shown ?? command}</code>
      <button type="button" className="btn ghost" onClick={copy}>{label}</button>
      {copied && <span className="copied" role="status">Copied</span>}
    </span>
  );
}

export function isUrl(s: string): boolean {
  return /^https?:\/\//.test(s);
}

export function SourceLink({ source }: { source: string }) {
  const { repo } = useContext(LinkContext);
  if (isUrl(source)) {
    let label = source;
    try {
      const u = new URL(source);
      label = u.hostname.includes("atlassian") ? `Confluence: ${decodeURIComponent(u.pathname.split("/").pop() ?? "").replace(/\+/g, " ")}` : u.hostname + u.pathname;
    } catch { /* keep raw */ }
    return <a href={source} target="_blank" rel="noreferrer">{label}</a>;
  }
  const code = codeHref(source, repo);
  if (code) return <a href={code} target="_blank" rel="noreferrer" className="mono">{source}</a>;
  return <span className="mono">{source}</span>;
}

/** The latest session that worked on a spec or plan, with its resume command (spec-sessions R2, R3). */
// Resume is offered only when the session is closed or unknown; an open one is answered in the terminal (companion-handoff R2).
export function SessionChip({ id, state = "unknown" }: { id: string; state?: SessionRef["state"] }) {
  if (state === "working") return <span className="session-chip">Claude is working</span>;
  if (state === "your_turn" || state === "waiting") return <span className="session-chip">Your turn in session <code>{id.slice(0, 8)}</code></span>;
  return <span className="session-chip"><ResumeButton id={id} /></span>;
}
