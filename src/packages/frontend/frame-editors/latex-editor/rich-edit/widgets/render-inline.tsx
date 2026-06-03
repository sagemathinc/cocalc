/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Recursive inline renderer.

Text-style widgets (\textbf, \textit, …) and a few others render their
*content* through `renderInline` so that NESTED constructs render too:
`\textbf{bold \textit{italic} $x^2$}` shows a bold run containing an
italic run and a KaTeX formula, instead of the inner LaTeX as literal
text.

This is purely presentational — it produces styled spans / KaTeX, with
NO `Widget` wrapper (no tooltip, no per-node click-to-dissolve). Clicks
bubble up to the OUTER widget's `Widget` wrapper, so activating any part
of a nested construct dissolves the whole construct to raw source, which
matches the "whole construct" edit-zone behavior.

It reuses the same `parseLines` scanner the widget-manager uses, so the
set of recognized constructs stays in sync automatically. Anything the
parser doesn't recognize (or any type without an explicit presentational
mapping below) falls back to its raw source text.
*/

import {
  CSSProperties,
  ElementType,
  Fragment,
  ReactNode,
  useContext,
} from "react";

import mathToHtml from "@cocalc/frontend/misc/math-to-html";
import { COLORS } from "@cocalc/util/theme";

import { FONT_SIZE_EM } from "../font-size";
import { MathMacrosContext } from "../math-macros-context";
import { LineSource, parseLines } from "../parser";
import { WidgetDescriptor, WidgetType } from "../types";

/** Presentational tag + style for the simple wrap-content commands. */
const STYLE_TAGS: Partial<
  Record<WidgetType, { tag: ElementType; style?: CSSProperties }>
> = {
  textbf: { tag: "strong", style: { fontWeight: 700 } },
  textit: { tag: "em", style: { fontStyle: "italic" } },
  emph: { tag: "em", style: { fontStyle: "italic" } },
  underline: { tag: "u", style: { textDecoration: "underline" } },
  texttt: { tag: "code", style: { fontFamily: "monospace" } },
  textsc: { tag: "span", style: { fontVariant: "small-caps" } },
  textsf: { tag: "span", style: { fontFamily: "sans-serif" } },
  textrm: { tag: "span" },
  textsuperscript: { tag: "sup" },
  textsubscript: { tag: "sub" },
  sout: { tag: "s" },
};

function contentOf(d: WidgetDescriptor): string {
  return (d.payload?.content as string | undefined) ?? "";
}

function InlineMath({
  source,
  isInline,
  raw,
}: {
  source: string;
  isInline: boolean;
  raw: string;
}) {
  const macros = useContext(MathMacrosContext);
  if (source.trim() === "") return null;
  const { __html, err } = mathToHtml(source, isInline, macros);
  if (err) {
    // Fall back to the raw LaTeX rather than a "?math?" marker.
    return (
      <span title={err} style={{ whiteSpace: "pre-wrap" }}>
        {raw}
      </span>
    );
  }
  return <span dangerouslySetInnerHTML={{ __html }} />;
}

/** Render a single descriptor presentationally (no Widget wrapper). */
function renderDescriptor(d: WidgetDescriptor, key: number): ReactNode {
  const styled = STYLE_TAGS[d.type];
  if (styled != null) {
    const Tag = styled.tag;
    return (
      <Tag key={key} style={styled.style}>
        {renderInline(contentOf(d))}
      </Tag>
    );
  }
  switch (d.type) {
    case "textcolor": {
      const color = (d.payload?.arg1 as string | undefined) ?? "";
      const text = (d.payload?.arg2 as string | undefined) ?? "";
      return (
        <span key={key} style={{ color: color || undefined }}>
          {renderInline(text)}
        </span>
      );
    }
    case "hl":
      return (
        <mark
          key={key}
          style={{ background: COLORS.YELL_LL, color: COLORS.GRAY_DD, padding: "0 2px" }}
        >
          {renderInline(contentOf(d))}
        </mark>
      );
    case "font-size": {
      const sizeName = (d.payload?.sizeName as string | undefined) ?? "";
      const em = FONT_SIZE_EM[sizeName] ?? 1;
      return (
        <span key={key} style={{ fontSize: `${em}em` }}>
          {renderInline(contentOf(d))}
        </span>
      );
    }
    case "math-inline":
      return (
        <InlineMath
          key={key}
          source={contentOf(d)}
          isInline={true}
          raw={d.source}
        />
      );
    case "math-display":
      return (
        <InlineMath
          key={key}
          source={contentOf(d)}
          isInline={false}
          raw={d.source}
        />
      );
    default:
      // Unknown / non-inline construct — keep the raw source so nothing
      // is lost (same as the pre-recursive behavior).
      return <Fragment key={key}>{d.source}</Fragment>;
  }
}

/**
 * Render LaTeX text inline, expanding recognized constructs into styled
 * React nodes and leaving everything else as plain text. Returns the
 * input string unchanged when nothing is recognized (the common base
 * case for recursion).
 */
export function renderInline(text: string): ReactNode {
  if (text === "") return null;
  const lines = text.split("\n");
  const src: LineSource = {
    getLine: (n) => lines[n] ?? "",
    lineCount: () => lines.length,
  };
  const ds = parseLines(src, 0, lines.length);
  if (ds.length === 0) return text;

  // Absolute offset of each line start, so (line, ch) positions can be
  // sliced out of the flat `text` (with `\n` between lines).
  const lineStart: number[] = [];
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStart[i] = acc;
    acc += lines[i].length + 1; // +1 for the joining "\n"
  }
  const offset = (p: { line: number; ch: number }) => lineStart[p.line] + p.ch;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const d of ds) {
    const s = offset(d.from);
    const e = offset(d.to);
    if (s > cursor) nodes.push(text.slice(cursor, s));
    nodes.push(renderDescriptor(d, key++));
    cursor = e;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
