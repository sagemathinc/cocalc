/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";

import {
  MOUSE_SENSOR_OPTIONS,
  TOUCH_SENSOR_OPTIONS,
  DRAG_OVERLAY_MODIFIERS,
  DragOverlayContent,
} from "@cocalc/frontend/components/dnd";
import { Actions } from "../../code-editor/actions";
import type { DropZone } from "./use-frame-drop-zone";
import type { IconName } from "@cocalc/frontend/components/icon";

export interface FrameDragData {
  type: "frame-drag";
  frameId: string;
  frameType: string;
  frameLabel: string;
}

function isEdgeZone(
  zone: DropZone,
): zone is "top" | "bottom" | "left" | "right" {
  return (
    zone === "top" || zone === "bottom" || zone === "left" || zone === "right"
  );
}

export function shouldExtractTabFromDrop(
  sourceId: string,
  zone: DropZone,
  overData?: {
    tabContainerId?: string | null;
    tabChildIds?: string[];
  } | null,
): boolean {
  return (
    isEdgeZone(zone) &&
    overData?.tabContainerId != null &&
    overData.tabChildIds?.includes(sourceId) === true
  );
}

/** Context for child drop zones to report active zone to the provider. */
export const FrameDndZoneContext = React.createContext<{
  setDropZone: (frameId: string, zone: DropZone) => void;
}>({
  setDropZone: () => {},
});

const ZONE_ICONS: Record<string, IconName> = {
  center: "exchange",
  top: "arrow-up",
  bottom: "arrow-down",
  left: "arrow-left",
  right: "arrow-right",
  tab: "window-restore",
};

interface Props {
  actions: Actions;
  children: React.ReactNode;
}

