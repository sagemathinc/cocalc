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
}

/**
 * Return the standard file-action menu items (compress, delete, rename,
 * duplicate, move, copy, share).  Download is intentionally skipped for
 * non-directory items because both callers render their own dedicated
 * Download entry at the bottom of the menu.
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
  } = opts;

  if (disableActions) return [];

  const actionNames = multiple
    ? ACTION_BUTTONS_MULTI
    : isdir
      ? ACTION_BUTTONS_DIR
      : ACTION_BUTTONS_FILE;

  const items: NonNullable<MenuProps["items"]> = [];

  for (const key of actionNames) {
    // Download for non-dirs is handled separately by each surface.
    if (key === "download" && !isdir) continue;

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
