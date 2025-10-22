/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Misc utility functions for manipulating and working wth cells.
*/

import { List, Map } from "immutable";
import { field_cmp, len } from "@cocalc/util/misc";

export function positions_between(
  before_pos: number | undefined,
  after_pos: number | undefined,
  num: number,
) {
  // Return an array of num equally spaced positions starting after
  // before_pos and ending before after_pos, so
  //   [before_pos+delta, before_pos+2*delta, ..., after_pos-delta]
  // where delta is a function of the endpoints and num.
  let delta: number, pos: number;
  if (before_pos != null && after_pos != null && before_pos > after_pos) {
    [before_pos, after_pos] = [after_pos, before_pos];
  }
  if (before_pos == null) {
    if (after_pos == null) {
      pos = 0;
      delta = 1;
    } else {
      pos = after_pos - num;
      delta = 1;
    }
  } else {
    if (after_pos == null) {
      pos = before_pos + 1;
      delta = 1;
    } else {
      delta = (after_pos - before_pos) / (num + 1);
      pos = before_pos + delta;
    }
  }
  const v: number[] = [];
  for (
    let i = 0, end = num, asc = 0 <= end;
    asc ? i < end : i > end;
    asc ? i++ : i--
  ) {
    v.push(pos);
    pos += delta;
  }
  return v;
}

export function sorted_cell_list(cells: Map<string, any>): List<string> {
  // Given an immutable Map from id's to cells, returns an immutable List whose
  // entries are the id's in the correct order, as defined by the pos field (a float).
  if (cells == null) {
    return List([]);
  }
  return cells
    .map((record, id) => ({ id, pos: record.get("pos", -1) }))
    .filter((x) => x.id != null)
    .sort(field_cmp("pos"))
    .map((x) => x.id)
    .toList();
}

export function ensure_positions_are_unique(cells?: Map<string, any>) {
  // Verify that pos's of cells are distinct.  If not
  // return map from id's to new unique positions.
  if (cells == null) {
    return;
  }
  const v: any = {};
  let all_unique = true;
  cells.forEach((cell) => {
    const pos = cell.get("pos");
    if (pos == null || v[pos]) {
      // dup! (or not defined)
      all_unique = false;
      return false;
    }
    v[pos] = true;
  });
  if (all_unique) {
    return;
  }
  let pos = 0;
  const new_pos: { [id: string]: number } = {};
  sorted_cell_list(cells).forEach((id) => {
    new_pos[id] = pos;
    pos += 1;
  });
  return new_pos;
}

export function new_cell_pos(
  cells: Map<string, any> | undefined,
  cell_list: List<string>,
  cur_id: string,
  delta: -1 | 1,
): number {
  /*
    Returns pos for a new cell whose position
    is relative to the cell with cur_id.

     cells     = immutable map id --> pos
     cell_list = immutable sorted list of id's (derived from cells)
     cur_id    = one of the ids
     delta     = -1 (above) or +1 (below)

    Returned undefined whenever don't really know what to do; then caller
    just makes up a pos, and it'll get sorted out.
  */
  if (cells == null) {
    return 0;
  }
  let cell_list_0: List<string>;
  if (cell_list == null) {
    cell_list_0 = sorted_cell_list(cells)!;
  } else {
    cell_list_0 = cell_list;
  }
  let adjacent_id: string | undefined;
  cell_list_0.forEach((id, i) => {
    if (id === cur_id) {
      const j = i + delta;
      if (j >= 0 && j < cell_list_0.size) {
        adjacent_id = cell_list_0.get(j);
      }
      return false; // break iteration
    }
  });
  const adjacent_pos = cells.getIn([adjacent_id, "pos"]) as number | undefined;
  const current_pos = cells.getIn([cur_id, "pos"]) as number;
  let pos: number;
  if (adjacent_pos != null) {
    // there is a cell after (or before) cur_id cell
    pos = (adjacent_pos + current_pos) / 2;
  } else {
    // no cell after (or before)
    pos = current_pos + delta;
  }
  return pos;
}

export function move_selected_cells(
  v?: string[],
  selected?: { [id: string]: true },
  delta?: number,
) {
  /*
    - v = ordered js array of all cell id's
    - selected = js map from ids to true
    - delta = integer

    Returns new ordered js array of all cell id's or undefined if nothing to do.
  */
  if (v == null || selected == null || !delta || len(selected) === 0) {
    return; // nothing to do
  }
  const w: string[] = [];
  // put selected cells in their proper new positions
  for (let i = 0; i < v.length; i++) {
    if (selected[v[i]]) {
      const n = i + delta;
      if (n < 0 || n >= v.length) {
        // would move cells out of document, so nothing to do
        return;
      }
      w[n] = v[i];
    }
  }
  // now put non-selected in remaining places
  let k = 0;
  for (let i = 0; i < v.length; i++) {
    if (!selected[v[i]]) {
      while (w[k] != null) {
        k += 1;
      }
      w[k] = v[i];
    }
  }
  return w;
}

export function moveCell({
  oldIndex,
  newIndex,
  getPos,
  size,
}: {
  oldIndex: number;
  newIndex: number;
  getPos: (index: number) => number;
  size: number;
}): number {
  if (oldIndex == newIndex) {
    // no-op -- better to not call in this case.
    return getPos(newIndex);
  }
  const pos = getPos(newIndex);
  if (newIndex == 0) {
    // easy special case: to beginning
    return pos - 1;
  } else if (newIndex >= size - 1) {
    // the end
    return pos + 1;
  } else {
    const pos1 = getPos(oldIndex < newIndex ? newIndex + 1 : newIndex - 1);
    return (pos + pos1) / 2;
  }
}
