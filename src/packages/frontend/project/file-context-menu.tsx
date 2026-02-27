/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared file-action context menu items used by both the flyout file list
and the file tab bar.  Only the common action entries (compress, delete,
rename, …) live here; surface-specific items (Close tab, Open in new
window, View / Download links, header) are assembled by each caller.
*/

import type { MenuProps } from "antd";
import type { IntlShape } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import {
  ACTION_BUTTONS_DIR,
  ACTION_BUTTONS_FILE,
  ACTION_BUTTONS_MULTI,
  isDisabledSnapshots,
} from "@cocalc/frontend/project/explorer/action-bar";
import {
  FILE_ACTIONS,
  type FileAction,
} from "@cocalc/frontend/project_actions";
import { HOME_ROOT } from "@cocalc/util/consts/files";
import { path_split } from "@cocalc/util/misc";

interface BuildFileActionItemsOptions {
  /** Is the target a directory? */
  isdir: boolean;
  /** react-intl instance for translating action labels */
  intl: IntlShape;
  /** Multi-file mode — selects ACTION_BUTTONS_MULTI */
  multiple?: boolean;
  /** When true all action items are suppressed (student projects) */
  disableActions?: boolean;
  /** Whether the file is inside a .snapshots path */
  inSnapshots?: boolean;
  /** Callback invoked when the user picks an action */
  triggerFileAction: (action: FileAction) => void;
  /** Full path of the file (for copy path entries); omit in multi mode */
  fullPath?: string;
}

/**
 * Return the standard file-action menu items (compress, delete, rename,
 * duplicate, move, copy).  Download and share/publish are intentionally
 * skipped because each calling surface renders its own dedicated entries
 * for those (download at the bottom, share/publish with state awareness).
 */
export function buildFileActionItems(
  opts: BuildFileActionItemsOptions,
): NonNullable<MenuProps["items"]> {
  const {
    isdir,
    intl,
    multiple = false,
    disableActions = false,
    inSnapshots = false,
    triggerFileAction,
    fullPath,
  } = opts;

  if (disableActions) return [];

  const items: NonNullable<MenuProps["items"]> = [];

  // Copy filename / path entries (single file only)
  if (!multiple && fullPath) {
    const filename = path_split(fullPath).tail;
    // HOME_ROOT is a symlink to / — show as absolute path
    const rootPrefix = HOME_ROOT + "/";
    const displayPath = fullPath.startsWith(rootPrefix)
      ? "/" + fullPath.slice(rootPrefix.length)
      : `~/${fullPath}`;

    items.push(
      {
        key: "copy-filename",
        label: intl.formatMessage({
          id: "project.file-context-menu.copy-filename",
          defaultMessage: "Copy filename",
        }),
        icon: <Icon name="copy" />,
        onClick: () => navigator.clipboard.writeText(filename),
      },
      {
        key: "copy-path",
        label: intl.formatMessage({
          id: "project.file-context-menu.copy-path",
          defaultMessage: "Copy path",
        }),
        icon: <Icon name="copy" />,
        onClick: () => navigator.clipboard.writeText(displayPath),
      },
      { key: "divider-copy", type: "divider" },
    );
  }

  const actionNames = multiple
    ? ACTION_BUTTONS_MULTI
    : isdir
      ? ACTION_BUTTONS_DIR
      : ACTION_BUTTONS_FILE;

  for (const key of actionNames) {
    // Download for non-dirs and share/publish are handled separately
    // by each surface with their own dedicated entries.
    if (key === "download" && !isdir) continue;
    if (key === "share") continue;

    const actionInfo = FILE_ACTIONS[key];
    if ("hideFlyout" in actionInfo && actionInfo.hideFlyout) continue;

    const disabled = isDisabledSnapshots(key) && inSnapshots;

    items.push({
      key,
      label: intl.formatMessage(actionInfo.name),
      icon: <Icon name={actionInfo.icon} />,
      disabled,
      onClick: () => triggerFileAction(key as FileAction),
    });
  }

  return items;
}
