/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared types for the LaTeX rich-edit widget engine.

A WidgetDescriptor is the pure-data product of the parser: it
describes a LaTeX construct found in the buffer (its type, its byte
range, the raw source, and any type-specific payload). The
widget-manager turns descriptors into CodeMirror TextMarkers backed
by React-rendered DOM hosts.

The parser, widget-manager, and individual widget components share
these types so that adding a new widget type is just: extend
`WidgetType`, write a scanner for it in `parser.ts`, write a renderer
component, and register it in `widget-renderer.tsx`. TypeScript's
`Record<WidgetType, ...>` enforces that every type is wired up.
*/

import * as CodeMirror from "codemirror";

export type WidgetType =
  // Text style (Phase 3)
  | "textit"
  | "textbf"
  | "emph"
  | "underline"
  | "texttt"
  | "textsc"
  | "textsf"
  | "textrm"
  | "textcolor"
  | "textsuperscript"
  | "textsubscript"
  // Sectioning (Phase 3)
  | "part"
  | "chapter"
  | "section"
  | "subsection"
  | "subsubsection"
  | "paragraph"
  | "subparagraph"
  // Links (Phase 3)
  | "href"
  | "url"
  // Verbatim (Phase 3 — inline only; multi-line verbatim env is Phase 5)
  | "verb"
  // Math (Phase 4)
  | "math-inline" // $…$, \(…\)
  | "math-display" // \[…\], $$…$$ (single-line)
  | "math-env" // \begin{equation|align|gather|multline}…\end{…} (+ starred)
  // Lists (Phase 5)
  | "list-env-begin" // \begin{itemize|enumerate|description}
  | "list-env-end" // \end{itemize|enumerate|description}
  | "list-item" // \item or \item[Label] inside one of the list envs
  // Verbatim env (Phase 5 — same env scanner as lists)
  | "verbatim-env" // \begin{verbatim|Verbatim}…\end{…}
  // Tier 2 single-arg commands (Phase 6)
  | "footnote" // \footnote{…}
  | "ref" // \ref{…}
  | "cite" // \cite{…}
  | "label" // \label{…}
  | "caption" // \caption{…}
  | "sout" // \sout{…} (ulem)
  | "hl" // \hl{…} (soul)
  // Prose-env begin/end markers (Phase 6.3) — abstract + theorem
  // family. Emitted as narrow begin/end chips (NOT a covering range)
  // so inner widgets (math, textbf, lists, etc.) inside the body
  // continue to render normally via the regular widget pipeline.
  | "prose-env-begin"
  | "prose-env-end"
  // Code-listing env (Phase 6) — body is raw code, so we DO emit a
  // covering descriptor here and subsume inner widgets.
  | "code-listing-env" // \begin{lstlisting|minted}…\end{…}
  // Document-level (Phase 6.2)
  | "title" // \title{…}
  | "author" // \author{…}
  | "date" // \date{…}
  | "maketitle" // \maketitle (zero-arg)
  | "tableofcontents" // \tableofcontents (zero-arg)
  // Graphics (Phase 6.2)
  | "includegraphics" // \includegraphics[opts]{path}
  // Glyph commands (Phase 6.3) — zero-arg, render as typographic logos
  | "tex-glyph" // \TeX
  | "latex-glyph" // \LaTeX
  // Structural / spacing zero-arg commands (Phase 6.3):
  // \newpage, \clearpage, \pagebreak, \linebreak,
  // \bigskip, \medskip, \smallskip.
  // (`\\` and `\noindent` deliberately stay as raw source — see
  // parser's ZERO_ARG_COMMANDS comment.)
  | "structural-command"
  // Catch-all fallback for unknown `\cmd{…}` not in any allowlist
  // (Phase 6.3) — neutral chip showing the command name, body in
  // the tooltip.
  | "custom-macro"
  // Tabular env (Phase 6.3) — fail-open parser: emitted only when
  // the colspec parses cleanly and every row's cell count matches.
  | "tabular-env";

export interface WidgetDescriptor {
  type: WidgetType;
  from: CodeMirror.Position;
  to: CodeMirror.Position;
  /** The exact source text the marker covers (for hover-source + match invariants). */
  source: string;
  /** Type-specific parsed payload (e.g., the inner content of a brace-balanced command). */
  payload?: Record<string, unknown>;
}

/** Props every widget component receives. */
export interface WidgetProps {
  descriptor: WidgetDescriptor;
  /**
   * Called when the user activates (mouse-down) the widget. The
   * widget-manager wires this to: clear the marker, place CM cursor
   * at the (now-visible) source's left edge, focus the editor.
   */
  onActivate: () => void;
  /**
   * Math widgets only: called when the user clicks the trailing AI
   * pencil. The widget-manager wires this to open the existing
   * `ai_gen_formula` dialog with the marker's current source, then
   * replace the marker range with the result. Non-math widgets
   * leave this undefined.
   */
  onAiEdit?: () => Promise<void> | void;
}
