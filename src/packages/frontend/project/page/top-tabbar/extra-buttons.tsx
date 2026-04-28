/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useState } from "react";
import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
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
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToFirstScrollableAncestor,
} from "@dnd-kit/modifiers";

import { Icon } from "@cocalc/frontend/components";
import { STAY_OPEN_ON_CLICK } from "@cocalc/frontend/components/dropdown-menu";
import {
  MOUSE_SENSOR_OPTIONS,
  TOUCH_SENSOR_OPTIONS,
} from "@cocalc/frontend/components/dnd";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "../../context";
import { useActions, useIsMountedRef } from "@cocalc/frontend/app-framework";
import { getJupyterActions } from "@cocalc/frontend/frame-editors/whiteboard-editor/elements/code/actions";
import { useIntl } from "react-intl";
import type { TopBarActionsData } from "./types";

const BUTTON_STYLE: CSSProperties = {
  fontSize: "14pt",
  padding: "0 5px",
} as const;

const BUTTON_ICON = (<Icon name="ellipsis" rotate="90" />) as ReactNode;

interface ExtraButtonsProps {
  actionsData: TopBarActionsData | null;
  path: string;
}

function SortableItem({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, active } =
    useSortable({ id });
  const isActive = active?.id === id;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${isActive ? 8 : 0}px, ${transform.y}px, 0)`
          : undefined,
        transition,
        zIndex: isActive ? 10 : undefined,
        opacity: isActive ? 0.9 : undefined,
        background: isActive ? "var(--cocalc-bg-hover, #f0f0f0)" : undefined,
        boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.15)" : undefined,
        borderRadius: isActive ? 4 : undefined,
        cursor: isActive ? "grabbing" : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

/**
 * Wrap each top-level menu item label with a sortable drag handle.
 */
function wrapItemsForDnD(
  items: NonNullable<MenuProps["items"]>,
  buttonNames: string[],
): NonNullable<MenuProps["items"]> {
  return items.map((item, i) => {
    if (item == null) return item;
    const name = buttonNames[i];
    if (name == null || !("label" in item)) return item;
    return {
      ...item,
      label: <SortableItem id={name}>{item.label}</SortableItem>,
    };
  });
}

export function ExtraButtons(props: Readonly<ExtraButtonsProps>): ReactNode {
  const { actionsData, path } = props;
  const intl = useIntl();
  const isMounted = useIsMountedRef();
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const [open, setOpen] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_SENSOR_OPTIONS),
    useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (actionsData == null) return;
      const { active, over } = event;
      if (over == null || active.id === over.id) return;
      const names = actionsData.buttonNames;
      const oldIndex = names.indexOf(`${active.id}`);
      const newIndex = names.indexOf(`${over.id}`);
      if (oldIndex === -1 || newIndex === -1) return;
      actionsData.onReorder(arrayMove(names, oldIndex, newIndex));
    },
    [actionsData],
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
  }, []);

  const handleMenuClick: MenuProps["onClick"] = useCallback((e) => {
    if (e.key?.includes(STAY_OPEN_ON_CLICK)) {
      // Keep open for stayOpenOnClick items
      setOpen(true);
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      if (path.endsWith(".ipynb")) {
        const jupyterActions = await getJupyterActions({ project_id, path });
        if (!isMounted.current) return;
        jupyterActions?.halt();
      }
    } catch (err) {
      console.error("Problem stopping jupyter kernel, ignoring", err);
    }
    actions?.close_tab(path);
  }, [actions, isMounted, path, project_id]);

  const menuItems = actionsData?.menuItems ?? [];
  const buttonNames = actionsData?.buttonNames ?? [];
  const sortableItems = wrapItemsForDnD(menuItems, buttonNames);
  const renderedItems: NonNullable<MenuProps["items"]> = [
    ...sortableItems,
    ...(menuItems.length > 0 ? [{ type: "divider" as const }] : []),
    {
      key: "close-editor",
      icon: <Icon name="times" />,
      label: intl.formatMessage(labels.close),
      onClick: handleClose,
    },
  ];

  return (
    <Dropdown
      open={open}
      onOpenChange={handleOpenChange}
      trigger={["click"]}
      placement="bottomRight"
      menu={{
        items: renderedItems,
        style: { maxHeight: "70vh", overflow: "auto" },
        onClick: handleMenuClick,
      }}
      dropdownRender={(menu) => (
        <DndContext
          sensors={sensors}
          onDragEnd={handleDragEnd}
          modifiers={[
            restrictToVerticalAxis,
            restrictToFirstScrollableAncestor,
          ]}
        >
          <SortableContext
            items={buttonNames}
            strategy={verticalListSortingStrategy}
          >
            {menu}
          </SortableContext>
        </DndContext>
      )}
    >
      <Button type="text" style={BUTTON_STYLE}>
        {BUTTON_ICON}
      </Button>
    </Dropdown>
  );
}
