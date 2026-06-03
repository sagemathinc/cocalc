/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Inline text-style widgets:
  \textit \textbf \emph \underline \texttt \textsc \textsf \textrm \textcolor
  \textsuperscript \textsubscript

Nested constructs inside a text-style command (e.g. `\textbf{\emph{x}}`,
`\textbf{a $x^2$ b}`) render recursively via `renderInline`.

Limitations (Phase 3):
 - `\textrm` is "roman, the default" — we don't apply any visible style
   change, but the widget still wraps so hover-source + click work.
 - `\emph` always renders italic; LaTeX's context-aware toggle (italic
   inside roman, roman inside italic) is ignored.
 - `\textsuperscript` and `\textsubscript` always render via `<sup>` /
   `<sub>`. LaTeX's math-vs-text-mode distinction isn't honored —
   inside a math widget, the user writes `^{…}` / `_{…}` anyway, so
   in practice these only appear in text mode.
*/

import { CSSProperties } from "react";

import { WidgetProps } from "../types";
import { EmptyPlaceholder, Widget } from "./common";
import { renderInline } from "./render-inline";

function contentOf(props: WidgetProps): string {
  return (props.descriptor.payload?.content as string | undefined) ?? "";
}

function StyledContent({
  text,
  emptyLabel,
  style,
  as,
}: {
  text: string;
  emptyLabel: string;
  style?: CSSProperties;
  as?: "em" | "strong" | "span" | "u" | "sup" | "sub";
}) {
  const Tag = as ?? "span";
  if (text === "") return <EmptyPlaceholder label={emptyLabel} />;
  // Render content recursively so nested constructs (e.g.
  // `\textbf{a \textit{b}}`, inline math) render too.
  return <Tag style={style}>{renderInline(text)}</Tag>;
}

export function Textit(props: WidgetProps) {
  return (
    <Widget {...props}>
      <StyledContent
        text={contentOf(props)}
        emptyLabel="empty italic"
        style={{ fontStyle: "italic" }}
        as="em"
      />
    </Widget>
  );
}

export function Textbf(props: WidgetProps) {
  return (
    <Widget {...props}>
      <StyledContent
        text={contentOf(props)}
        emptyLabel="empty bold"
        style={{ fontWeight: 700 }}
        as="strong"
      />
    </Widget>
  );
}

export function Emph(props: WidgetProps) {
  return (
    <Widget {...props}>
      <StyledContent
        text={contentOf(props)}
        emptyLabel="empty emph"
        style={{ fontStyle: "italic" }}
        as="em"
      />
    </Widget>
  );
}

export function Underline(props: WidgetProps) {
  return (
    <Widget {...props}>
      <StyledContent
        text={contentOf(props)}
        emptyLabel="empty underline"
        style={{ textDecoration: "underline" }}
        as="u"
      />
    </Widget>
  );
}

export function Texttt(props: WidgetProps) {
  return (
    <Widget {...props}>
      <StyledContent
        text={contentOf(props)}
        emptyLabel="empty monospace"
        style={{ fontFamily: "monospace" }}
      />
    </Widget>
  );
}

export function Textsc(props: WidgetProps) {
  return (
    <Widget {...props}>
      <StyledContent
        text={contentOf(props)}
        emptyLabel="empty small-caps"
        style={{ fontVariant: "small-caps" }}
      />
    </Widget>
  );
}

export function Textsf(props: WidgetProps) {
  return (
    <Widget {...props}>
      <StyledContent
        text={contentOf(props)}
        emptyLabel="empty sans-serif"
        style={{ fontFamily: "sans-serif" }}
      />
    </Widget>
  );
}

export function Textrm(props: WidgetProps) {
  // \textrm = roman, the editor's default font. We don't visually
  // change anything (would be redundant with the surrounding text)
  // but the widget still wraps so hover-source + click work.
  return (
    <Widget {...props}>
      <StyledContent text={contentOf(props)} emptyLabel="empty roman" />
    </Widget>
  );
}

export function Textsuperscript(props: WidgetProps) {
  return (
    <Widget {...props}>
      <StyledContent
        text={contentOf(props)}
        emptyLabel="empty superscript"
        as="sup"
      />
    </Widget>
  );
}

export function Textsubscript(props: WidgetProps) {
  return (
    <Widget {...props}>
      <StyledContent
        text={contentOf(props)}
        emptyLabel="empty subscript"
        as="sub"
      />
    </Widget>
  );
}

export function Textcolor(props: WidgetProps) {
  const color = (props.descriptor.payload?.arg1 as string | undefined) ?? "";
  const text = (props.descriptor.payload?.arg2 as string | undefined) ?? "";
  // Trust common color names + hex literals (e.g. `red`, `#ff0000`,
  // `rgb(...)`). LaTeX color names like `gray!50` won't render as CSS;
  // those fall through to the default color (whatever the surrounding
  // text uses) and the user can hover to see the source.
  return (
    <Widget {...props}>
      <StyledContent
        text={text}
        emptyLabel={`empty ${color || "color"}`}
        style={{ color: color || undefined }}
      />
    </Widget>
  );
}
