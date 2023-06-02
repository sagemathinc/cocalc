/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { FixedTab, isFixedTab } from "../file-tab";
import { FLYOUT_DEFAULT_WIDTH_PX } from "./consts";
import { FLYOUT_LOG_DEFAULT_MODE } from "./log";

const LogModes = ["files", "history"] as const;
export type FlyoutLogMode = (typeof LogModes)[number];
export function isFlyoutLogMode(val?: string): val is FlyoutLogMode {
  return LogModes.includes(val as any);
}

export type LSFlyout = {
  scroll?: { [name in FixedTab]?: number }; // checked using isPositiveNumber
  width?: number; // checked using isPositiveNumber
  expanded?: FixedTab | null;
  mode?: FlyoutLogMode; // check using isFlyoutLogMode
};

function isPositiveNumber(val: any): val is number {
  return typeof val === "number" && !isNaN(val) && val >= 0;
}

export const lsKey = (project_id: string) => `${project_id}::flyout`;

export function storeFlyoutState(
  project_id: string,
  flyout: FixedTab,
  state: {
    scroll?: number;
    expanded?: boolean;
    width?: number | null;
    mode?: string; // check using isFlyoutLogMode
  }
): void {
  const { scroll, expanded, width, mode } = state;
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

  if (isFlyoutLogMode(mode)) {
    current.mode = mode;
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
