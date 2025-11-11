/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tag } from "antd";
import React from "react";

import type { FrameInfo } from "./build-tree";
import { resolveSpecLabel } from "./util";

/**
 * Frame tree structure node - mirrors the actual frame split layout
 * type: "frame" (leaf) or "split" (internal node with children)
 * direction: "row" (vertical divider, frames stacked vertically) or "col" (horizontal divider)
 */
interface FrameTreeNode {
  type: "frame" | "split";
  frame?: FrameInfo;
  direction?: "row" | "col";
  children?: FrameTreeNode[];
  id?: string;
  pos?: number; // Split position 0-1 for weighted flex (0.5 = 50/50)
}

interface RenderFrameTreeProps {
  structure: FrameTreeNode | null;
  onFrameClick: (frameId: string) => void;
  frameShortcutMap?: Map<string, number>; // Maps frame ID to shortcut number
}

function getFrameTitle(frame: FrameInfo): string {
  return resolveSpecLabel(frame.frameName) ?? frame.shortName;
}

/**
 * Renders the frame tree as a visual representation of split layouts
 * - Splits rendered as flex containers with weighted flex based on split position (pos)
 * - Position clamped to 0.2-0.8 to ensure both children remain visible
 * - Leaves rendered as clickable tags with frame name and shortcut number
 */
let splitKeyCounter = 0;

export const RenderFrameTree: React.FC<RenderFrameTreeProps> = ({
  structure,
  onFrameClick,
  frameShortcutMap,
}) => {
  if (!structure) {
    return null;
  }

  splitKeyCounter = 0; // Reset counter for this render

  function filterAndRender(node: FrameTreeNode): React.ReactNode {
    // Leaf node - render frame tag with number
    if (node.type === "frame" && node.frame) {
      const shortcutNumber = frameShortcutMap?.get(node.frame.id);
      const frameTitle = getFrameTitle(node.frame);
      const fp = node.frame.filePath;
      const frameLabel = fp ? `${frameTitle} [${fp}]` : frameTitle;

      return (
        <div
          key={node.frame.id}
          className="frame-leaf"
          onClick={() => onFrameClick(node.frame!.id)}
          title={frameLabel}
          aria-label={frameLabel}
        >
          <Tag color={node.frame.color}>{shortcutNumber ?? "?"}</Tag>
        </div>
      );
    }

    // Split node - render flex container with direction
    if (node.type === "split") {
      const isVertical = node.direction === "row"; // "row" means vertical divider
      const flexDirection = isVertical ? "column" : "row";
      const splitKey = `split-${splitKeyCounter++}`;

      // Render all children
      const renderedChildren = (node.children || []).map((child) =>
        filterAndRender(child),
      );

      // If no children, don't render
      if (renderedChildren.length === 0) {
        return null;
      }

      // If only one child, render it directly (unwrap single-child splits)
      if (renderedChildren.length === 1) {
        return renderedChildren[0];
      }

      // Calculate flex weights based on split position (0-1)
      // Clamp pos to 0.2-0.8 range to ensure both children remain visible
      const pos = node.pos ?? 0.5;
      const clampedPos = Math.max(0.2, Math.min(0.8, pos));
      const firstFlex = clampedPos;
      const secondFlex = 1 - clampedPos;

      return (
        <div
          key={splitKey}
          className={`frame-split frame-split-${isVertical ? "v" : "h"}`}
          style={{
            display: "flex",
            flexDirection: flexDirection as "row" | "column",
            flex: 1,
            gap: "2px",
          }}
        >
          <div style={{ flex: firstFlex, minHeight: 0, minWidth: 0 }}>
            {renderedChildren[0]}
          </div>
          {renderedChildren.length > 1 && (
            <div style={{ flex: secondFlex, minHeight: 0, minWidth: 0 }}>
              {renderedChildren[1]}
            </div>
          )}
        </div>
      );
    }

    return null;
  }

  const renderedContent = filterAndRender(structure);
  if (!renderedContent) {
    return null; // Don't render if everything was filtered out
  }

  return <div className="frame-tree-container">{renderedContent}</div>;
};
