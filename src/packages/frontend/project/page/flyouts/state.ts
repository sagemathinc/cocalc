/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { FixedTab } from "../file-tab";
import { FLYOUT_DEFAULT_WIDTH_PX } from "./consts";

export type LSFlyout = {
  scroll?: { [name in FixedTab]?: number };
  width?: number;
  expanded?: FixedTab | null;
};

export const lsKey = (project_id: string) => `${project_id}::flyout`;

export function storeFlyoutState(
  project_id: string,
  flyout: FixedTab,
  state: { scroll?: number; expanded?: boolean; width?: number | null }
): void {
  const { scroll, expanded, width } = state;
  const key = lsKey(project_id);
  const current = LS.get<LSFlyout>(key) ?? {};
  current.scroll ??= {};

  if (scroll != null && !isNaN(scroll) && scroll > 0) {
    current.scroll = { ...current.scroll, [flyout]: scroll };
  } else if (scroll === 0) {
    delete current.scroll[flyout];
  }

  if (width != null && !isNaN(width) && width > 0) {
    current.width = width;
  } else if (width === null) {
    delete current.width;
  }

  if (expanded === true) {
    current.expanded = flyout;
  } else if (expanded === false) {
    delete current.expanded;
  }

  LS.set(key, current);
}

export function getFlyoutExpanded(project_id: string): FixedTab | null {
  const current = LS.get<LSFlyout>(lsKey(project_id));
  return current?.expanded ?? null;
}

export function getFlyoutWidth(project_id: string): number {
  const current = LS.get<LSFlyout>(lsKey(project_id));
  return current?.width ?? FLYOUT_DEFAULT_WIDTH_PX;
}
