/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Drag-and-drop infrastructure for file move/copy operations.
// Long-press activates drag; folders + breadcrumbs are drop targets;
// Shift key switches from Move to Copy.

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import type { Modifier } from "@dnd-kit/core";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useActions } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { is_valid_uuid_string, path_split, plural } from "@cocalc/util/misc";

// ---------- Types ----------

export interface FileDragData {
  type: "file-drag";
  paths: string[];
  project_id: string;
}

export interface FolderDropData {
  type: "folder-drop";
  path: string;
}

// ---------- Hooks ----------

/**
 * Make an element a drag source for files.
 * @param id   Unique draggable id (e.g. `explorer-row-${name}`)
 * @param paths  Full paths of files being dragged
 * @param project_id  Project id
 */
export function useFileDrag(id: string, paths: string[], project_id: string) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: "file-drag", paths, project_id } satisfies FileDragData,
  });
  return {
    dragRef: setNodeRef,
    dragListeners: listeners,
    dragAttributes: attributes,
    isDragging,
  };
}

/**
 * Make an element a drop target for file drag operations.
 * @param id   Unique droppable id (e.g. `folder-drop-${path}`)
 * @param folderPath  Full path of the target folder
 */
export function useFolderDrop(id: string, folderPath: string, enabled = true) {
  const { setNodeRef, isOver, active } = useDroppable({
    id,
    data: { type: "folder-drop", path: folderPath } satisfies FolderDropData,
  });
  // Only valid if enabled, a file-drag is active, AND the source isn't
  // dropping onto one of its own paths (e.g. dragging a folder onto itself).
  const dragData = active?.data?.current as FileDragData | undefined;
  const isDragging = dragData?.type === "file-drag";
  // Invalid: dragging a folder onto itself or into a descendant
  const isSelfDrop =
    isDragging &&
    dragData.paths.some(
      (p) => p === folderPath || folderPath.startsWith(p + "/"),
    );
  // Invalid: all files already live in the target folder (no-op move)
  const isAlreadyInFolder =
    isDragging &&
    !isSelfDrop &&
    dragData.paths.every((p) => path_split(p).head === folderPath);
  const isInvalid = isSelfDrop || isAlreadyInFolder;
  const isValidDrop = enabled && isDragging && !isInvalid;
  return {
    dropRef: setNodeRef,
    isOver: isOver && !!isValidDrop,
    isInvalidDrop: isOver && !!isInvalid,
  };
}

// ---------- DOM-based folder detection (for cross-context drops) ----------

/**
 * Check if the pointer at (x, y) is over a folder drop target.
 * All folder droppables have `data-folder-drop-path` DOM attributes,
 * which makes detection work across different @dnd-kit DndContexts
 * (e.g. file tab drag → folder in flyout).
 */
export function findFolderDropPathAtPoint(x: number, y: number): string | null {
  const elements = document.elementsFromPoint(x, y);
  for (const el of elements) {
    const folderPath = (el as HTMLElement).getAttribute?.(
      "data-folder-drop-path",
    );
    if (folderPath != null) return folderPath;
  }
  return null;
}

// ---------- Overlay modifier (snap to pointer with small offset) ----------

/**
 * Position the DragOverlay at the pointer (bottom-right of cursor)
 * instead of at the original element's origin.
 *
 * By default, DragOverlay renders at: elementOrigin + transform.
 * We want it at: pointerPosition + (12, 12).
 * Since pointerPosition = initialPointer + transform, we adjust:
 *   modifiedTransform = transform + (initialPointer - elementOrigin) + offset
 */
const snapToPointerModifier: Modifier = ({
  activatorEvent,
  activeNodeRect,
  transform,
}) => {
  if (!activatorEvent || !activeNodeRect) return transform;
  const event = activatorEvent as PointerEvent;
  return {
    ...transform,
    x: transform.x + (event.clientX - activeNodeRect.left) + 12,
    y: transform.y + (event.clientY - activeNodeRect.top) + 12,
  };
};

// ---------- Overlay ----------

function FileDragOverlayContent({
  data,
  isCopy,
  overFolder,
  isInvalid,
}: {
  data: FileDragData;
  isCopy: boolean;
  overFolder: string | null;
  isInvalid: boolean;
}) {
  const n = data.paths.length;

  if (isInvalid && overFolder != null) {
    const folderName = path_split(overFolder).tail || "Home";
    return (
      <div
        style={{
          padding: "4px 10px",
          background: "rgba(245, 34, 45, 0.85)",
          color: "white",
          borderRadius: 4,
          fontSize: "12px",
          whiteSpace: "nowrap",
          width: "max-content",
          pointerEvents: "none",
        }}
      >
        <Icon name="times-circle" style={{ marginRight: 6 }} />
        Cannot move into {folderName}
      </div>
    );
  }

  const op = isCopy ? "Copy" : "Move";
  const target =
    overFolder != null
      ? ` \u2192 ${path_split(overFolder).tail || "Home"}`
      : "";
  return (
    <div
      style={{
        padding: "4px 10px",
        background: "rgba(24, 144, 255, 0.85)",
        color: "white",
        borderRadius: 4,
        fontSize: "12px",
        whiteSpace: "nowrap",
        width: "max-content",
        pointerEvents: "none",
      }}
    >
      <Icon name={isCopy ? "copy" : "arrow-right"} style={{ marginRight: 6 }} />
      {op} {n} {plural(n, "file")}
      {target}
    </div>
  );
}

