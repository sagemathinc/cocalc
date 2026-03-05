/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tooltip } from "antd";
import React from "react";

import { CSS } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";

import { useFolderDrop } from "./dnd/file-dnd-provider";

interface Props {
  path: string;
  display?: string | React.JSX.Element;
  on_click: (path: string) => void;
  full_name?: string;
  history?: boolean;
  active?: boolean;
  key: number;
  style?: CSS;
  /** Namespace for DnD droppable IDs (e.g. "files" or "flyout") */
  dndNamespace?: string;
}

export interface PathSegmentItem {
  key: number;
  title: React.JSX.Element | string | undefined;
  onClick: () => void;
  className: string;
  style?: CSS;
}

/**
 * Wrapper that makes a breadcrumb segment a DnD drop target.
 * When a file drag hovers over it, it highlights with a blue background.
 */
function DroppableSegment({
  path,
  ns,
  children,
}: {
  path: string;
  ns: string;
  children: React.ReactNode;
}) {
  const { dropRef, isOver } = useFolderDrop(`breadcrumb-${ns}-${path}`, path);
  return (
    <span
      ref={dropRef}
      data-folder-drop-path={path}
      style={{
        display: "inline-block",
        padding: "0 2px",
        borderRadius: 3,
        verticalAlign: "baseline",
        backgroundColor: isOver ? COLORS.BLUE_LL : "transparent",
      }}
    >
      {children}
    </span>
  );
}

// One segment of the directory links at the top of the files listing.
export function createPathSegmentLink(props: Readonly<Props>): PathSegmentItem {
  const {
    path = "",
    display,
    on_click,
    full_name,
    history,
    active = false,
    key,
    style,
    dndNamespace = "nav",
  } = props;

  function render_content(): React.JSX.Element | string | undefined {
    const content =
      full_name && full_name !== display ? (
        <Tooltip title={full_name} placement="bottom">
          {display}
        </Tooltip>
      ) : (
        display
      );

    // Wrap in droppable segment so files can be dragged onto breadcrumbs
    return (
      <DroppableSegment path={path} ns={dndNamespace}>
        {content}
      </DroppableSegment>
    );
  }

  function cls() {
    if (history) {
      return "cc-path-navigator-history";
    } else if (active) {
      return "cc-path-navigator-active";
    } else {
      return "cc-path-navigator-basic";
    }
  }

  return {
    onClick: () => on_click(path),
    className: cls(),
    key,
    title: render_content(),
    style,
  };
}
