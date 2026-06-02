/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Dispatch from WidgetDescriptor.type to the React component that
renders it.

Adding a new widget type:
 1. Extend `WidgetType` in `types.ts`.
 2. Add a scanner to `parser.ts`.
 3. Write the widget component in `widgets/…`.
 4. Register the component in the `WIDGETS` record below.

TypeScript's `Record<WidgetType, …>` enforces that every type has a
component — forget step 4 and the build fails.
*/

import { Component, ComponentType, ReactElement, ReactNode } from "react";

import { WidgetDescriptor, WidgetProps, WidgetType } from "./types";
import {
  Author,
  DateWidget,
  Maketitle,
  Tableofcontents,
  Title,
} from "./widgets/document";
import { CustomMacro } from "./widgets/custom-macro";
import { LatexGlyph, TexGlyph } from "./widgets/glyph";
import { Includegraphics } from "./widgets/includegraphics";
import { Href, Url } from "./widgets/link";
import { ListEnvBegin, ListEnvEnd, ListItem } from "./widgets/list";
import { MathDisplay, MathEnv, MathInline } from "./widgets/math";
import {
  Caption,
  Cite,
  CodeListingEnv,
  Footnote,
  Hl,
  Label,
  ProseEnvBegin,
  ProseEnvEnd,
  Ref,
  Sout,
} from "./widgets/tier2";
import {
  Chapter,
  Paragraph,
  Part,
  Section,
  Subparagraph,
  Subsection,
  Subsubsection,
} from "./widgets/section";
import { StructuralCommand } from "./widgets/structural";
import { TabularEnv } from "./widgets/tabular";
import {
  Emph,
  Textbf,
  Textcolor,
  Textit,
  Textrm,
  Textsc,
  Textsf,
  Textsubscript,
  Textsuperscript,
  Texttt,
  Underline,
} from "./widgets/text-style";
import { Verb, VerbatimEnv } from "./widgets/verbatim";

const WIDGETS: Record<WidgetType, ComponentType<WidgetProps>> = {
  // text style
  textit: Textit,
  textbf: Textbf,
  emph: Emph,
  underline: Underline,
  texttt: Texttt,
  textsc: Textsc,
  textsf: Textsf,
  textrm: Textrm,
  textcolor: Textcolor,
  textsuperscript: Textsuperscript,
  textsubscript: Textsubscript,
  // sectioning
  part: Part,
  chapter: Chapter,
  section: Section,
  subsection: Subsection,
  subsubsection: Subsubsection,
  paragraph: Paragraph,
  subparagraph: Subparagraph,
  // links
  href: Href,
  url: Url,
  // verbatim (inline + env)
  verb: Verb,
  "verbatim-env": VerbatimEnv,
  // math
  "math-inline": MathInline,
  "math-display": MathDisplay,
  "math-env": MathEnv,
  // lists
  "list-env-begin": ListEnvBegin,
  "list-env-end": ListEnvEnd,
  "list-item": ListItem,
  // Tier 2 inline
  footnote: Footnote,
  ref: Ref,
  cite: Cite,
  label: Label,
  caption: Caption,
  sout: Sout,
  hl: Hl,
  // Prose envs (abstract + theorem family) — narrow begin/end
  // markers, body renders with its normal inner widgets.
  "prose-env-begin": ProseEnvBegin,
  "prose-env-end": ProseEnvEnd,
  // Code listings — covering widget; body is raw code.
  "code-listing-env": CodeListingEnv,
  // Document-level
  title: Title,
  author: Author,
  date: DateWidget,
  maketitle: Maketitle,
  tableofcontents: Tableofcontents,
  // Graphics
  includegraphics: Includegraphics,
  // Glyphs
  "tex-glyph": TexGlyph,
  "latex-glyph": LatexGlyph,
  // Structural / spacing
  "structural-command": StructuralCommand,
  // Catch-all fallback
  "custom-macro": CustomMacro,
  // Tabular
  "tabular-env": TabularEnv,
};

/**
 * Widget types that get the trailing AI-edit pencil. Only math
 * widgets today; future widgets that want AI editing can be added
 * here. Used by the widget-manager to decide whether to set up the
 * onAiEdit closure.
 */
export const AI_EDITABLE_TYPES: ReadonlySet<WidgetType> = new Set<WidgetType>([
  "math-inline",
  "math-display",
  "math-env",
]);

/**
 * Contains a render-time throw in a single widget so one bad construct
 * can't blank its host. On error we fall back to the raw LaTeX source
 * as plain text (clickable, so the user can still dissolve/edit it).
 * Each widget mounts in its own React root, so the blast radius is one
 * widget regardless — this just makes the failure legible instead of
 * an empty span.
 */
class WidgetErrorBoundary extends Component<
  { source: string; onActivate: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <span
          title={this.props.source}
          style={{ fontFamily: "monospace", cursor: "text" }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            this.props.onActivate();
          }}
        >
          {this.props.source}
        </span>
      );
    }
    return this.props.children;
  }
}

export function renderWidget(
  descriptor: WidgetDescriptor,
  onActivate: () => void,
  onAiEdit: WidgetProps["onAiEdit"],
): ReactElement {
  const WidgetComponent = WIDGETS[descriptor.type];
  return (
    <WidgetErrorBoundary source={descriptor.source} onActivate={onActivate}>
      <WidgetComponent
        descriptor={descriptor}
        onActivate={onActivate}
        onAiEdit={onAiEdit}
      />
    </WidgetErrorBoundary>
  );
}
