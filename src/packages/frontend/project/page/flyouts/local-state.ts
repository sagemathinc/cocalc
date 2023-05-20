/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { FixedTab } from "../file-tab";

export type LSFlyout = {
  scroll?: { [name in FixedTab]?: number };
  expanded?: FixedTab | null;
};

export const lsKey = (project_id: string) => `${project_id}::flyout`;

export function storeFlyoutState(
  project_id: string,
  flyout: FixedTab,
  state: { scroll?: number; expanded?: boolean }
): void {
  const { scroll, expanded } = state;
  const key = lsKey(project_id);
  const current = LS.get<LSFlyout>(key) ?? {};
  current.scroll ??= {};
  if (scroll != null && !isNaN(scroll) && scroll > 0) {
    current.scroll = { ...current.scroll, [flyout]: scroll };
  } else if (scroll === 0) {
    delete current.scroll[flyout];
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
