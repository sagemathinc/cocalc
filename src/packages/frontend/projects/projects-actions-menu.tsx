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

import type { ProjectTableRecord } from "./projects-table-columns";

import { Dropdown, MenuProps, Modal } from "antd";
import { useState } from "react";
import { useIntl } from "react-intl";

import {
  CSS,
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { FIXED_PROJECT_TABS } from "@cocalc/frontend/project/page/file-tab";
import { useStarredFilesManager } from "@cocalc/frontend/project/page/flyouts/store";
import {
  OpenedFile,
  useFilesMenuItems,
  useRecentFiles,
  useServersMenuItems,
} from "./util";
import { HostPickerModal } from "@cocalc/frontend/hosts/pick-host";
import { DEFAULT_R2_REGION } from "@cocalc/util/consts";

const FILES_SUBMENU_LIST_STYLE: CSS = {
  maxWidth: "80vw",
  minWidth: "150px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  display: "inline-block",
} as const;

interface Props {
  record: ProjectTableRecord;
}

export function ProjectActionsMenu({ record }: Props) {
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const intl = useIntl();
  const actions = useActions("projects");
  const account_id = useTypedRedux("account", "account_id");
  const project_map = useTypedRedux("projects", "project_map");
  const currentHostId = project_map?.getIn([
    record.project_id,
    "host_id",
  ]) as string | undefined;
  const projectRegion = String(
    project_map?.getIn([record.project_id, "region"]) ?? DEFAULT_R2_REGION,
  );
  const project_log = useTypedRedux(
    { project_id: record.project_id },
    "project_log",
  );

  // Initialize project_log when menu opens if not already loaded
  function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen);
    if (newOpen && project_log == null) {
      redux.getProjectStore(record.project_id).init_table("project_log");
    }
  }

  // Check if user is owner of this project
  const isOwner =
    project_map?.getIn([record.project_id, "users", account_id, "group"]) ===
    "owner";

  // Get recent files - only when menu is open
  const recentFiles: OpenedFile[] = useRecentFiles(project_log, open ? 100 : 0);

  // Get starred files - only when menu is open
  const { starred } = useStarredFilesManager(record.project_id, open);

  const starredFilesSubmenu: MenuProps["items"] = useFilesMenuItems(starred, {
    emptyLabel: "No starred files",
    labelStyle: FILES_SUBMENU_LIST_STYLE,
    keyPrefix: "starred-file:",
  });

  const recentFilesSubmenu: MenuProps["items"] = useFilesMenuItems(
    recentFiles,
    {
      emptyLabel: "No recent files",
      labelStyle: FILES_SUBMENU_LIST_STYLE,
      keyPrefix: "recent-file:",
    },
  );

  // Get available servers/apps
  const serversSubmenu: MenuProps["items"] = useServersMenuItems(
    record.project_id,
  );

  function openProjectTab(tab: string) {
    actions.open_project({
      project_id: record.project_id,
      switch_to: true,
      target: tab,
    });
  }

  function openFile(path: string) {
    const project_actions = redux.getProjectActions(record.project_id);
    if (project_actions) {
      project_actions.open_file({ path });
    }
  }

  const handleMenuClick: MenuProps["onClick"] = async ({ key, domEvent }) => {
    domEvent.stopPropagation(); // Don't trigger row click

    switch (key) {
      case "open":
        actions.open_project({
          project_id: record.project_id,
          switch_to: true,
        });
        break;
      case "explorer":
        openProjectTab("files");
        break;
      case "new":
        openProjectTab("new");
        break;
      case "log":
        openProjectTab("log");
        break;
      case "users":
        openProjectTab("users");
        break;
      case "servers":
        openProjectTab("servers");
        break;
      case "move":
        setMoveOpen(true);
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
      case "remove-self":
        Modal.confirm({
          title: "Remove Myself from Project",
          content: (
            <div>
              <p>Are you sure you want to remove yourself from this project?</p>
              <p>
                <strong>
                  You will no longer have access and cannot add yourself back.
                </strong>
              </p>
            </div>
          ),
          okText: "Yes, Remove Me",
          okButtonProps: { danger: true },
          onOk: async () => {
            try {
              await actions.remove_collaborator(record.project_id, account_id);
              redux.getActions("page").close_project_tab(record.project_id);
            } catch (error) {
              console.error("Failed to remove collaborator:", error);
            }
          },
        });
        break;
      default:
        // Handle starred files - check if key starts with "starred-file:"
        if (key.startsWith("starred-file:")) {
          const filename = key.substring("starred-file:".length);
          openFile(filename);
        }
        // Handle recent files - check if key starts with "recent-file:"
        else if (key.startsWith("recent-file:")) {
          const filename = key.substring("recent-file:".length);
          openFile(filename);
        }
        break;
    }
    setOpen(false);
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "explorer",
      label: intl.formatMessage(labels.explorer),
      icon: <Icon name={FIXED_PROJECT_TABS.files.icon} />,
    },
    {
      type: "divider",
    },
    {
      key: "starred-files",
      label: "Starred Files",
      icon: <Icon name="star-filled" />,
      children: starredFilesSubmenu,
      popupClassName: "cc-starred-files-submenu",
    },
    {
      key: "recent-files",
      label: intl.formatMessage(labels.recent_files),
      icon: <Icon name="history" />,
      children: recentFilesSubmenu,
      popupClassName: "cc-recent-files-submenu",
    },
    {
      key: "apps",
      label: "Apps",
      icon: <Icon name="server" />,
      children: serversSubmenu,
      popupClassName: "cc-apps-submenu",
    },
    {
      type: "divider",
    },
    {
      key: "new",
      label: intl.formatMessage(labels.new),
      icon: <Icon name={FIXED_PROJECT_TABS.new.icon} />,
    },
    {
      key: "log",
      label: "Log",
      icon: <Icon name={FIXED_PROJECT_TABS.log.icon} />,
    },
    {
      key: "users",
      label: "Users",
      icon: <Icon name={FIXED_PROJECT_TABS.users.icon} />,
    },
    {
      key: "servers",
      label: "Servers",
      icon: <Icon name={FIXED_PROJECT_TABS.servers.icon} />,
    },
    {
      key: "settings",
      label: "Settings",
      icon: <Icon name={FIXED_PROJECT_TABS.settings.icon} />,
    },
    {
      key: "move",
      label: "Move to host…",
      icon: <Icon name="server" />,
    },
    {
      type: "divider",
    },
    ...(!isOwner
      ? [
          {
            key: "remove-self",
            label: "Remove Myself as Collaborator",
            icon: <Icon name="user-times" />,
            danger: true,
          },
          {
            type: "divider" as const,
          },
        ]
      : []),
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
      {moveOpen && (
        <HostPickerModal
          open={moveOpen}
          currentHostId={currentHostId}
          regionFilter={projectRegion}
          lockRegion
          onCancel={() => setMoveOpen(false)}
          onSelect={async (dest_host_id) => {
            setMoveOpen(false);
            try {
              await actions.move_project_to_host(record.project_id, dest_host_id);
            } catch (err) {
              console.error("move project failed", err);
              Modal.error({
                title: "Move failed",
                content: `${err}`,
              });
            }
          }}
        />
      )}
      <style>
        {`
          .cc-starred-files-submenu .ant-dropdown-menu,
          .cc-recent-files-submenu .ant-dropdown-menu,
          .cc-apps-submenu .ant-dropdown-menu {
            max-height: 50vh;
            overflow-y: auto;
          }
        `}
      </style>
      <Dropdown
        menu={{ items: menuItems, onClick: handleMenuClick }}
        trigger={["click"]}
        open={open}
        onOpenChange={handleOpenChange}
      >
        <span style={{ fontSize: "18px", padding: "4px 8px" }}>
          <Icon name="ellipsis" rotate="90" />
        </span>
      </Dropdown>
    </div>
  );
}
