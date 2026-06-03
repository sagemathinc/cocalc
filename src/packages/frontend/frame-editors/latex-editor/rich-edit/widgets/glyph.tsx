/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Zero-arg typographic glyph widgets:
  \TeX    -> TₑX (lowered E)
  \LaTeX  -> LᵃTₑX (raised lowercase A + lowered E, smaller A)

These are the classic Knuth/Lamport logo treatments. We approximate
them with inline CSS — translateY for the lowered E, scale + translate
for the raised A in \LaTeX. The result is recognizable in both light
and dark themes since we only use relative positioning, not colors.

Notes
-----
- `\TeXe` / `\LaTeXe` and similar suffixed forms do NOT match (the
  parser's zero-arg scanner requires a non-letter after the command
  name). LaTeX2e proper is `\LaTeXe` which would need its own entry
  if we ever care.
- Both render inside the `Widget` wrapper, so hover shows the raw
  source and click dissolves the marker — same UX as every other
  widget.
*/

import { CSSProperties } from "react";

import { WidgetProps } from "../types";
import { Widget } from "./common";

// Slightly smaller, slightly raised — matches Knuth's logo treatment.
const TEX_E_STYLE: CSSProperties = {
  display: "inline-block",
  textTransform: "uppercase",
  verticalAlign: -0.22 + "em",
  marginLeft: "-0.1667em",
  marginRight: "-0.125em",
};

// Lamport's \LaTeX kerns the A up and slightly left of the T.
const LATEX_A_STYLE: CSSProperties = {
  display: "inline-block",
  fontSize: "0.7em",
  verticalAlign: "0.3em",
  marginLeft: "-0.36em",
  marginRight: "-0.15em",
  textTransform: "uppercase",
};

const LOGO_STYLE: CSSProperties = {
  fontFamily: "serif",
  letterSpacing: 0,
};

export function TexGlyph(props: WidgetProps) {
  return (
    <Widget {...props}>
      <span style={LOGO_STYLE}>
        T<span style={TEX_E_STYLE}>e</span>X
      </span>
    </Widget>
  );
}

export function LatexGlyph(props: WidgetProps) {
  return (
    <Widget {...props}>
      <span style={LOGO_STYLE}>
        L<span style={LATEX_A_STYLE}>a</span>T<span style={TEX_E_STYLE}>e</span>
        X
      </span>
    </Widget>
  );
}
