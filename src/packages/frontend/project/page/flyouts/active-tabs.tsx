/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// File-tabs in the active files (editors) flyout.

import { COLORS } from "@cocalc/util/theme";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToVerticalAxis,
  restrictToWindowEdges,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS as DNDCSS } from "@dnd-kit/utilities";

interface Props {
  openTabs: string[];
  dndDragEnd: (event: any) => void;
  renderFileItem: (path: string, how: "file" | "undo") => React.JSX.Element;
  disabled: boolean;
}

export function OpenFileTabs({
  openTabs,
  dndDragEnd,
  renderFileItem,
  disabled,
}: Props): React.JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={dndDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext items={openTabs} strategy={verticalListSortingStrategy}>
        <DragOverlay modifiers={[restrictToWindowEdges]} />
        {openTabs.map((path: string) => (
          <SortableTab
            key={path}
            path={path}
            renderFileItem={renderFileItem}
            disabled={disabled}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableTab({
  path,
  renderFileItem,
  disabled,
}: {
  path: string;
  renderFileItem: Props["renderFileItem"];
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: path, disabled });

  const style = {
    transform: DNDCSS.Transform.toString(transform),
    transition,
    ...(isDragging
      ? {
          backgroundColor: COLORS.BLUE_LLLL,
          border: `1px solid ${COLORS.BLUE_LL}`,
          boxShadow: "0 0 4px 2px rgba(0, 0, 0, 0.1)",
        }
      : {}),
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {renderFileItem(path, "file")}
    </div>
  );
}
