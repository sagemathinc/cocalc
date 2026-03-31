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
 * horizontal axis, and uses the same sensor activation parameters as the
 * frame editor drag handles (MOUSE_SENSOR_OPTIONS / TOUCH_SENSOR_OPTIONS).
 */

import { CSSProperties, ReactNode, useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";

import {
  MOUSE_SENSOR_OPTIONS,
  TOUCH_SENSOR_OPTIONS,
} from "@cocalc/frontend/components/dnd";

interface SortableButtonBarProps {
  items: string[];
  children: ReactNode;
  onReorder: (newOrder: string[]) => void;
  renderOverlayItem?: (id: string) => ReactNode;
}

export function SortableButtonBar({
  items,
  children,
  onReorder,
  renderOverlayItem,
}: SortableButtonBarProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_SENSOR_OPTIONS),
    useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(`${event.active.id}`);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
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

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      modifiers={[restrictToHorizontalAxis]}
    >
      <SortableContext
        items={items}
        strategy={horizontalListSortingStrategy}
      >
        {children}
      </SortableContext>
      <DragOverlay>
        {activeId != null && renderOverlayItem?.(activeId)}
      </DragOverlay>
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "inline-block",
        transform: transform
          ? `translate3d(${transform.x}px, 0, 0)`
          : undefined,
        transition,
        opacity: isDragging ? 0.35 : undefined,
        cursor: isDragging ? "grabbing" : undefined,
        ...style,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
