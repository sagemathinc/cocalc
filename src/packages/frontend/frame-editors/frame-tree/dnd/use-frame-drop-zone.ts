/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useCallback, useState } from "react";
import { useDroppable } from "@dnd-kit/core";

export type DropZone =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "tab"
  | null;

/** Edge zones that allow extracting a tab from a tab container. */
const EDGE_ZONES: Set<DropZone> = new Set(["top", "bottom", "left", "right"]);

export function computeDropZone(
  rect: DOMRect,
  pointerX: number,
  pointerY: number,
  titleBarHeight: number = 0,
): DropZone {
  // Title bar zone: when pointer is within the title bar strip, merge as tab
  if (titleBarHeight > 0 && pointerY - rect.top < titleBarHeight) {
    return "tab";
  }

  const relX = (pointerX - rect.left) / rect.width;
  const relY = (pointerY - rect.top) / rect.height;
  const EDGE = 0.25;

  const inTop = relY < EDGE;
  const inBottom = relY > 1 - EDGE;
  const inLeft = relX < EDGE;
  const inRight = relX > 1 - EDGE;

  // Corner resolution: closest edge wins
  if (inTop && inLeft) return relY < relX ? "top" : "left";
  if (inTop && inRight) return relY < 1 - relX ? "top" : "right";
  if (inBottom && inLeft) return 1 - relY < relX ? "bottom" : "left";
  if (inBottom && inRight) return 1 - relY < 1 - relX ? "bottom" : "right";

  if (inTop) return "top";
  if (inBottom) return "bottom";
  if (inLeft) return "left";
  if (inRight) return "right";
  return "center";
}

interface TabContainerInfo {
  tabContainerId: string | null;
  tabSiblingCount: number;
}

export function useFrameDropZone(
  frameId: string,
  frameLabel: string,
  titleBarHeight: number = 0,
  tabInfo?: TabContainerInfo,
  /** Called synchronously on every zone change so the provider's ref
   *  is always up-to-date when onDragEnd fires (avoids useEffect lag). */
  onZoneChange?: (frameId: string, zone: DropZone) => void,
) {
  const [activeZone, setActiveZone] = useState<DropZone>(null);
  const { setNodeRef, isOver, active } = useDroppable({
    id: `frame-body-${frameId}`,
    data: {
      type: "frame-drop",
      frameId,
      frameLabel,
      tabContainerId: tabInfo?.tabContainerId ?? null,
    },
  });
  const isDragActive = active?.data?.current?.type === "frame-drag";
  const isSelfDrag = active?.data?.current?.frameId === frameId;

  // Allow self-drag edge zones when frame is in a tab container with ≥2 tabs
  const canExtractFromTabs =
    isSelfDrag && !!tabInfo?.tabContainerId && tabInfo.tabSiblingCount >= 2;

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      let zone: DropZone = null;
      if (!isDragActive) {
        // zone stays null
      } else if (isSelfDrag && !canExtractFromTabs) {
        // zone stays null
      } else {
        const rect = e.currentTarget.getBoundingClientRect();
        const computed = computeDropZone(
          rect,
          e.clientX,
          e.clientY,
          titleBarHeight,
        );
        if (isSelfDrag && canExtractFromTabs) {
          zone = EDGE_ZONES.has(computed) ? computed : null;
        } else {
          zone = computed;
        }
      }
      setActiveZone(zone);
      onZoneChange?.(frameId, zone);
    },
    [
      isDragActive,
      isSelfDrag,
      canExtractFromTabs,
      titleBarHeight,
      frameId,
      onZoneChange,
    ],
  );

  // Reset zone when not hovering
  if (!isOver && activeZone !== null) {
    setActiveZone(null);
    onZoneChange?.(frameId, null);
  }

  const isValidDrop = isSelfDrag ? canExtractFromTabs : true;

  return {
    dropRef: setNodeRef,
    isOver: isOver && isDragActive && isValidDrop,
    isDragActive: isDragActive && isValidDrop,
    activeZone: isOver && isDragActive && isValidDrop ? activeZone : null,
    onPointerMove,
  };
}
