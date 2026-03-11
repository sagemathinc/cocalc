/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Wrapper for leaf frames that integrates the DnD drop zone.
// Extracted from frame-tree.tsx's render_one to enable hooks
// in the memoized FrameTree component.

import { useDndContext } from "@dnd-kit/core";
import React, { useContext, useEffect, useRef, useState } from "react";

import { Rendered } from "@cocalc/frontend/app-framework";
import { IFrameContext, FrameContext } from "./frame-context";
import { useFrameDropZone } from "./dnd/use-frame-drop-zone";
import { DropZoneOverlay } from "./dnd/drop-zone-overlay";
import { FrameDndZoneContext } from "./dnd/frame-dnd-provider";
import { TabContainerContext } from "./tabs-container";

interface Props {
  id: string;
  frameLabel: string;
  contextValue: IFrameContext;
  style?: React.CSSProperties;
  onClick: () => void;
  onTouchStart: () => void;
  titlebar: Rendered;
  leaf: Rendered;
}

export const FrameLeafContainer: React.FC<Props> = ({
  id,
  frameLabel,
  contextValue,
  style,
  onClick,
  onTouchStart,
  titlebar,
  leaf,
}) => {
  const titleBarRef = useRef<HTMLDivElement>(null);
  const [titleBarHeight, setTitleBarHeight] = useState(0);
  const { tabContainerId, tabSiblingCount } = useContext(TabContainerContext);

  useEffect(() => {
    if (titleBarRef.current) {
      setTitleBarHeight(titleBarRef.current.offsetHeight);
    }
  });

  const { dropRef, isOver, isDragActive, activeZone, onPointerMove } =
    useFrameDropZone(id, frameLabel, titleBarHeight, {
      tabContainerId,
      tabSiblingCount,
    });
  const { setDropZone } = useContext(FrameDndZoneContext);

  // Detect if THIS frame is being dragged
  const { active } = useDndContext();
  const isBeingDragged = active?.data?.current?.frameId === id;

  // Report active zone to the provider so handleDragEnd can read it
  useEffect(() => {
    setDropZone(id, activeZone);
  }, [activeZone, id, setDropZone]);

  return (
    <FrameContext.Provider value={contextValue}>
      <div
        ref={dropRef}
        className={"smc-vfill cc-frame-leaf-container"}
        style={{
          ...(style ?? {}),
          position: "relative",
          ...(isBeingDragged
            ? { opacity: 0.4, filter: "grayscale(50%)" }
            : undefined),
        }}
        onClick={onClick}
        onTouchStart={onTouchStart}
        onPointerMove={onPointerMove}
      >
        <div ref={titleBarRef}>{titlebar}</div>
        {leaf}
        <DropZoneOverlay
          isOver={isOver}
          isDragActive={isDragActive}
          activeZone={activeZone}
          titleBarHeight={titleBarHeight}
        />
      </div>
    </FrameContext.Provider>
  );
};
