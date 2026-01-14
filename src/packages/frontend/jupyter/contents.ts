/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Parse the Table of Contents information from the notebook structure.
*/

import type { IconName } from "@cocalc/frontend/components/icon";

import { List, Map } from "immutable";

import { parseTableOfContents } from "@cocalc/frontend/markdown";

export interface TableOfContentsInfo {
  id: string;
  level: number;
  value: string;
  icon?: IconName;
  number?: number[];
  align: "center" | "top";
}

export function parseHeadings(
  cells: Map<string, any>,
  cell_list: List<string>,
): TableOfContentsInfo[] {
  const v: TableOfContentsInfo[] = [];
  let last_level: number = 0,
    nbgrader_counter: number = 0,
    section_counter: number[] = [];
  cell_list.forEach((id: string) => {
    const cell = cells.get(id);
    if (cell == null) return;
    const nbgrader = cell.getIn(["metadata", "nbgrader"]);
    if (nbgrader != null) {
      if (nbgrader.get("solution")) {
        // It's where a student enters an answer.
        nbgrader_counter += 1;
        v.push({
          id,
          level: last_level + 1,
          value: `Answer ${nbgrader_counter}`,
          icon: "graduation-cap",
          align: "center",
        });
      } else if (nbgrader.get("grade")) {
        // solution is false but grade is true, so it's a test cell
        v.push({
          id,
          level: last_level + 1,
          value: `Tests for answer ${nbgrader_counter}`,
          icon: "aim",
          align: "center",
        });
      } else if (nbgrader.get("task")) {
        nbgrader_counter += 1;
        v.push({
          id,
          level: last_level + 1,
          value: `Task ${nbgrader_counter}`,
          icon: "tasks",
          align: "center",
        });
      }
    }

    if (cell.get("cell_type") != "markdown") {
      return;
    }

    const input = cell.get("input");
    if (input == null) {
      // this is only needed since in types we don't impose any structure on cell yet.
      return;
    }
    for (const { id: markdown_id, level, value } of parseTableOfContents(
      input,
    )) {
      if (level == null) {
        continue;
      }
      if (level > 0) {
        if (last_level != level) {
          // reset section numbers
          for (let i = level; i < section_counter.length; i++) {
            section_counter[i] = 0;
          }
          last_level = level;
        }
        for (let i = 0; i < level; i++) {
          if (section_counter[i] == null) section_counter[i] = 0;
        }
        section_counter[level - 1] += 1;
        const cell_id = cell.get("id");
        if (cell_id == null) return;
        v.push({
          id: JSON.stringify({ markdown_id, cell_id }),
          level,
          value,
          number: section_counter.slice(0, level),
          align: "top",
        });
      }
    }
  });
  return v;
}
