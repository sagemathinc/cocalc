/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Headings, HeadingsDir } from "./types";

export const HEADINGS: Headings[] = ["Custom Order", "Due", "Changed"];
export const HEADINGS_DIR: HeadingsDir[] = ["asc", "desc"];

export const SORT_INFO = {
  "Custom Order": {
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
