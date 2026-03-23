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
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  MOUSE_SENSOR_OPTIONS,
  TOUCH_SENSOR_OPTIONS,
  DRAG_OVERLAY_MODIFIERS,
  DragOverlayContent,
  getEventCoords,
} from "@cocalc/frontend/components/dnd";
import {
  is_valid_uuid_string,
  path_split,
  plural,
  uuid,
} from "@cocalc/util/misc";

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
    disabled: !enabled,
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
    // Check the element itself
    const folderPath = (el as HTMLElement).getAttribute?.(
      "data-folder-drop-path",
    );
    if (folderPath != null) return folderPath;
    // Walk up to ancestor (e.g. <td> → <tr> that carries the attribute)
    const ancestor = (el as HTMLElement).closest?.(
      "[data-folder-drop-path]",
    );
    if (ancestor) {
      const ancestorPath = ancestor.getAttribute("data-folder-drop-path");
      if (ancestorPath != null) return ancestorPath;
    }
  }
  return null;
}

// ---------- Overlay ----------

function FileDragOverlayContent({ data, isCopy, overFolder, isInvalid }) {
  const n = data.paths.length;
  if (isInvalid && overFolder != null) {
    const folderName = path_split(overFolder).tail || "Home";
    return (
      <DragOverlayContent
        icon="times-circle"
        text={`Cannot move into ${folderName}`}
        variant="invalid"
      />
    );
  }
  const op = isCopy ? "Copy" : "Move";
  if (overFolder != null) {
    const target = path_split(overFolder).tail || "Home";
    return (
      <DragOverlayContent
        icon={isCopy ? "copy" : "arrow-right"}
        text={`${op} ${n} ${plural(n, "file")} → ${target}`}
        variant="valid"
      />
    );
  }
  return (
    <DragOverlayContent
      icon={isCopy ? "copy" : "arrows"}
      text={`${op} ${n} ${plural(n, "file")} onto a folder`}
      variant="neutral"
    />
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
  const isInvalidTargetRef = useRef(false);
  const pointerPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Save pre-drag checked files to restore on cancel
  const preDragCheckedRef = useRef<string[] | null>(null);

  // Flag to prevent stale onDragEnd from executing after blur/visibility
  // force-cancel.  dnd-kit may still fire onDragEnd when the user returns
  // and clicks — this ref tells handleDragEnd to treat it as a cancel.
  const forceCancelledRef = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_SENSOR_OPTIONS),
    useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS),
  );

  // Track Shift key globally
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftKey(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftKey(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Track pointer position only during active drag
  useEffect(() => {
    if (!activeData) return;
    const move = (e: PointerEvent) => {
      pointerPos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [activeData]);

  // Safety cleanup: if component unmounts during a drag, reset body styles
  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.classList.remove("cc-file-dragging");
    };
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as FileDragData | undefined;
      if (data?.type !== "file-drag") return;
      // Clear any stale force-cancel flag from a previous drag session.
      forceCancelledRef.current = false;
      // Initialize pointer position from the activator event so that
      // cross-project tab detection works even without any pointer movement.
      const coords = getEventCoords(event.activatorEvent);
      if (coords) {
        pointerPos.current = coords;
      }
      // Save current checked files so we can restore on cancel
      const store = redux.getProjectStore(project_id);
      const currentChecked = store?.get("checked_files");
      preDragCheckedRef.current = currentChecked?.toArray() ?? [];
      // Ensure all dragged files are selected in Redux
      actions?.set_file_list_checked(data.paths);
      setActiveData(data);
      document.body.style.cursor = "grabbing";
      document.body.classList.add("cc-file-dragging");
    },
    [actions, project_id],
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
      if (isAlreadyIn && !isSelf) {
        // Files are already in this directory — treat as no target
        // (no red error; just show the neutral "drag onto a folder" hint)
        setOverFolder(null);
        setIsInvalidTarget(false);
      } else {
        setOverFolder(dropData.path);
        setIsInvalidTarget(isSelf);
      }
    } else {
      setOverFolder(null);
      setIsInvalidTarget(false);
    }
  }, []);

  // Keep ref in sync with state so handleDragMove can read without dependency
  useEffect(() => {
    isInvalidTargetRef.current = isInvalidTarget;
  }, [isInvalidTarget]);

  // onDragMove fires on every pointer move — use it to detect hovering
  // over folder rows via DOM hit-testing (replaces per-row useDroppable
  // for file listing rows, saving hundreds of hook registrations).
  // CSS highlight classes are toggled directly on the DOM element to avoid
  // React re-renders on every pointer move.
  const lastMoveCheck = useRef(0);
  const highlightedRowRef = useRef<HTMLElement | null>(null);
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const now = Date.now();
    if (now - lastMoveCheck.current < 60) return;
    lastMoveCheck.current = now;
    const dragData = event.active?.data?.current as FileDragData | undefined;
    if (!dragData?.paths) return;
    const { x, y } = pointerPos.current;

    // DOM hit-test for folder rows (works for file listing rows,
    // directory tree nodes, breadcrumbs — anything with the attribute)
    const folderPath = findFolderDropPathAtPoint(x, y);
    const folderEl =
      folderPath != null
        ? ((document.elementFromPoint(x, y) as HTMLElement)?.closest?.(
            "[data-folder-drop-path]",
          ) as HTMLElement | null)
        : null;

    // Update CSS highlight directly on the DOM element
    if (highlightedRowRef.current !== folderEl) {
      highlightedRowRef.current?.classList.remove(
        "cc-explorer-row-drop-target",
        "cc-explorer-row-drop-invalid",
      );
      highlightedRowRef.current = folderEl;
    }

    if (folderPath != null && folderEl != null) {
      const isSelf = dragData.paths.some(
        (p) => p === folderPath || folderPath.startsWith(p + "/"),
      );
      const isAlreadyIn =
        !isSelf &&
        dragData.paths.every((p) => path_split(p).head === folderPath);
      if (isSelf) {
        folderEl.classList.add("cc-explorer-row-drop-invalid");
        setOverFolder(folderPath);
        setIsInvalidTarget(true);
      } else if (isAlreadyIn) {
        setOverFolder(null);
        setIsInvalidTarget(false);
      } else {
        folderEl.classList.add("cc-explorer-row-drop-target");
        setOverFolder(folderPath);
        setIsInvalidTarget(false);
      }
    } else if (event.over == null) {
      // No folder row and no dnd-kit droppable — clear state
      setOverFolder(null);
      setIsInvalidTarget(false);
    }
    // else: dnd-kit droppable active (e.g. tree node) — let handleDragOver manage
  }, []);

  // Restore the pre-drag selection (used on cancel / invalid drop).
  // Idempotent: no-op if already restored (prevents double-call from
  // blur + visibility handlers from clearing the user's selection).
  const restoreSelection = useCallback(() => {
    if (preDragCheckedRef.current == null) return;
    const saved = preDragCheckedRef.current;
    preDragCheckedRef.current = null;
    actions?.set_all_files_unchecked();
    if (saved.length > 0) {
      actions?.set_file_list_checked(saved);
    }
  }, [actions]);

  // Fail-safe: if the browser loses focus mid-drag (mouseup outside window,
  // Alt+Tab, etc.), the mouseup event is missed and drag state gets stuck.
  // Reset on visibilitychange or blur.
  useEffect(() => {
    if (!activeData) return;
    const cleanup = () => {
      if (document.hidden) {
        highlightedRowRef.current?.classList.remove(
          "cc-explorer-row-drop-target",
          "cc-explorer-row-drop-invalid",
        );
        highlightedRowRef.current = null;
        forceCancelledRef.current = true;
        setActiveData(null);
        setOverFolder(null);
        document.body.style.cursor = "";
        document.body.classList.remove("cc-file-dragging");
        restoreSelection();
      }
    };
    const blurCleanup = () => {
      highlightedRowRef.current?.classList.remove(
        "cc-explorer-row-drop-target",
        "cc-explorer-row-drop-invalid",
      );
      highlightedRowRef.current = null;
      // window blur fires when user Alt+Tabs or clicks outside browser
      forceCancelledRef.current = true;
      setActiveData(null);
      setOverFolder(null);
      document.body.style.cursor = "";
      document.body.classList.remove("cc-file-dragging");
      restoreSelection();
    };
    document.addEventListener("visibilitychange", cleanup);
    window.addEventListener("blur", blurCleanup);
    return () => {
      document.removeEventListener("visibilitychange", cleanup);
      window.removeEventListener("blur", blurCleanup);
    };
  }, [activeData, restoreSelection]);

  // When a cross-project copy dialog is dismissed (file_action goes from
  // "copy" back to undefined), restore the pre-drag checked files.
  const file_action = useTypedRedux({ project_id }, "file_action");
  const prevFileAction = useRef(file_action);
  useEffect(() => {
    if (
      prevFileAction.current === "copy" &&
      !file_action &&
      preDragCheckedRef.current
    ) {
      restoreSelection();
    }
    prevFileAction.current = file_action;
  }, [file_action, restoreSelection]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      // Clean up DOM highlight
      highlightedRowRef.current?.classList.remove(
        "cc-explorer-row-drop-target",
        "cc-explorer-row-drop-invalid",
      );
      highlightedRowRef.current = null;

      setActiveData(null);
      setOverFolder(null);
      document.body.style.cursor = "";
      document.body.classList.remove("cc-file-dragging");

      // If the drag was force-cancelled by blur/visibility handlers,
      // skip the operation — the drag data from dnd-kit may be stale.
      if (forceCancelledRef.current) {
        forceCancelledRef.current = false;
        restoreSelection();
        return;
      }

      const dragData = event.active.data.current as FileDragData | undefined;
      if (!dragData || dragData.type !== "file-drag") {
        restoreSelection();
        return;
      }

      if (!actions) {
        restoreSelection();
        return;
      }

      // Resolve drop target: check DOM first (covers file listing folder
      // rows that no longer register as dnd-kit droppables), then fall
      // back to dnd-kit's collision detection.
      const pos = pointerPos.current;
      const domFolderPath = findFolderDropPathAtPoint(pos.x, pos.y);
      const dndDropData = event.over?.data?.current as
        | FolderDropData
        | undefined;
      const dropPath =
        domFolderPath ??
        (dndDropData?.type === "folder-drop" ? dndDropData.path : null);

      // Case 1: Valid drop on a folder within the same project
      if (dropPath != null) {
        // Prevent dropping a folder into itself or a descendant
        if (
          dragData.paths.some(
            (p) => p === dropPath || dropPath.startsWith(p + "/"),
          )
        ) {
          restoreSelection();
          return;
        }
        // Prevent no-op move (all files already in the target folder)
        if (dragData.paths.every((p) => path_split(p).head === dropPath)) {
          restoreSelection();
          return;
        }

        try {
          if (shiftKey) {
            await actions.copy_paths({
              src: dragData.paths,
              dest: dropPath,
            });
          } else {
            await actions.move_files({
              src: dragData.paths,
              dest: dropPath,
            });
          }
          actions.set_all_files_unchecked();
          preDragCheckedRef.current = null;
          // Refresh both source and destination directories so listings
          // update correctly even when browsing paths differ from current_path.
          const srcDir = path_split(dragData.paths[0]).head;
          actions.fetch_directory_listing({ path: srcDir });
          if (dropPath !== srcDir) {
            actions.fetch_directory_listing({ path: dropPath });
          }
        } catch (err) {
          actions.set_activity({
            id: uuid(),
            error: `Drag-and-drop failed: ${err}`,
          });
          restoreSelection();
        }
        return;
      }

      // Case 2: No valid droppable hit — check if pointer is over a project tab
      const { x, y } = pointerPos.current;
      const targetProjectId = findProjectTabAtPoint(x, y, project_id);
      if (targetProjectId) {
        // Open the copy dialog pre-populated for cross-project copy.
        // Files stay checked so the action-box can use them.
        // Keep preDragCheckedRef alive so we can restore on cancel.
        actions?.setState({
          file_action: "copy",
          copy_destination_project_id: targetProjectId,
        } as any);
        return;
      }

      // Case 3: Dropped nowhere — restore original selection
      restoreSelection();
    },
    [actions, shiftKey, project_id, restoreSelection],
  );

  // Cancel handler: same cleanup as the start of onDragEnd + restore selection.
  // Fires when the user presses Escape or the sensor cancels mid-drag.
  const handleDragCancel = useCallback(() => {
    highlightedRowRef.current?.classList.remove(
      "cc-explorer-row-drop-target",
      "cc-explorer-row-drop-invalid",
    );
    highlightedRowRef.current = null;
    setActiveData(null);
    setOverFolder(null);
    document.body.style.cursor = "";
    document.body.classList.remove("cc-file-dragging");
    restoreSelection();
  }, [restoreSelection]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null} modifiers={DRAG_OVERLAY_MODIFIERS}>
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
