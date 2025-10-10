/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Actions menu for project table rows
 *
 * Dropdown menu with context-sensitive actions for each project:
 * - Open project
 * - Open settings
 * - Hide/Unhide (conditional)
 * - Delete/Undelete (conditional)
 */

import { Dropdown, MenuProps } from "antd";
import { useState } from "react";

import { useActions } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import type { ProjectTableRecord } from "./project-table-columns";

interface Props {
  record: ProjectTableRecord;
}

export function ProjectActionsMenu({ record }: Props) {
  const [open, setOpen] = useState(false);
  const actions = useActions("projects");

  const handleMenuClick: MenuProps["onClick"] = async ({ key, domEvent }) => {
    domEvent.stopPropagation(); // Don't trigger row click

    switch (key) {
      case "open":
        actions.open_project({
          project_id: record.project_id,
          switch_to: true,
        });
        break;
      case "settings":
        actions.open_project({
          project_id: record.project_id,
          switch_to: true,
          target: "settings",
        });
        break;
      case "hide":
        await actions.toggle_hide_project(record.project_id);
        break;
      case "delete":
        await actions.toggle_delete_project(record.project_id);
        break;
    }
    setOpen(false);
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "open",
      label: "Open Project",
      icon: <Icon name="folder-open" />,
    },
    {
      key: "settings",
      label: "Open Settings",
      icon: <Icon name="settings" />,
    },
    {
      type: "divider",
    },
    {
      key: "hide",
      label: record.hidden ? "Unhide Project" : "Hide Project",
      icon: <Icon name={record.hidden ? "eye" : "eye-slash"} />,
    },
    {
      key: "delete",
      label: record.deleted ? "Undelete Project" : "Delete Project",
      icon: <Icon name={record.deleted ? "undo" : "trash"} />,
      danger: !record.deleted,
    },
  ];

  return (
    <div
      onClick={(e) => e.stopPropagation()} // Prevent row click when clicking menu
      style={{ cursor: "pointer" }}
    >
      <Dropdown
        menu={{ items: menuItems, onClick: handleMenuClick }}
        trigger={["click"]}
        open={open}
        onOpenChange={setOpen}
      >
        <span style={{ fontSize: "18px", padding: "4px 8px" }}>
          <Icon name="ellipsis" rotate="90" />
        </span>
      </Dropdown>
    </div>
  );
}
