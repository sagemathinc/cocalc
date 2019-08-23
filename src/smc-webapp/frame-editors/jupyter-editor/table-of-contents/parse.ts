/*
Parse the Table of Contents information from the notebook structure.
*/

import { List, Map } from "immutable";

export interface TableOfContentsInfo {
  id: string;
  level: number;
  value: string;
}

export function parse_headings(
  cells: Map<string, any>,
  cell_list: List<string>
): TableOfContentsInfo[] {
  const v: TableOfContentsInfo[] = [];
  cell_list.forEach((id: string) => {
    const cell = cells.get(id);
    if (cell == null || cell.get("cell_type") != "markdown") return;
    const { level, value } = parse_cell_heading(cell.get("input"));
    if (level > 0) {
      const id = cell.get("id");
      if (id == null) return;
      v.push({ id, level, value });
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
