import type { ReactNode } from "react";
import type { Block } from "../../shared/types.ts";
import { Inline } from "./bits.tsx";
import { Diagram } from "./Diagram.tsx";

// Plan markdown, already split into blocks by the server (plan-view R4). Text goes through Inline,
// so IDs, paths and links in it resolve; mermaid blocks are drawn as diagrams (plan-diagrams R5).
export function Blocks({ blocks, anchors }: { blocks: Block[]; anchors?: (text: string) => string | undefined }) {
  return <>{blocks.map((b, i) => <BlockView key={i} b={b} anchors={anchors} />)}</>;
}

function BlockView({ b, anchors }: { b: Block; anchors?: (text: string) => string | undefined }) {
  switch (b.t) {
    case "p": return <p className="md-p"><Inline text={b.text} /></p>;
    case "h": return <h4 className="md-h"><Inline text={b.text} /></h4>;
    case "code": return b.lang === "mermaid"
      ? <Diagram source={b.text} />
      : <pre className="md-code" data-lang={b.lang || undefined}><code>{b.text}</code></pre>;
    case "table":
      return (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead><tr>{b.head.map((h, i) => <th key={i}><Inline text={h} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Inline text={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case "list": {
      const items = b.items.map((it, i) => {
        const id = anchors?.(it.text);
        return (
          <li key={i} id={id} className={it.done === undefined ? undefined : it.done ? "check done" : "check"}>
            {it.done !== undefined && <span className="tick" aria-hidden="true">{it.done ? "✓" : ""}</span>}
            {it.done !== undefined && <span className="sr-only">{it.done ? "Done: " : "To do: "}</span>}
            <div className="li-body">{itemBody(it.text)}</div>
          </li>
        );
      });
      return b.ordered ? <ol className="md-list">{items}</ol> : <ul className="md-list">{items}</ul>;
    }
  }
}

// A list item can carry indented lines and fenced code (a task step with its test names).
function itemBody(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*```(\S*)/.exec(lines[i] ?? "");
    if (fence) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i] ?? ""); i++) body.push(lines[i] ?? "");
      out.push(<pre key={i} className="md-code"><code>{body.join("\n")}</code></pre>);
      continue;
    }
    const line = (lines[i] ?? "").trim();
    if (line) out.push(<span key={i} className="li-line"><Inline text={line} /></span>);
  }
  return out;
}