// ---------- Provider ----------

interface ProviderProps {
  project_id: string;
  children: React.ReactNode;
}

/**
 * Find a project tab under the pointer by walking the DOM elements at (x, y).
 * antd Tabs set `data-node-key` on each tab button with the tab's key (= project_id).
 * Returns the target project_id or null.
 */
function findProjectTabAtPoint(
  x: number,
  y: number,
  sourceProjectId: string,
): string | null {
  const elements = document.elementsFromPoint(x, y);
  for (const el of elements) {
    // antd Tabs: each tab button has role="tab" and data-node-key="<project_id>"
    const nodeKey = (el as HTMLElement).getAttribute?.("data-node-key");
    if (
      nodeKey &&
      is_valid_uuid_string(nodeKey) &&
      nodeKey !== sourceProjectId
    ) {
      return nodeKey;
    }
    // Also check parent (the clickable area might be a child of the tab)
    const parent = el.parentElement;
    const parentKey = parent?.getAttribute?.("data-node-key");
    if (
      parentKey &&
      is_valid_uuid_string(parentKey) &&
      parentKey !== sourceProjectId
    ) {
      return parentKey;
    }
  }
  return null;
}

export function FileDndProvider({ project_id, children }: ProviderProps) {
  const actions = useActions({ project_id });
  const [activeData, setActiveData] = useState<FileDragData | null>(null);
  const [shiftKey, setShiftKey] = useState(false);
  const [overFolder, setOverFolder] = useState<string | null>(null);
  const [isInvalidTarget, setIsInvalidTarget] = useState(false);
  const pointerPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
  );

  // Track Shift key and pointer position globally during drag
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftKey(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftKey(false);
    };
    const move = (e: PointerEvent) => {
      pointerPos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as FileDragData | undefined;
      if (data?.type !== "file-drag") return;
      // Ensure all dragged files are selected in Redux
      actions?.set_file_list_checked(data.paths);
      setActiveData(data);
      document.body.style.cursor = "grabbing";
    },
    [actions],
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const dropData = event.over?.data?.current as FolderDropData | undefined;
    const dragData = event.active?.data?.current as FileDragData | undefined;
    if (dropData?.type === "folder-drop" && dragData?.paths) {
      const isSelf = dragData.paths.some(
        (p) => p === dropData.path || dropData.path.startsWith(p + "/"),
      );
      const isAlreadyIn = dragData.paths.every(
        (p) => path_split(p).head === dropData.path,
      );
      setOverFolder(dropData.path);
      setIsInvalidTarget(isSelf || isAlreadyIn);
    } else {
      setOverFolder(null);
      setIsInvalidTarget(false);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveData(null);
      setOverFolder(null);
      document.body.style.cursor = "";

      const dragData = event.active.data.current as FileDragData | undefined;
      if (!dragData || dragData.type !== "file-drag") return;

      const dropData = event.over?.data?.current as FolderDropData | undefined;

      // Case 1: Valid drop on a folder within the same project
      if (dropData?.type === "folder-drop") {
        // Prevent dropping a folder into itself or a descendant
        if (
          dragData.paths.some(
            (p) => p === dropData.path || dropData.path.startsWith(p + "/"),
          )
        ) {
          return;
        }
        // Prevent no-op move (all files already in the target folder)
        if (dragData.paths.every((p) => path_split(p).head === dropData.path)) {
          return;
        }

        try {
          if (shiftKey) {
            await actions?.copy_paths({
              src: dragData.paths,
              dest: dropData.path,
            });
          } else {
            await actions?.move_files({
              src: dragData.paths,
              dest: dropData.path,
            });
          }
          actions?.set_all_files_unchecked();
          actions?.fetch_directory_listing();
        } catch (err) {
          console.warn("File drag-and-drop operation failed:", err);
        }
        return;
      }

      // Case 2: No valid droppable hit — check if pointer is over a project tab
      const { x, y } = pointerPos.current;
      const targetProjectId = findProjectTabAtPoint(x, y, project_id);
      if (targetProjectId) {
        // Open the copy dialog pre-populated for cross-project copy.
        // Files are already checked from handleDragStart.
        actions?.setState({
          file_action: "copy",
          copy_destination_project_id: targetProjectId,
        } as any);
      }
    },
    [actions, shiftKey, project_id],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={null} modifiers={[snapToPointerModifier]}>
        {activeData && (
          <FileDragOverlayContent
            data={activeData}
            isCopy={shiftKey}
            overFolder={overFolder}
            isInvalid={isInvalidTarget}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
