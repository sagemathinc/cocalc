/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Headings, HeadingsDir } from "./types";

export const HEADINGS: Headings[] = ["Custom", "Due", "Changed"];
export const HEADINGS_DIR: HeadingsDir[] = ["asc", "desc"];

export const SORT_INFO = {
  Custom: {
    key: "position",
    reverse: false,
  },
  Due: {
    key: "due_date",
    reverse: false,
  },
  Changed: {
    key: "last_edited",
    reverse: true,
  },
};

export function is_sortable(sort_column: string): boolean {
  return sort_column == HEADINGS[0];
}
