/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  green as ANTD_GREEN,
  orange as ANTD_ORANGE,
  yellow as ANTD_YELLOW,
} from "@ant-design/colors";

import { CSS, useMemo } from "@cocalc/frontend/app-framework";
import { DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";
import { capitalize, getRandomColor, hexColorToRGBA } from "@cocalc/util/misc";
import { server_time } from "@cocalc/util/relative-time";
import { COLORS } from "@cocalc/util/theme";
import { BORDER_WIDTH_PX } from "./consts";
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

export function randomBorder(group: string, side: "left" | "bottom"): CSS {
  const col = deterministicColor(group);
  return fileItemBorder(col, side);
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

// Depending on age, highlight  entries from the past past 24 hours and week
export function fileItemStyle(time: number = 0, masked: boolean = false): CSS {
  const diff = server_time().getTime() - time;
  const days = Math.max(0, diff / 1000 / 60 / 60 / 24);
  let col = "rgba(1, 1, 1, 0)";
  if (days < 1 / 24) {
    col = hexColorToRGBA(ANTD_GREEN[3], 1);
  } else if (days < 1) {
    const opacity = 1 - days / 2; // only fade to 50%
    col = hexColorToRGBA(ANTD_ORANGE[3], opacity);
  } else if (days < 14) {
    const opacity = 1 - (days - 1) / 14;
    col = hexColorToRGBA(ANTD_YELLOW[5], opacity);
  }
  const base = {
    ...fileItemBorder(col, "left"),
  };
  return masked ? { ...base, color: COLORS.FILE_DIMMED } : base;
}

export function fileItemBorder(color: string, side: "left" | "top" | "bottom") {
  return {
    [`border${capitalize(side)}`]: `${BORDER_WIDTH_PX} solid ${color}`,
  } as CSS;
}
