import { useEffect, useId, useState } from "react";

// A Mermaid diagram in a plan (plan-diagrams R5). The library is imported on first use, so pages
// without diagrams never download it (R5.S3); a diagram it can't draw falls back to its source (R5.S2).

type Mermaid = typeof import("mermaid")["default"];
let loading: Promise<Mermaid> | null = null;

function loadMermaid(): Promise<Mermaid> {
  loading ??= import("mermaid").then(({ default: m }) => {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    m.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: "base",
      fontFamily: v("--font"),
      themeVariables: {
        darkMode: true,
        background: v("--surface"),
        primaryColor: v("--surface-2"),
        primaryBorderColor: v("--faint"),
        primaryTextColor: v("--text"),
        secondaryColor: v("--bg"),
        tertiaryColor: v("--bg-sunk"),
        lineColor: v("--muted"),
        textColor: v("--text-2"),
        noteBkgColor: v("--surface-2"),
        noteTextColor: v("--text-2"),
        actorBkg: v("--surface-2"),
        actorBorder: v("--faint"),
        actorTextColor: v("--text"),
        signalColor: v("--muted"),
        signalTextColor: v("--text-2"),
        labelBoxBkgColor: v("--surface-2"),
        labelTextColor: v("--text-2"),
      },
    });
    return m;
  });
  return loading;
}

export function Diagram({ source }: { source: string }) {
  const id = `d${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setSvg(null);
    setFailed(false);
    loadMermaid()
      .then((m) => m.render(id, source))
      .then((r) => { if (live) setSvg(r.svg); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id, source]);
  return <DiagramFrame source={source} svg={svg} failed={failed} />;
}

/** What a diagram shows in each state: drawing, drawn or couldn't be drawn. */
export function DiagramFrame({ source, svg, failed }: { source: string; svg: string | null; failed: boolean }) {
  const kind = source.trim().split(/\s/)[0] ?? "diagram";
  if (failed) {
    return (
      <div className="diagram failed">
        <span className="flag">Couldn't draw this diagram</span>
        <pre className="md-code"><code>{source}</code></pre>
      </div>
    );
  }
  if (!svg) return <pre className="md-code diagram-pending" aria-busy="true"><code>{source}</code></pre>;
  return (
    <figure className="diagram">
      {/* Mermaid's own SVG, rendered with securityLevel "strict" from the plan's text. */}
      <div role="img" aria-label={`${kind} diagram`} dangerouslySetInnerHTML={{ __html: svg }} />
      <details><summary>Source</summary><pre className="md-code"><code>{source}</code></pre></details>
    </figure>
  );
}
