/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Small reusable UI components for the coding agent panel.
Extracted to keep the main CodingAgentCore component focused.
*/

import { useEffect, useRef } from "react";

import { COLORS } from "@cocalc/util/theme";

/**
 * Find the closest ancestor with `overflowY` set to "auto" or "scroll".
 * Returns `null` when nothing scrollable is found before `<body>`.
 */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let cur = el.parentElement;
  while (cur && cur !== document.body) {
    const ov = getComputedStyle(cur).overflowY;
    if (ov === "auto" || ov === "scroll") return cur;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Wraps rendered markdown so that `pre` blocks (diffs, code) are
 * compact by default and scrollable within a max-height.
 *
 * @param maxHeight  Fixed pixel cap for `<pre>` blocks.
 *   When omitted, the component auto-computes 75 % of the nearest
 *   scrollable ancestor's height — ideal for diff blocks that the
 *   user needs to review.
 */
export function CollapsibleDiffs({
  children,
  maxHeight,
  color,
  fontSize,
}: {
  children: React.ReactNode;
  /** Fixed pixel cap. When omitted, 75 % of the scroll container. */
  maxHeight?: number;
  /** Optional text color for the rendered `<pre>` and its descendants. */
  color?: string;
  /** Optional font size for rendered `<pre>` blocks. */
  fontSize?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Apply compact styling to <pre> elements after content changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let resolvedMax: string;
    if (maxHeight != null) {
      resolvedMax = `${maxHeight}px`;
    } else {
      const scrollParent = findScrollParent(el);
      const parentH = scrollParent?.clientHeight ?? 400;
      resolvedMax = `${Math.floor(parentH * 0.75)}px`;
    }

    const pres = el.querySelectorAll("pre");
    pres.forEach((pre) => {
      pre.style.fontSize = fontSize ?? "0.82em";
      pre.style.maxHeight = resolvedMax;
      pre.style.overflow = "auto";
      pre.style.position = "relative";
      if (color != null) {
        pre.style.color = color;
        pre.querySelectorAll<HTMLElement>("*").forEach((child) => {
          child.style.color = color;
        });
      }
    });
  }, [children, maxHeight, color, fontSize]);

  return <div ref={containerRef}>{children}</div>;
}

export const COMPACT_CONTEXT_COLOR = COLORS.GRAY_M;
