/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Document-level widgets: \title \author \date \maketitle \tableofcontents

We don't try to wire \maketitle to the actual \title/\author/\date
values — that would need cross-line document state. Each widget
renders independently:
  \title{X}    → big bold inline preview
  \author{X}   → italic
  \date{X}     → small-gray
  \maketitle   → neutral chip "Title block"
  \tableofcontents → neutral chip "Table of contents"
*/

import { COLORS } from "@cocalc/util/theme";

import { WidgetProps } from "../types";
import { EmptyPlaceholder, Widget } from "./common";

function contentOf(props: WidgetProps): string {
  return (props.descriptor.payload?.content as string | undefined) ?? "";
}

const NEUTRAL_CHIP_STYLE = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 4,
  background: `var(--cocalc-bg-elevated, ${COLORS.GRAY_LL})`,
  color: `var(--cocalc-text-secondary, ${COLORS.GRAY_D})`,
  fontFamily: "sans-serif",
  fontSize: "0.85em",
  fontWeight: 500,
  border: `1px dashed var(--cocalc-border-light, ${COLORS.GRAY_L})`,
  letterSpacing: "0.02em",
} as const;

export function Title(props: WidgetProps) {
  const text = contentOf(props);
  return (
    <Widget {...props}>
      {text === "" ? (
        <EmptyPlaceholder label="empty title" />
      ) : (
        <span
          style={{
            fontSize: "1.6em",
            fontWeight: 700,
            color: `var(--cocalc-text-primary, ${COLORS.GRAY_DD})`,
          }}
        >
          {text}
        </span>
      )}
    </Widget>
  );
}

export function Author(props: WidgetProps) {
  const text = contentOf(props);
  return (
    <Widget {...props}>
      {text === "" ? (
        <EmptyPlaceholder label="empty author" />
      ) : (
        <span
          style={{
            fontStyle: "italic",
            color: `var(--cocalc-text-secondary, ${COLORS.GRAY_D})`,
          }}
        >
          {text}
        </span>
      )}
    </Widget>
  );
}

export function DateWidget(props: WidgetProps) {
  const text = contentOf(props);
  return (
    <Widget {...props}>
      {text === "" ? (
        <EmptyPlaceholder label="empty date" />
      ) : (
        <span
          style={{
            color: `var(--cocalc-text-tertiary, ${COLORS.GRAY})`,
            fontSize: "0.95em",
          }}
        >
          {text}
        </span>
      )}
    </Widget>
  );
}

export function Maketitle(props: WidgetProps) {
  return (
    <Widget {...props}>
      <span style={NEUTRAL_CHIP_STYLE}>Title block</span>
    </Widget>
  );
}

export function Tableofcontents(props: WidgetProps) {
  return (
    <Widget {...props}>
      <span style={NEUTRAL_CHIP_STYLE}>Table of contents</span>
    </Widget>
  );
}
