/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
CustomMacro — the catch-all chip for unknown `\cmd{…}` patterns the
parser finds that aren't in any explicit widget allowlist. Renders
a neutral chip with the command name plus a one-line excerpt of the
content; the full source is visible on hover via the Widget wrapper.

Rationale
---------
Before this widget, any `\foo{some content}` chunk the user wrote
that the parser didn't recognize stayed as raw LaTeX in the middle
of an otherwise rendered document. The visual noise made Rich mode
feel inconsistent. A neutral chip is enough to:
  - signal "this is a macro call, not prose"
  - let the user click to dissolve and edit the source
  - leave the content readable on hover

It does NOT try to interpret the macro. We have no idea what
`\foo{x}` should look like.
*/

import { COLORS } from "@cocalc/util/theme";

import { WidgetProps } from "../types";
import { Widget } from "./common";

const CHIP_STYLE = {
  display: "inline-block",
  padding: "0 6px",
  borderRadius: 3,
  background: `var(--cocalc-bg-elevated, ${COLORS.GRAY_LL})`,
  color: `var(--cocalc-text-secondary, ${COLORS.GRAY_D})`,
  fontSize: "0.85em",
  fontFamily: "sans-serif",
  border: `1px solid var(--cocalc-border-light, ${COLORS.GRAY_L})`,
  verticalAlign: "baseline",
} as const;

const NAME_STYLE = {
  fontFamily: "monospace",
  fontWeight: 600,
  color: `var(--cocalc-link, ${COLORS.BS_BLUE_TEXT})`,
  marginRight: 4,
} as const;

const CONTENT_STYLE = {
  fontStyle: "italic",
  color: `var(--cocalc-text-tertiary, ${COLORS.GRAY})`,
  // Keep the chip compact — long content gets truncated with
  // ellipsis. The full source is visible on hover via the Widget
  // wrapper's Tooltip.
  maxWidth: 240,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  display: "inline-block",
  verticalAlign: "bottom",
} as const;

export function CustomMacro(props: WidgetProps) {
  const cmdName =
    (props.descriptor.payload?.cmdName as string | undefined) ?? "?";
  const content =
    (props.descriptor.payload?.content as string | undefined) ?? "";
  return (
    <Widget {...props}>
      <span style={CHIP_STYLE}>
        <span style={NAME_STYLE}>{cmdName}</span>
        {content !== "" && <span style={CONTENT_STYLE}>{content}</span>}
      </span>
    </Widget>
  );
}
