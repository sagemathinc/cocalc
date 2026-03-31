/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * Wraps toolbar buttons in a horizontal sortable DnD context so the user
 * can reorder them via drag-and-drop. The new order is persisted via
 * ManageCommands.setToolbarOrder().
 *
 * Uses @dnd-kit with horizontalListSortingStrategy, restricted to the
 * horizontal axis AND to the parent element (so the dragged button
 * visually stays inside the bar). Uses the same sensor activation
 * parameters as the frame editor drag handles.
 *
 * No DragOverlay is used — the actual button moves in place while
 * siblings animate aside, giving clear visual feedback.
 */

import { CSSProperties, ReactNode, useCallback } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";

import {
  MOUSE_SENSOR_OPTIONS,
  TOUCH_SENSOR_OPTIONS,
} from "@cocalc/frontend/components/dnd";

interface SortableButtonBarProps {
  items: string[];
  children: ReactNode;
  onReorder: (newOrder: string[]) => void;
}

export function SortableButtonBar({
  items,
  children,
  onReorder,
}: SortableButtonBarProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_SENSOR_OPTIONS),
    useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over == null || active.id === over.id) return;
      const oldIndex = items.indexOf(`${active.id}`);
      const newIndex = items.indexOf(`${over.id}`);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(items, oldIndex, newIndex);
      onReorder(newOrder);
    },
    [items, onReorder],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
    >
      <SortableContext items={items} strategy={horizontalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

interface SortableButtonItemProps {
  id: string;
  children: ReactNode;
  style?: CSSProperties;
}

export function SortableButtonItem({
  id,
  children,
  style,
}: SortableButtonItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, active } =
    useSortable({ id });

  const isActive = active?.id === id;

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "inline-block",
        transform: transform
          ? `translate3d(${transform.x}px, 0, 0)`
          : undefined,
        transition,
        // The dragged item gets a highlight; others stay normal
        zIndex: isActive ? 10 : undefined,
        background: isActive ? "#e0e7ff" : undefined,
        borderRadius: isActive ? 4 : undefined,
        boxShadow: isActive
          ? "0 1px 4px rgba(0,0,0,0.18)"
          : undefined,
        cursor: isActive ? "grabbing" : undefined,
        ...style,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