export function FrameDndProvider({ actions, children }: Props) {
  const intl = useIntl();

  const zoneLabels: Record<string, string> = useMemo(
    () => ({
      center: intl.formatMessage({
        id: "frame-editors.frame-tree.dnd.zone.center",
        defaultMessage: "Swap",
        description:
          "DnD zone label: swap this frame with the target (center zone)",
      }),
      top: intl.formatMessage({
        id: "frame-editors.frame-tree.dnd.zone.top",
        defaultMessage: "Split above",
        description:
          "DnD zone label: split and place frame above the target (top zone)",
      }),
      bottom: intl.formatMessage({
        id: "frame-editors.frame-tree.dnd.zone.bottom",
        defaultMessage: "Split below",
        description:
          "DnD zone label: split and place frame below the target (bottom zone)",
      }),
      left: intl.formatMessage({
        id: "frame-editors.frame-tree.dnd.zone.left",
        defaultMessage: "Split left of",
        description:
          "DnD zone label: split and place frame to the left of the target (left zone)",
      }),
      right: intl.formatMessage({
        id: "frame-editors.frame-tree.dnd.zone.right",
        defaultMessage: "Split right of",
        description:
          "DnD zone label: split and place frame to the right of the target (right zone)",
      }),
      tab: intl.formatMessage({
        id: "frame-editors.frame-tree.dnd.zone.tab",
        defaultMessage: "Tab with",
        description:
          "DnD zone label: merge frame as a tab with the target (title bar zone)",
      }),
    }),
    [intl],
  );

  const [activeData, setActiveData] = useState<FrameDragData | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [isSelfHover, setIsSelfHover] = useState(false);
  const [selfHoverTabContainerId, setSelfHoverTabContainerId] = useState<
    string | null
  >(null);
  const [dropAction, setDropAction] = useState<string>("");
  const [dropIcon, setDropIcon] = useState<IconName>("exchange");
  // Track current zone so the overlay reacts when zone changes to/from null
  const [currentZone, setCurrentZone] = useState<DropZone>(null);

  const dropZoneRef = useRef<{ frameId: string; zone: DropZone } | null>(null);

  const setDropZone = useCallback(
    (frameId: string, zone: DropZone) => {
      if (zone === null) {
        // Only clear if the current zone belongs to this frame;
        // prevents a race where a losing-hover leaf overwrites
        // the newly-hovered leaf's zone.
        if (dropZoneRef.current?.frameId === frameId) {
          dropZoneRef.current = null;
          setCurrentZone(null);
        }
      } else {
        // Skip redundant updates when zone hasn't changed for the same frame
        const prev = dropZoneRef.current;
        if (prev?.frameId === frameId && prev.zone === zone) return;
        dropZoneRef.current = { frameId, zone };
        setCurrentZone(zone);
        setDropAction(zoneLabels[zone] || zoneLabels.center);
        setDropIcon(ZONE_ICONS[zone] || "exchange");
      }
    },
    [zoneLabels],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_SENSOR_OPTIONS),
    useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS),
  );

  const activeDataRef = useRef<FrameDragData | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as FrameDragData;
    if (data?.type === "frame-drag") {
      setActiveData(data);
      activeDataRef.current = data;
      document.body.classList.add("cc-frame-dragging");
    }
  }, []);

  const handleDragOver = useCallback(
    (event) => {
      const overData = event.over?.data?.current;

      // Tab reorder: dragging a tab over a sibling tab
      if (overData?.type === "tab-reorder-drop") {
        const sourceId = activeDataRef.current?.frameId;
        const isSibling =
          sourceId &&
          overData.childIds?.includes(sourceId) &&
          sourceId !== overData.frameId;
        if (isSibling) {
          // Sibling reorder — neutral overlay (the gap indicator is the cue)
          setIsSelfHover(true);
          setSelfHoverTabContainerId(null);
          setDropTarget(null);
        } else if (sourceId && !overData.childIds?.includes(sourceId)) {
          // External frame dropping onto a tab → "Tab with"
          setIsSelfHover(false);
          setSelfHoverTabContainerId(null);
          setDropTarget(overData.frameLabel || "Tabs");
          setDropAction(zoneLabels.tab);
          setDropIcon(ZONE_ICONS.tab);
          setCurrentZone("tab");
        } else {
          // Hovering over self — neutral
          setIsSelfHover(true);
          setSelfHoverTabContainerId(null);
          setDropTarget(null);
        }
        return;
      }

      // Tab bar drop target: dropping a frame onto a tab container's tab bar
      if (overData?.type === "tab-bar-drop") {
        const alreadyInTabs = overData.childIds?.includes(
          activeDataRef.current?.frameId,
        );
        if (alreadyInTabs) {
          // Source is already in this tab container — reorder to end
          setIsSelfHover(true);
          setSelfHoverTabContainerId(null);
          setDropTarget(null);
        } else {
          setIsSelfHover(false);
          setSelfHoverTabContainerId(null);
          setDropTarget(overData.frameLabel || "Tabs");
          setDropAction(zoneLabels.tab);
          setDropIcon(ZONE_ICONS.tab);
          setCurrentZone("tab");
        }
        return;
      }

      if (overData?.type === "frame-drop" && overData.frameLabel) {
        const sourceId = activeDataRef.current?.frameId;
        const isSelf = overData.frameId === sourceId;
        const isSameTabContainer =
          !!sourceId && overData.tabChildIds?.includes(sourceId);
        setIsSelfHover(isSelf || isSameTabContainer);
        if (isSelf || isSameTabContainer) {
          // Same tab container: edge zones extract the dragged tab from the
          // container instead of splitting a child inside it.
          setSelfHoverTabContainerId(overData.tabContainerId ?? null);
          setDropTarget(null);
        } else {
          setSelfHoverTabContainerId(null);
          setDropTarget(overData.frameLabel);
        }
      } else {
        setDropTarget(null);
        setIsSelfHover(false);
        setSelfHoverTabContainerId(null);
      }
    },
    [zoneLabels],
  );

  const resetDragState = useCallback(() => {
    document.body.classList.remove("cc-frame-dragging");
    setActiveData(null);
    activeDataRef.current = null;
    setDropTarget(null);
    setIsSelfHover(false);
    setSelfHoverTabContainerId(null);
    setCurrentZone(null);
    dropZoneRef.current = null;
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const data = activeData;
      // Capture zone info BEFORE resetting drag state, since
      // resetDragState() clears dropZoneRef.current.
      const savedZoneInfo = dropZoneRef.current;
      resetDragState();

      if (!data || !event.over) return;

      const overData = event.over.data.current;
      if (!overData) return;

      const sourceId = data.frameId;

      // Tab reorder: move a tab before a sibling tab
      if (overData.type === "tab-reorder-drop") {
        const { tabsId, frameId: targetFrameId, childIds } = overData;
        if (childIds?.includes(sourceId) && sourceId !== targetFrameId) {
          // Sibling reorder: insert source before target
          actions.reorder_tab(tabsId, sourceId, targetFrameId);
        } else if (!childIds?.includes(sourceId)) {
          // External frame → add to this tab container
          const firstChildId = childIds?.[0];
          if (firstChildId) {
            actions.move_frame(sourceId, firstChildId, "tab");
          }
        }
        return;
      }

      // Tab bar drop: move a frame into a tab container (or reorder to end)
      if (overData.type === "tab-bar-drop") {
        const { tabsId, childIds } = overData;
        if (childIds?.includes(sourceId)) {
          // Already in this tab container — reorder to end
          actions.reorder_tab(tabsId, sourceId, null);
        } else {
          // Use first child as merge target; merge_as_tabs appends to the
          // existing tabs container when the target is already inside one.
          const targetId = childIds?.[0];
          if (targetId) {
            actions.move_frame(sourceId, targetId, "tab");
          }
        }
        return;
      }

      const targetId = overData.frameId;
      const zoneInfo = savedZoneInfo;
      // Only use the zone if it was reported for the actual drop target;
      // otherwise fall back to "center" to prevent stale zones from a
      // previously hovered frame being applied to the wrong target.
      const zone =
        zoneInfo?.frameId === targetId ? zoneInfo!.zone || "center" : "center";

      if (sourceId === targetId) {
        // Self-drop: extract tab from tab container if on an edge zone
        if (shouldExtractTabFromDrop(sourceId, zone, overData)) {
          actions.extract_tab(sourceId, zone);
        }
        return;
      }

      if (zone === "center") {
        actions.swap_frames(sourceId, targetId);
      } else if (zone === "tab") {
        actions.move_frame(sourceId, targetId, "tab");
      } else {
        if (shouldExtractTabFromDrop(sourceId, zone, overData)) {
          actions.extract_tab(sourceId, zone);
          return;
        }
        // When the target is inside a tab container, split the tab
        // container itself rather than nesting a split node inside it.
        const tabContainerId = overData.tabContainerId;
        if (tabContainerId) {
          actions.move_frame(sourceId, tabContainerId, zone);
        } else {
          actions.move_frame(sourceId, targetId, zone);
        }
      }
    },
    [activeData, actions, resetDragState],
  );

  const handleDragCancel = resetDragState;

  // Determine overlay text, icon, and variant
  let overlayText: string;
  let overlayIcon: IconName;
  let overlayVariant: "valid" | "neutral" | "invalid";

  if (dropTarget) {
    // Hovering over a different frame — show zone action
    overlayText = `${dropAction} "${dropTarget}"`;
    overlayIcon = dropIcon;
    overlayVariant = "valid";
  } else if (isSelfHover && selfHoverTabContainerId && currentZone) {
    // Self-hover on a tab with an active edge zone → tab extraction
    overlayText = intl.formatMessage(
      {
        id: "frame-editors.frame-tree.dnd.overlay.extract-tab",
        defaultMessage: "{action} (extract from tabs)",
        description:
          "DnD overlay text when extracting a tab from a tab container by dragging to an edge zone",
      },
      { action: dropAction },
    );
    overlayIcon = dropIcon;
    overlayVariant = "valid";
  } else if (isSelfHover) {
    // Hovering over the same frame (no tab extraction available or in center)
    overlayText = intl.formatMessage({
      id: "frame-editors.frame-tree.dnd.overlay.self-hover",
      defaultMessage: "Drop onto another frame",
      description:
        "DnD overlay text shown when hovering over the same frame that is being dragged",
    });
    overlayIcon = "arrows";
    overlayVariant = "neutral";
  } else {
    // Not hovering over any frame
    overlayText = intl.formatMessage({
      id: "frame-editors.frame-tree.dnd.overlay.no-target",
      defaultMessage: "Drag onto a frame",
      description:
        "DnD overlay text shown while dragging a frame but not hovering over any target",
    });
    overlayIcon = "arrows";
    overlayVariant = "neutral";
  }

  return (
    <FrameDndZoneContext.Provider value={{ setDropZone }}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay modifiers={DRAG_OVERLAY_MODIFIERS}>
          {activeData ? (
            <DragOverlayContent
              icon={overlayIcon}
              text={overlayText}
              variant={overlayVariant}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </FrameDndZoneContext.Provider>
  );
}
