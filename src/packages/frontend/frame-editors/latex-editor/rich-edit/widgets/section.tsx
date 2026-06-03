/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sectioning widgets: \part \chapter \section \subsection \subsubsection
\paragraph \subparagraph

We don't compute section numbers (would need preamble + earlier-section
state). Headings render bold, sized by level; starred (`\section*{…}`)
gets the same styling — the starred status is implicit in the source
and visible on hover.

`\paragraph` and `\subparagraph` are LaTeX "run-in" headings: they
embed in a paragraph rather than starting a new block. We render
them inline-bold rather than as a block heading to mirror the typeset
behavior.
*/

import { CSSProperties } from "react";

import { WidgetProps } from "../types";
import { EmptyPlaceholder, Widget } from "./common";
import { renderInline } from "./render-inline";

function contentOf(props: WidgetProps): string {
  return (props.descriptor.payload?.content as string | undefined) ?? "";
}

interface HeadingProps {
  emptyLabel: string;
  fontSize: string;
  /** "block" renders as a full-line heading; "inline" for paragraph/subparagraph. */
  block: boolean;
  italic?: boolean;
}

function Heading({
  emptyLabel,
  fontSize,
  block,
  italic,
  ...props
}: WidgetProps & HeadingProps) {
  const text = contentOf(props);
  const style: CSSProperties = {
    fontSize,
    fontWeight: 700,
    fontStyle: italic ? "italic" : undefined,
    display: block ? "inline-block" : "inline",
    // Block-ish headings get a small left/right margin so they sit
    // visually distinct from preceding text, without breaking the
    // CM line layout (which is inherently single-line per CM line).
    margin: block ? "0 4px 0 0" : "0",
  };
  return (
    <Widget {...props}>
      {text === "" ? (
        <EmptyPlaceholder label={emptyLabel} />
      ) : (
        <span style={style}>{renderInline(text)}</span>
      )}
    </Widget>
  );
}

export function Part(props: WidgetProps) {
  return <Heading {...props} emptyLabel="empty part" fontSize="1.7em" block />;
}

export function Chapter(props: WidgetProps) {
  return (
    <Heading {...props} emptyLabel="empty chapter" fontSize="1.5em" block />
  );
}

export function Section(props: WidgetProps) {
  return (
    <Heading {...props} emptyLabel="empty section" fontSize="1.35em" block />
  );
}

export function Subsection(props: WidgetProps) {
  return (
    <Heading {...props} emptyLabel="empty subsection" fontSize="1.2em" block />
  );
}

export function Subsubsection(props: WidgetProps) {
  return (
    <Heading
      {...props}
      emptyLabel="empty subsubsection"
      fontSize="1.08em"
      block
    />
  );
}

export function Paragraph(props: WidgetProps) {
  // Run-in heading — bold, normal size, inline.
  return (
    <Heading
      {...props}
      emptyLabel="empty paragraph"
      fontSize="1em"
      block={false}
    />
  );
}

export function Subparagraph(props: WidgetProps) {
  // Run-in heading — bold italic, normal size, inline.
  return (
    <Heading
      {...props}
      emptyLabel="empty subparagraph"
      fontSize="1em"
      block={false}
      italic
    />
  );
}
