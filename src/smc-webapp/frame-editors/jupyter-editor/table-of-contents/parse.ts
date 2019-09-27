/*
Parse the Table of Contents information from the notebook structure.
*/

import { List, Map } from "immutable";

export interface TableOfContentsInfo {
  id: string;
  level: number;
  value: string;
  icon: string;
}

export function parse_headings(
  cells: Map<string, any>,
  cell_list: List<string>
): TableOfContentsInfo[] {
  const v: TableOfContentsInfo[] = [];
  let last_level: number = 0,
    answer_number: number = 0;
  cell_list.forEach((id: string) => {
    const cell = cells.get(id);
    if (cell == null) return;
    const nbgrader = cell.getIn(["metadata", "nbgrader"]);
    if (nbgrader != null) {
      if (nbgrader.get("solution")) {
        // It's where a student enters an answer.
        answer_number += 1;
        v.push({
          id,
          level: last_level + 1,
          value: `Answer ${answer_number}`,
          icon: "graduation-cap"
        });
      } else if (nbgrader.get("grade")) {
        // solution is false but grade is true, so it's a test cell
        v.push({
          id,
          level: last_level + 1,
          value: `Test of answer ${answer_number}`,
          icon: "equals"
        });
      }
    }

    if (cell.get("cell_type") != "markdown") return;

    const { level, value } = parse_cell_heading(cell.get("input"));
    if (level > 0) {
      last_level = level;
      const id = cell.get("id");
      if (id == null) return;
      v.push({ id, level, value, icon: "minus" });
    }
  });
  return v;
}

function parse_cell_heading(input: string): { level: number; value: string } {
  for (let line of input.split("\n")) {
    const x = line.trim();
    if (x[0] != "#") continue;
    for (let n = 1; n < x.length; n++) {
      if (x[n] != "#") {
        return { level: n, value: x.slice(n).trim() };
      }
    }
  }
  return { level: 0, value: "" }; // no heading in markdown
}
