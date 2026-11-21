import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SearchItem } from "../../server/search.ts";
import { loadRecent, paletteKey, saveRecent, searchItems, type RecentItem } from "../search.ts";
import { DECISIONS_PATH } from "../links.ts";

// The search palette (spec search): ⌘ / from anywhere, everything with an address, one keystroke to open it.

type Row = { kind: string; id: string; title: string; context: string; href?: string; copy?: string; marks?: number[] };
const SHORTCUTS: Row[] = [
  { kind: "Go to", id: "", title: "Decisions waiting", context: "the inbox", href: DECISIONS_PATH },
  { kind: "Copy", id: "", title: "/factree:spec", context: "start a spec in Claude Code", copy: "/factree:spec " },
];

function highlight(text: string, marks: number[] = []): ReactNode[] {
  const set = new Set(marks);
  return [...text].map((ch, i) => (set.has(i) ? <mark key={i}>{ch}</mark> : ch));
}

export function Palette({ onClose, onGo, initialRecent }: { onClose: () => void; onGo: (href: string, newTab: boolean) => void; initialRecent?: RecentItem[] }) {
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [recent] = useState<RecentItem[]>(() => initialRecent ?? loadRecent());
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetched on every open, so new specs and plans are there at once (R2.S3).
  useEffect(() => {
    inputRef.current?.focus();
    fetch("/api/search", { cache: "no-store" }).then((r) => r.json()).then((x) => setItems(x as SearchItem[])).catch(() => setFailed(true));
  }, []);

  const groups = useMemo(() => (items ? searchItems(items, query) : []), [items, query]);
  const rows: { group: string; row: Row }[] = query.trim()
    ? groups.flatMap((g) => g.items.map((h) => ({ group: g.kind, row: h as Row })))
    : [...recent.map((r) => ({ group: "Recent", row: r as Row })), ...SHORTCUTS.map((r) => ({ group: "Shortcuts", row: r }))];
  const cur = Math.min(sel, Math.max(rows.length - 1, 0));

  const choose = (r: Row, newTab: boolean) => {
    if (r.copy) { void navigator.clipboard?.writeText(r.copy); onClose(); return; }
    if (!r.href) return;
    if (r.id) saveRecent({ kind: r.kind, id: r.id, title: r.title, context: r.context, href: r.href });
    onGo(r.href, newTab);
  };

  let last = "";
  return (
    <div className="palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-label="Search">
        <input ref={inputRef} className="palette-input" placeholder="Search specs, requirements, tasks, decisions…" value={query}
          aria-activedescendant={rows.length ? `pal-${cur}` : undefined}
          onChange={(e) => { setQuery(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            const a = paletteKey(e.key, cur, rows.length, e.metaKey || e.ctrlKey);
            if (a.t === "none") return;
            e.preventDefault();
            if (a.t === "move") setSel(a.to);
            else if (a.t === "close") onClose();
            else if (a.t === "open") choose(rows[cur]!.row, a.newTab);
          }} />
        <ul className="palette-list" role="listbox">
          {failed && <li className="palette-empty">Search unavailable. Is the companion still running?</li>}
          {!failed && query.trim() && items && rows.length === 0 && <li className="palette-empty">Nothing matches “{query}”.</li>}
          {rows.map(({ group, row }, i) => {
            const head = group !== last ? <li key={`h-${group}`} className="palette-group" role="presentation">{group}</li> : null;
            last = group;
            return [head,
              <li key={`${row.kind}-${row.href ?? row.copy}-${i}`} id={`pal-${i}`} role="option" aria-selected={i === cur}
                className={`palette-row${i === cur ? " selected" : ""}`} onMouseEnter={() => setSel(i)} onClick={(e) => choose(row, e.metaKey || e.ctrlKey)}>
                <span className="palette-kind">{row.kind}</span>
                {row.id && <span className="palette-id mono">{row.id}</span>}
                <span className="palette-title">{highlight(row.title, row.marks)}</span>
                <span className="palette-context">{row.context}</span>
              </li>];
          })}
        </ul>
        <div className="palette-foot"><b>↑↓</b> move · <b>Enter</b> open · <b>⌘ Enter</b> new tab · <b>Esc</b> close</div>
      </div>
    </div>
  );
}
