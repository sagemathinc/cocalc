import { List, Map } from "immutable";
type iMap = Map<string, any>;

export class CursorManager {
  private last_cursors: iMap = Map();

  private process_one_user(
    info: iMap | undefined,
    account_id: string,
    cells: iMap
  ): iMap {
    const last_info: iMap | undefined = this.last_cursors.get(account_id);
    if (last_info != null) {
      if (last_info.equals(info)) {
        // no change for this particular users, so nothing further to do
        return cells;
      }
      const locs = last_info.get("locs");
      if (locs != null) {
        // delete previously set cursor locations
        locs.forEach(loc => {
          if (loc == null) return;
          const id: string | undefined = loc.get("id");
          if (id == null) return;  // be super careful.
          let cell: iMap | undefined = cells.get(id);
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
    if (info == null) return cells;

    // set new cursor locations
    info.get("locs").forEach(loc => {
      if (loc == null) return;
      const id = loc.get("id");
      let cell = cells.get(id);
      if (cell == null) return;
      let cursors: iMap = cell.get("cursors", Map());
      loc = loc.set("time", info.get("time")).delete("id");
      const locs = cursors.get(account_id, List()).push(loc);
      cursors = cursors.set(account_id, locs);
      cell = cell.set("cursors", cursors);
      cells = cells.set(id, cell);
    });

    return cells;
  }

  public process(cells: iMap, cursors: iMap): iMap | undefined {
    const before = cells;
    cursors.forEach((info: iMap | undefined, account_id: string) => {
      cells = this.process_one_user(info, account_id, cells);
    });
    this.last_cursors = cursors;
    if (cells.equals(before)) {
      return undefined;
    } else {
      return cells;
    }
  }
}
