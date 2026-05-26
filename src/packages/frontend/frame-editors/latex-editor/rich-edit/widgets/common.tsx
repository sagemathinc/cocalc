/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared base components for rich-edit widgets.

`Widget` wraps the rendered content with:
 - an antd `Tooltip` showing the raw LaTeX source (Phase 2 v0.2
   styled hover popover — replaces the native title="" used in v0.1)
 - mouse-enter/leave for a subtle hover hint (light gray background)
 - the mouse-down → onActivate hand-off that drives marker dissolve

Each concrete widget (Textit, Section, …) is a thin wrapper that
picks its own visual style and content but routes through `Widget`
so the source-peek + click behavior is uniform.
*/

import { Tooltip } from "antd";
import { CSSProperties, ReactNode, useState } from "react";

import { COLORS } from "@cocalc/util/theme";

import { WidgetProps } from "../types";

interface WidgetBaseProps extends WidgetProps {
  children: ReactNode;
  /** Extra inline styles merged on top of the hover-background base. */
  style?: CSSProperties;
  /** Override the default `inline-block` if a different display is wanted. */
  display?: CSSProperties["display"];
}

export function Widget({
  descriptor,
  onActivate,
  children,
  style,
  display,
}: WidgetBaseProps) {
  const [hover, setHover] = useState(false);
  return (
    <Tooltip
      title={
        <code
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: "0.9em",
          }}
        >
          {descriptor.source}
        </code>
      }
      placement="top"
      mouseEnterDelay={0.3}
      overlayStyle={{ maxWidth: 400 }}
    >
      <span
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onMouseDown={(e) => {
          // Stop propagation + prevent default so CM doesn't try to
          // place its own cursor (it would fail; see widget-manager
          // comment) and our explicit dissolve runs.
          e.stopPropagation();
          e.preventDefault();
          onActivate();
        }}
        style={{
          display: display ?? "inline",
          cursor: "text",
          background: hover ? COLORS.GRAY_LL : "transparent",
          borderRadius: 2,
          padding: "0 1px",
          ...style,
        }}
      >
        {children}
      </span>
    </Tooltip>
  );
}

/** Inline placeholder shown when a widget's content is empty (e.g. `\textit{}`). */
export function EmptyPlaceholder({ label }: { label: string }) {
  return (
    <span
      style={{
        color: COLORS.GRAY_L,
        fontStyle: "italic",
        fontSize: "0.9em",
      }}
    >
      ({label})
    </span>
  );
}
