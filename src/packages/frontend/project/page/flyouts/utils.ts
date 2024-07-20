/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSS, useMemo } from "@cocalc/frontend/app-framework";
import { DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";
import { getRandomColor } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { fileItemLeftBorder } from "./file-list-item";
import { FlyoutActiveMode, FlyoutLogDeduplicate, FlyoutLogMode } from "./state";

export const FLYOUT_LOG_DEFAULT_MODE: FlyoutLogMode = "files";

export const FLYOUT_ACTIVE_DEFAULT_MODE: FlyoutActiveMode = "tabs";

export const FLYOUT_LOG_DEFAULT_DEDUP: FlyoutLogDeduplicate = true;

export const FLYOUT_LOG_FILTER_MODES = [
  "open",
  "files",
  "project",
  "share",
  "user",
  "other",
] as const;
export type FlyoutLogFilter = (typeof FLYOUT_LOG_FILTER_MODES)[number];

// by default, we show all events except for the file openings
// they are in the separate "files" tab
export const FLYOUT_LOG_FILTER_DEFAULT = FLYOUT_LOG_FILTER_MODES.filter(
  (x) => x !== "open",
) as Readonly<FlyoutLogFilter[]>;

export const GROUP_STYLE: CSS = {
  fontWeight: "bold",
  marginTop: "5px",
} as const;

export function deterministicColor(group: string) {
  return group === ""
    ? COLORS.GRAY_L
    : getRandomColor(group, { diff: 30, min: 185, max: 245 });
}

export function randomLeftBorder(group: string): CSS {
  const col = deterministicColor(group);
  return fileItemLeftBorder(col);
}

export function useSingleFile({
  checked_files,
  activeFile,
  getFile,
  directoryFiles,
}): DirectoryListingEntry | undefined {
  return useMemo(() => {
    if (checked_files.size === 0 && activeFile != null) {
      return activeFile;
    }
    if (checked_files.size === 1) {
      return getFile(checked_files.first() ?? "");
    }
  }, [checked_files, directoryFiles, activeFile]);
}
