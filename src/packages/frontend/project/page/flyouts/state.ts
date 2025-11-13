/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { FixedTab, isFixedTab } from "../file-tab";
import { FLYOUT_DEFAULT_WIDTH_PX } from "./consts";
import {
  FLYOUT_ACTIVE_DEFAULT_MODE,
  FLYOUT_LOG_DEFAULT_DEDUP,
  FLYOUT_LOG_DEFAULT_MODE,
  FLYOUT_LOG_FILTER_MODES,
  FlyoutLogFilter,
} from "./utils";

const LogModes = ["files", "history"] as const;
export type FlyoutLogMode = (typeof LogModes)[number];
export function isFlyoutLogMode(val?: string): val is FlyoutLogMode {
  return LogModes.includes(val as any);
}

export type FlyoutLogDeduplicate = boolean;
export function isFlyoutLogDeduplicate(
  val?: unknown,
): val is FlyoutLogDeduplicate {
  return typeof val === "boolean";
}

export function isFlyoutLogFilterMode(val?: string): val is FlyoutLogFilter {
  return FLYOUT_LOG_FILTER_MODES.includes(val as any);
}

const ACTIVE_MODES = ["folder", "type", "tabs"] as const;
export type FlyoutActiveMode = (typeof ACTIVE_MODES)[number];
export function isFlyoutActiveMode(val?: string): val is FlyoutActiveMode {
  return ACTIVE_MODES.includes(val as any);
}

const ACTIVE_TAB_SORTS = ["custom", "alphanum-up", "alphanum-down"] as const;
export type FlyoutActiveTabSort = (typeof ACTIVE_TAB_SORTS)[number];
export function isFlyoutActiveTabSort(
  val?: string,
): val is FlyoutActiveTabSort {
  return ACTIVE_TAB_SORTS.includes(val as any);
}

export type FlyoutActiveStarred = string[];
export function isFlyoutActiveStarred(val?: any): val is FlyoutActiveStarred {
  return Array.isArray(val) && val.every((x) => typeof x === "string");
}

interface FilesMode {
  selected?: { show?: boolean };
  terminal?: { show?: boolean };
}

export type LSFlyout = {
  scroll?: { [name in FixedTab]?: number }; // checked using isPositiveNumber
  width?: number; // checked using isPositiveNumber
  expanded?: FixedTab | null;
  mode?: FlyoutLogMode; // check using isFlyoutLogMode
  deduplicate?: FlyoutLogDeduplicate; // if false, don't deduplicate (default true)
  active?: FlyoutActiveMode; // check using isFlyoutActiveMode
  files?: FilesMode;
  settings?: string[]; // expanded panels
  starred?: FlyoutActiveStarred;
  showStarred?: boolean;
  activeTabSort?: FlyoutActiveTabSort;
  logFilter?: FlyoutLogFilter[];
};

function isPositiveNumber(val: any): val is number {
  return typeof val === "number" && !isNaN(val) && val >= 0;
}

export const lsKey = (project_id: string) => `${project_id}::flyout`;

