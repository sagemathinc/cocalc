import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import { ReactNode } from "react";

export { useSortable };

interface Props {
  onDragStart?: ((event) => void) | undefined;
  onDragEnd?: ((event) => void) | undefined;
  items: (string | number)[];
  children?: ReactNode;
}

export function SortableTabs({
  onDragStart,
  onDragEnd,
  items,
  children,
}: Props) {
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 2,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 100,
      tolerance: 3,
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  return (
    <DndContext
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
      sensors={sensors}
    >
      <SortableContext items={items} strategy={horizontalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function SortableTab({ children, id }) {
  const { attributes, listeners, setNodeRef, transform, transition, active } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
        zIndex: active?.id == id ? 1 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

export function renderTabBar(tabBarProps, DefaultTabBar) {
  return (
    <DefaultTabBar {...tabBarProps}>
      {(node) => (
        <SortableTab key={node.key} id={node.key}>
          {node}
        </SortableTab>
      )}
    </DefaultTabBar>
  );
}
