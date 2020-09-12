/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Whiteboard Actions
*/

import { Actions } from "../../app-framework";
import { LocalViewStateMap, Object, ObjectMap, WhiteboardState } from "./types";
import { WhiteboardStore } from "./store";
import { SyncDB } from "smc-util/sync/editor/db";
import { uuid } from "smc-util/misc2";
import { fromJS, Map } from "immutable";

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export class WhiteboardActions extends Actions<WhiteboardState> {
  private syncdb: SyncDB;
  private project_id: string;
  private path: string;
  private store: WhiteboardStore;
  private is_closed: boolean = false;

  public _init(
    project_id: string,
    path: string,
    syncdb: SyncDB,
    store: WhiteboardStore
  ): void {
    this.project_id = project_id;
    this.path = path;
    this.syncdb = syncdb;
    this.store = store;
    console.log(this.project_id, this.path);

    this.syncdb.on("change", this.syncdb_change);
    this.syncdb.once("ready", this.syncdb_metadata);
    this.syncdb.on("metadata-change", this.syncdb_metadata);

    this.setState({
      local_view_state: this.load_local_view_state(),
    });
  }

  public close(): void {
    if (this.is_closed) {
      return;
    }
    this.save_local_view_state();
    this.is_closed = true;
    this.syncdb.close();
  }

  private syncdb_metadata(): void {
    if (this.syncdb == null || this.store == null) return;
    const read_only = this.syncdb.is_read_only();
    if (read_only !== this.store.get("read_only")) {
      this.setState({ read_only });
    }
  }

  private syncdb_change(changes): void {
    if (this.syncdb == null || this.store == null) return;
    let objects = this.store.get("objects") ?? Map();
    changes.forEach((x) => {
      const id = x.get("id");
      const t = this.syncdb.get_one(x);
      if (t == null) {
        // deleted
        objects = objects.delete(id);
      } else {
        // changed
        objects = objects.set(id, (t as never) as ObjectMap);
      }
    });

    this.setState({ objects });
  }

  public async save(): Promise<void> {
    if (this.is_closed) return;
    try {
      await this.syncdb.save_to_disk();
    } catch (err) {
      if (this.is_closed) return;
      // somehow report that save to disk failed.
      console.warn("Whiteboard save to disk failed ", err);
    }
  }

  public create_object(obj: Optional<Object, "id">): string {
    if (this.is_closed) {
      throw Error("cannot create since already closed");
    }
    obj.id = uuid();
    this.syncdb.set(obj);
    return obj.id;
  }

  private save_local_view_state(): void {
    const local_view_state = this.store.get("local_view_state");
    if (local_view_state != null && localStorage !== null) {
      localStorage[this.name] = JSON.stringify(local_view_state);
    }
  }

  private load_local_view_state(): LocalViewStateMap {
    const x = localStorage[this.name];
    let local_view_state: LocalViewStateMap;
    try {
      local_view_state = fromJS(JSON.parse(x) ?? {});
    } catch (_) {
      local_view_state = fromJS({});
    }
    if (local_view_state.get("lower_right") == null) {
      local_view_state.set("lower_right", { x: 10, y: -10 });
    }
    if (local_view_state.get("upper_left") == null) {
      local_view_state.set("upper_left", { x: -10, y: 10 });
    }
    return local_view_state;
  }
}
