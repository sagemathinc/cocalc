/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/**
 * This is the horizonal or vertical dragbar used in FrameTree.
 * The main functionality is to calculate a new offset based on the mouse position when dragging stopps.
 */

import React from "react";
import { Map } from "immutable";
import { ReactDOM, useState, CSS } from "../../app-framework";
import { Actions } from "../code-editor/actions";
import { drag_start_iframe_disable, drag_stop_iframe_enable } from "../../misc";
import { COLORS } from "@cocalc/util/theme";
import * as feature from "@cocalc/frontend/feature";

import Draggable from "react-draggable";
const DRAG_OFFSET = feature.IS_TOUCH ? 5 : 2;

const COLS_DRAG_BAR: CSS = {
  padding: `${DRAG_OFFSET}px`,
  background: COLORS.GRAY_LL,
  cursor: "ew-resize",
} as const;

const DRAG_HOVER: CSS = {
  background: COLORS.GRAY,
  opacity: 0.8,
  zIndex: 100, // so it's on top of editors and other controls
} as const;

const COLS_DRAG_BAR_DRAG_HOVER: CSS = {
  ...COLS_DRAG_BAR,
  ...DRAG_HOVER,
} as const;

const ROWS_DRAG_BAR: CSS = {
  ...COLS_DRAG_BAR,
  ...{
    cursor: "ns-resize",
  },
} as const;

const ROWS_DRAG_BAR_HOVER: CSS = { ...ROWS_DRAG_BAR, ...DRAG_HOVER } as const;

interface Props {
  // after dragging, we set the new position, focus, etc.
  actions: Actions;
  // the parent container, i.e. the part that's split and where we want to resize
  containerRef: React.RefObject<HTMLDivElement>;
  // the direction
  dir: "col" | "row";
  frame_tree: Map<string, any>;
  safari_hack: () => void;
}

export const FrameTreeDragBar: React.FC<Props> = React.memo((props: Props) => {
  const { dir, frame_tree, actions, safari_hack, containerRef } = props;

  const dragBarRef = React.useRef<Draggable>(null);

  const [dragActive, setDragActive] = useState<boolean>(false);
  const [dragHover, set_drag_hover] = useState<boolean>(false);

  const axis = dir === "col" ? "x" : "y";

  function reset() {
    if (dragBarRef.current != null) {
      (dragBarRef.current as any).state[axis] = 0;
      $(ReactDOM.findDOMNode(dragBarRef.current)).css("transform", "");
    }
  }

  function calcPosition(_, ui) {
    const offsetNode = dir === "col" ? ui.node.offsetLeft : ui.node.offsetTop;
    const offset = offsetNode + ui[axis] + DRAG_OFFSET;
    const elt = ReactDOM.findDOMNode(containerRef.current);
    const pos =
      dir === "col"
        ? (offset - elt.offsetLeft) / elt.offsetWidth
        : (offset - elt.offsetTop) / elt.offsetHeight;
    reset();
    actions.set_frame_tree({
      id: frame_tree.get("id"),
      pos,
    });
    actions.set_resize();
    actions.focus(); // see https://github.com/sagemathinc/cocalc/issues/3269
  }

  function onStart() {
    setDragActive(true);
    drag_start_iframe_disable();
  }

  function onStop(_, ui) {
    setDragActive(false);
    drag_stop_iframe_enable();
    calcPosition(_, ui);
    safari_hack();
  }

  function style(): CSS | undefined {
    const dragging = dragHover || dragActive;
    switch (dir) {
      case "row":
        return dragging ? ROWS_DRAG_BAR_HOVER : ROWS_DRAG_BAR;
      case "col":
        return dragging ? COLS_DRAG_BAR_DRAG_HOVER : COLS_DRAG_BAR;
    }
  }

  return (
    <Draggable ref={dragBarRef} axis={axis} onStop={onStop} onStart={onStart}>
      <div
        style={style()}
        onMouseEnter={() => set_drag_hover(true)}
        onMouseLeave={() => set_drag_hover(false)}
      />
    </Draggable>
  );
});
