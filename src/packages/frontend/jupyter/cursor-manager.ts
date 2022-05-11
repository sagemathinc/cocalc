/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List, Map } from "immutable";
type CursorMap = Map<string, any>;

export class CursorManager {
  private last_cursors: CursorMap = Map();

  private process_one_user(
    info: CursorMap | undefined,
    account_id: string,
    cells: CursorMap
  ): CursorMap {
    const last_info: CursorMap | undefined = this.last_cursors.get(account_id);
    if (last_info != null) {
      if (last_info.equals(info)) {
        // no change for this particular users, so nothing further to do
        return cells;
      }
      const locs = last_info.get("locs");
      if (locs != null) {
        // delete previously set cursor locations
        locs.forEach((loc) => {
          if (loc == null) return;
          const id: string | undefined = loc.get("id");
          if (id == null) return; // be super careful.
          let cell: CursorMap | undefined = cells.get(id);
          if (cell == null) return;
          const cursors = cell.get("cursors", Map());
          if (cursors == null) return;
          if (cursors.has(account_id)) {
            cell = cell.set("cursors", cursors.delete(account_id));
            cells = cells.set(id, cell);
            return false; // nothing further to do for this location.
          }
        });
      }
    }
    if (info == null || info.get("time") == null) return cells;

    // set new cursor locations
    info.get("locs").forEach((loc) => {
      if (loc == null) return;
      const id = loc.get("id");
      let cell = cells.get(id);
      if (cell == null) return;
      let cursors: CursorMap = cell.get("cursors", Map());
      loc = loc.set("time", info.get("time")).delete("id");
      const locs = cursors.get(account_id, List()).push(loc);
      cursors = cursors.set(account_id, locs);
      cell = cell.set("cursors", cursors);
      cells = cells.set(id, cell);
    });

    return cells;
  }

  public process(
    cells: CursorMap | undefined | null,
    cursors: CursorMap
  ): CursorMap | undefined {
    if (cells == null) {
      // cells need not be defined in which case, don't bother; see
      // https://github.com/sagemathinc/cocalc/issues/3456
      // HOWEVER -- this could should be reverted and cells should be
      // required to be defined.  This can only be done once the Jupyter
      // code is properly converted to typescript, which it is NOT yet.
      return;
    }
    const before = cells;
    cursors.forEach((info: CursorMap | undefined, account_id: string) => {
      cells = this.process_one_user(info, account_id, cells as CursorMap); // we know cells defined.
    });
    this.last_cursors = cursors;
    if (cells.equals(before)) {
      return undefined;
    } else {
      return cells;
    }
  }
}