export function storeFlyoutState(
  project_id: string,
  flyout: FixedTab,
  state: {
    active?: FlyoutActiveMode; // check using isFlyoutActiveMode
    expanded?: boolean;
    files?: FilesMode;
    mode?: string; // check using isFlyoutLogMode
    deduplicate?: boolean;
    scroll?: number;
    settings?: string[]; // expanded panels
    starred?: FlyoutActiveStarred;
    showStarred?: boolean;
    width?: number | null;
    activeTabSort?: FlyoutActiveTabSort;
    logFilter?: FlyoutLogFilter[];
  },
): void {
  const { scroll, expanded, width, mode, files, deduplicate, logFilter } =
    state;
  const key = lsKey(project_id);
  const current = LS.get<LSFlyout>(key) ?? {};
  current.scroll ??= {};

  if (isPositiveNumber(scroll)) {
    current.scroll = { ...current.scroll, [flyout]: scroll };
  } else if (scroll === 0) {
    delete current.scroll[flyout];
  }

  if (isPositiveNumber(width)) {
    current.width = width;
  } else if (width === null) {
    delete current.width;
  }

  if (expanded === true) {
    current.expanded = flyout;
  } else if (expanded === false) {
    delete current.expanded;
  }

  if (flyout === "log") {
    if (isFlyoutLogMode(mode)) {
      current.mode = mode;
    }

    if (isFlyoutLogDeduplicate(deduplicate)) {
      current.deduplicate = deduplicate;
    }

    if (logFilter != null && Array.isArray(logFilter)) {
      current.logFilter = logFilter.filter(isFlyoutLogFilterMode);
    }
  }

  if (flyout === "files" && files != null) {
    const showTerminal = files.terminal?.show === true;
    const showSelected = files.selected?.show === true;
    current.files = {
      terminal: { show: showTerminal },
      selected: { show: showSelected },
    };
  }

  if (flyout === "settings" && Array.isArray(state.settings)) {
    const keys = [...new Set(state.settings)].sort();
    current.settings = keys;
  }

  if (flyout === "active") {
    if (isFlyoutActiveMode(state.active)) {
      current.active = state.active;
    }

    if (isFlyoutActiveStarred(state.starred)) {
      current.starred = state.starred;
    }

    if (typeof state.showStarred === "boolean") {
      current.showStarred = state.showStarred;
    }

    if (isFlyoutActiveTabSort(state.activeTabSort)) {
      current.activeTabSort = state.activeTabSort;
    }
  }

  LS.set(key, current);
}

export function getFlyoutExpanded(project_id: string): FixedTab | null {
  const expanded = LS.get<LSFlyout>(lsKey(project_id))?.expanded;
  return isFixedTab(expanded) ? expanded : null;
}

export function getFlyoutWidth(project_id: string): number {
  const width = LS.get<LSFlyout>(lsKey(project_id))?.width;
  return isPositiveNumber(width) ? width : FLYOUT_DEFAULT_WIDTH_PX;
}

export function getFlyoutLogMode(project_id: string): FlyoutLogMode {
  const mode = LS.get<LSFlyout>(lsKey(project_id))?.mode;
  return isFlyoutLogMode(mode) ? mode : FLYOUT_LOG_DEFAULT_MODE;
}

export function getFlyoutLogFilter(
  project_id: string,
): FlyoutLogFilter[] | null {
  const f = LS.get<LSFlyout>(lsKey(project_id))?.logFilter;
  if (f != null && Array.isArray(f)) {
    return f.filter(isFlyoutLogFilterMode);
  }
  return null;
}

export function getFlyoutLogDeduplicate(
  project_id: string,
): FlyoutLogDeduplicate {
  const deduplicate = LS.get<LSFlyout>(lsKey(project_id))?.deduplicate;
  return isFlyoutLogDeduplicate(deduplicate)
    ? deduplicate
    : FLYOUT_LOG_DEFAULT_DEDUP;
}

export function getFlyoutFiles(project_id: string): FilesMode {
  return LS.get<LSFlyout>(lsKey(project_id))?.files ?? {};
}

export function getFlyoutSettings(project_id: string): string[] {
  return LS.get<LSFlyout>(lsKey(project_id))?.settings ?? [];
}

export function getFlyoutActiveMode(project_id: string): FlyoutActiveMode {
  const active = LS.get<LSFlyout>(lsKey(project_id))?.active;
  return isFlyoutActiveMode(active) ? active : FLYOUT_ACTIVE_DEFAULT_MODE;
}

export function getFlyoutActiveStarred(
  project_id: string,
): FlyoutActiveStarred {
  return LS.get<LSFlyout>(lsKey(project_id))?.starred ?? [];
}

export function getFlyoutActiveShowStarred(project_id: string): boolean {
  return LS.get<LSFlyout>(lsKey(project_id))?.showStarred ?? true;
}

export function getFlyoutActiveTabSort(
  project_id: string,
): FlyoutActiveTabSort {
  const activeTabSort = LS.get<LSFlyout>(lsKey(project_id))?.activeTabSort;
  return isFlyoutActiveTabSort(activeTabSort) ? activeTabSort : "custom";
}
