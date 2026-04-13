/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MenuProps } from "antd";
import * as immutable from "immutable";
import type { IntlShape } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { open_new_tab } from "@cocalc/frontend/misc";
import { buildFileActionItems } from "@cocalc/frontend/project/file-context-menu";
import { url_href } from "@cocalc/frontend/project/utils";
import { type FileAction, ProjectActions } from "@cocalc/frontend/project_actions";
import * as misc from "@cocalc/util/misc";

import { VIEWABLE_FILE_EXT } from "./utils";
import type { FileEntry } from "./types";

interface BuildContextMenuOpts {
  record: FileEntry;
  current_path: string;
  checked_files: immutable.Set<string>;
  recordMap: Map<string, FileEntry>;
  computeServerId: number | undefined;
  disableActions: boolean;
  intl: IntlShape;
  actions: ProjectActions;
  handleRowClick: (record: FileEntry, e: React.MouseEvent) => void;
}

export function makeContextMenu({
  record,
  current_path,
  checked_files,
  recordMap,
  computeServerId,
  disableActions,
  intl,
  actions,
  handleRowClick,
}: BuildContextMenuOpts): MenuProps["items"] {
  if (record.name === ".." || disableActions) {
    return [];
  }

  const fp = misc.path_to_file(current_path, record.name);
  const alreadyChecked = checked_files.has(fp);
  // Effective selection count if the user triggers a file action:
  // the target file will be added to the checked set.
  const effectiveCount = alreadyChecked
    ? checked_files.size
    : checked_files.size + 1;
  const multiple = effectiveCount > 1;

  const nameStr = misc.trunc_middle(record.name, 30);
  const typeStr = intl.formatMessage(labels.file_or_folder, {
    isDir: String(!!record.isdir),
  });
  const sizeStr = record.size ? misc.human_readable_size(record.size) : "";

  const ctx: NonNullable<MenuProps["items"]> = [];

  // Header
  if (multiple) {
    ctx.push({
      key: "header",
      icon: <Icon name="files" />,
      label: `${effectiveCount} ${misc.plural(effectiveCount, "file")}`,
      disabled: true,
      style: { fontWeight: "bold", cursor: "default" },
    });
    // "Open All Files" — collect non-directory files from the
    // effective checked set and open each one.
    const filePaths: string[] = [];
    const effectiveSet = alreadyChecked ? checked_files : checked_files.add(fp);
    for (const p of effectiveSet) {
      const name = misc.path_split(p).tail;
      const entry = recordMap.get(name);
      if (entry && !entry.isdir) {
        filePaths.push(p);
      }
    }
    if (filePaths.length > 0) {
      ctx.push({
        key: "open-all",
        icon: <Icon name="edit-filled" />,
        label: `Open ${filePaths.length} ${misc.plural(filePaths.length, "file")}`,
        onClick: () => {
          for (let i = 0; i < filePaths.length; i++) {
            actions.open_file({
              path: filePaths[i],
              foreground: i === 0,
            });
          }
        },
      });
    }
  } else {
    ctx.push({
      key: "header",
      icon: <Icon name={record.isdir ? "folder-open" : "file"} />,
      label: `${typeStr} ${nameStr}${sizeStr ? ` (${sizeStr})` : ""}`,
      title: record.name,
      disabled: true,
      style: { fontWeight: "bold", cursor: "default" },
    });
    ctx.push({
      key: "open",
      icon: <Icon name="edit-filled" />,
      label: intl.formatMessage(labels.open_file_or_folder, {
        isDir: String(!!record.isdir),
      }),
      onClick: () => handleRowClick(record, {} as any),
    });
    // "Open in new window" — same as the file tab context menu
    if (!record.isdir) {
      ctx.push({
        key: "new-window",
        icon: <Icon name="external-link" />,
        label: intl.formatMessage({
          id: "project.page.file-tab.context-menu.open-new-window",
          defaultMessage: "Open in new window",
        }),
        onClick: () =>
          actions.open_file({ path: fp, new_browser_window: true }),
      });
    }
    // "View" raw link — for viewable text/image files
    if (!record.isdir) {
      const ext = (
        misc.filename_extension(record.name) ?? ""
      ).toLowerCase();
      if (VIEWABLE_FILE_EXT.includes(ext)) {
        const fileUrl = url_href(actions.project_id, fp, computeServerId);
        ctx.push({
          key: "view",
          icon: <Icon name="eye" />,
          label: intl.formatMessage(labels.view_file),
          onClick: () => open_new_tab(fileUrl),
        });
      }
    }
  }

  ctx.push({ key: "divider-header", type: "divider" });

  // File actions add the target file to the checked selection,
  // then trigger the action dialog on the full set.
  const triggerFileAction = (action: FileAction) => {
    actions.set_file_checked(fp, true);
    actions.set_file_action(action);
  };

  ctx.push(
    ...buildFileActionItems({
      isdir: !!record.isdir,
      intl,
      multiple,
      disableActions,
      inSnapshots: current_path?.startsWith(".snapshots") ?? false,
      triggerFileAction,
      fullPath: fp,
    }),
  );

  // Publish/share
  if (!multiple && !disableActions) {
    ctx.push({
      key: "share",
      label: intl.formatMessage(labels.publish_status, {
        isPublished: String(!!record.is_public),
        isDir: String(!!record.isdir),
      }),
      icon: <Icon name="share-square" />,
      disabled: current_path?.startsWith(".snapshots") ?? false,
      onClick: () => triggerFileAction("share"),
    });
  }

  // Download — immediate action, no selection changes
  if (!record.isdir && !disableActions && !multiple) {
    ctx.push({ key: "divider-download", type: "divider" });
    ctx.push({
      key: "download",
      label: intl.formatMessage(labels.download),
      icon: <Icon name="cloud-download" />,
      onClick: () => actions.download_file({ path: fp, log: true }),
    });
  }

  return ctx;
}
