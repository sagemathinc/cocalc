/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { List, Map } from "immutable";

import type { CursorInfo, CursorMap } from "@cocalc/sync/editor/generic/types";
import { COMPUTER_SERVER_CURSOR_TYPE } from "@cocalc/util/compute/manager";
import { decodeUUIDtoNum } from "@cocalc/util/compute/manager";

type CellMap = Map<string, any>;

export class CursorManager {
  private last_cursors: CursorMap = Map() as CursorMap;

  private process_one_user(
    info: CursorInfo | undefined,
    account_id: string,
    cells: CellMap,
  ): CellMap {
    const last_info: CursorInfo | undefined = this.last_cursors.get(account_id);
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
          const id = loc.get("id");
          if (typeof id !== "string") return; // be super careful.
          let cell: CellMap | undefined = cells.get(id);
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
    if (info == null || info.get("time") == null) {
      return cells;
    }

    // set new cursor locations
    const seen = new Set<string>();
    const locs = info.get("locs");
    if (locs == null) {
      return cells;
    }
    locs.forEach((loc) => {
      if (loc == null) return;
      const id = loc.get("id");
      if (typeof id !== "string") return;
      let cell = cells.get(id);
      if (cell == null) return;
      let cursors: CellMap = cell.get("cursors", Map());
      loc = loc.set("time", info.get("time")).delete("id");
      let locs = !seen.has(id) ? List() : cursors.get(account_id, List());
      locs = locs.push(loc);
      seen.add(id);
      cursors = cursors.set(account_id, locs);
      cell = cell.set("cursors", cursors);
      cells = cells.set(id, cell);
    });

    return cells;
  }

  public process(
    cells: CellMap | undefined | null,
    cursors: CursorMap,
  ): CellMap | undefined {
    if (cells == null) {
      // cells need not be defined in which case, don't bother; see
      // https://github.com/sagemathinc/cocalc/issues/3456
      // HOWEVER -- this could should be reverted and cells should be
      // required to be defined.  This can only be done once the Jupyter
      // code is properly converted to typescript, which it is NOT yet.
      return;
    }
    const before = cells;
    cursors.forEach((info: CursorInfo | undefined, account_id: string) => {
      cells = this.process_one_user(info, account_id, cells as CellMap); // we know cells defined.
    });
    this.last_cursors = cursors;
    if (cells.equals(before)) {
      return undefined;
    } else {
      return cells;
    }
  }

  computeServerId = (cursors: CursorMap) => {
    let minId = Infinity;
    for (const [client_id, cursor] of cursors) {
      if (cursor.getIn(["locs", 0, "type"]) == COMPUTER_SERVER_CURSOR_TYPE) {
        try {
          minId = Math.min(minId, decodeUUIDtoNum(client_id));
        } catch (_) {}
      }
    }
    return isFinite(minId) ? minId : 0;
  };
}
