/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
SpikeBadge — the Phase 2.0 dev/debug widget. Replaces `<<SPIKE>>` /
`<<SPIKE:label>>` tokens with a small pill-shaped badge. Retained
across Phase 2 because it's a convenient stress-test for the marker-
manager (multi-on-line, adjacent, hover behavior, etc.) without
needing real LaTeX content.

UX contract: hover turns the badge green; mouse-down dissolves the
marker and places the cursor inside the (now-visible) source. See
the marker-manager comment for why mouse-down is the right hook.
*/

import { useState } from "react";

import { COLORS } from "@cocalc/util/theme";

import { WidgetProps } from "../types";

export function SpikeBadge({ descriptor, onActivate }: WidgetProps) {
  const [hover, setHover] = useState(false);
  const label = (descriptor.payload?.label as string | undefined) ?? "";
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onActivate();
      }}
      title={descriptor.source}
      style={{
        display: "inline-block",
        padding: "0 6px",
        margin: "0 1px",
        borderRadius: 4,
        background: hover ? COLORS.BS_GREEN : COLORS.GRAY_LL,
        color: hover ? "white" : COLORS.GRAY_D,
        fontFamily: "sans-serif",
        fontSize: "0.85em",
        fontWeight: 600,
        userSelect: "none",
        cursor: "text",
        verticalAlign: "baseline",
      }}
    >
      SPIKE{label ? `:${label}` : ""}
    </span>
  );
}
