/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Supplies the interface for creating file editors in the webapp

// I factored out the pure javascript code that doesn't require a bunch of very frontend-ish stuff
// here, but still want this file to provide these as exports, so I don't have to change code
// all over the place:
import { defineMessage } from "react-intl";

import type { IconName } from "@cocalc/frontend/components/icon";
import { IntlMessage } from "@cocalc/frontend/i18n";

import { file_associations } from "./file-associations";
export {
  icon,
  register_file_editor,
  initialize,
  initializeAsync,
  generateAsync,
  remove,
  save,
} from "./file-editors";

const NO_EXT_PREFIX = "noext-";
export function special_filenames_with_no_extension(): string[] {
  const v: string[] = [];
  for (const name in file_associations) {
    if (name.startsWith(NO_EXT_PREFIX)) {
      v.push(name.slice(NO_EXT_PREFIX.length));
    }
  }
  return v;
}

export interface FileActionInfo {
  name: IntlMessage;
  icon: IconName;
  allows_multiple_files?: boolean;
  hideFlyout?: boolean;
}

const _FILE_ACTIONS = {
  compress: {
    name: defineMessage({
      id: "file_actions.compress.name",
      defaultMessage: "Compress",
      description: "Compress a file",
    }),
    icon: "compress" as IconName,
    allows_multiple_files: true,
  },
  delete: {
    name: defineMessage({
      id: "file_actions.delete.name",
      defaultMessage: "Delete",
      description: "Delete a file",
    }),
    icon: "trash" as IconName,
    allows_multiple_files: true,
  },
  rename: {
    name: defineMessage({
      id: "file_actions.rename.name",
      defaultMessage: "Rename",
      description: "Rename a file",
    }),
    icon: "swap" as IconName,
    allows_multiple_files: false,
  },
  duplicate: {
    name: defineMessage({
      id: "file_actions.duplicate.name",
      defaultMessage: "Duplicate",
      description: "Duplicate a file",
    }),
    icon: "clone" as IconName,
    allows_multiple_files: false,
  },
  move: {
    name: defineMessage({
      id: "file_actions.move.name",
      defaultMessage: "Move",
      description: "Move a file",
    }),
    icon: "move" as IconName,
    allows_multiple_files: true,
  },
  copy: {
    name: defineMessage({
      id: "file_actions.copy.name",
      defaultMessage: "Copy",
      description: "Copy a file",
    }),
    icon: "files" as IconName,
    allows_multiple_files: true,
  },
  share: {
    name: defineMessage({
      id: "file_actions.publish.name",
      defaultMessage: "Publish",
      description: "Publish a file",
    }),
    icon: "share-square" as IconName,
    allows_multiple_files: false,
  },
  download: {
    name: defineMessage({
      id: "file_actions.download.name",
      defaultMessage: "Download",
      description: "Download a file",
    }),
    icon: "cloud-download" as IconName,
    allows_multiple_files: true,
  },
  upload: {
    name: defineMessage({
      id: "file_actions.upload.name",
      defaultMessage: "Upload",
      description: "Upload a file",
    }),
    icon: "upload" as IconName,
    hideFlyout: true,
  },
  create: {
    name: defineMessage({
      id: "file_actions.create.name",
      defaultMessage: "Create",
      description: "Create a file",
    }),
    icon: "plus-circle" as IconName,
    hideFlyout: true,
  },
} as const satisfies Record<string, FileActionInfo>;

export type FileAction = keyof typeof _FILE_ACTIONS;

export const FILE_ACTIONS: Record<FileAction, FileActionInfo> = _FILE_ACTIONS;

// Extended commands accepted by show_file_action_panel() that route to
// navigation actions rather than the ActionBox dialog.
export type FileCommand =
  | FileAction
  | "new"
  | "open"
  | "open_recent"
  | "close"
  | "quit";

export type FileActionSource = "editor";
