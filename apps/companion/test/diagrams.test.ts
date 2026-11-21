import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiagramFrame } from "../src/components/Diagram.tsx";
import { Blocks } from "../src/components/Blocks.tsx";

describe("plan diagrams", () => {
  it("shows a drawn diagram as an image, source tucked away [plan-diagrams#R5.S1]", () => {
    const h = renderToStaticMarkup(createElement(DiagramFrame, { source: "sequenceDiagram\n  A->>B: hi", svg: "<svg id=\"x\"></svg>", failed: false }));
    expect(h).toContain('role="img" aria-label="sequenceDiagram diagram"><svg id="x"></svg>');
    expect(h).toContain("<summary>Source</summary>");
  });

  it("falls back to the source when it can't draw [plan-diagrams#R5.S2]", () => {
    const h = renderToStaticMarkup(createElement(DiagramFrame, { source: "sequenceDiagram\n  A->>", svg: null, failed: true }));
    expect(h).toContain("Couldn&#x27;t draw this diagram");
    expect(h).toContain("A-&gt;&gt;");
  });

  it("uses the diagram component only for mermaid blocks [plan-diagrams#R5.S3]", () => {
    const plain = renderToStaticMarkup(createElement(Blocks, { blocks: [{ t: "code", lang: "ts", text: "const a = 1;" }] }));
    expect(plain).not.toContain("diagram");
    const mermaid = renderToStaticMarkup(createElement(Blocks, { blocks: [{ t: "code", lang: "mermaid", text: "flowchart LR\n  A --> B" }] }));
    expect(mermaid).toContain("diagram-pending");   // drawn in the browser after the library loads
  });
});
