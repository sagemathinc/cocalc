/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Code for manipulating the open_files and open_files_order objects in the project store:

  open_files: immutable.Map<string, immutable.Map<string, any>>;
  open_files_order: immutable.List<string>;

Motivation:

These objects in the past sometimes got out of sync, which would result
in not being able to open a file anymore without refreshing your browser,
which is a pretty serious bug.  E.g., that's what would happen if open_files
had path in it but open_files_order didn't.  To reproduce this, open a project
and open files a.txt and b.txt. then in a console type:

   a = smc.redux.getProjectActions('854642c4-d035-4e39-8cff-e05ad836bd20')
   s = a.get_store()
   a.setState({open_files_order: s.get('open_files_order').delete(1)})

and you'll find that you can't open b.txt anymore, since it's halfway opened.

The point of this code here is ensure that these objects stay in sync properly.

** ALL MUTATION of open_files and open_files_order SHOULD GO THROUGH THIS OBJECT!
*/

import { List, Map } from "immutable";
import { close } from "@cocalc/util/misc";
import { ProjectActions } from "../project_actions";
import { ProjectStore } from "../project_store";

type OpenFilesType = Map<string, Map<string, any>>;
type OpenFilesOrderType = List<string>;
type ClosedFilesType = List<string>;

const MAX_JUST_CLOSED_FILES = 50;

export class OpenFiles {
  private actions: ProjectActions;
  private store: ProjectStore;

  constructor(actions: ProjectActions) {
    this.actions = actions;
    const store = actions.get_store();
    if (store == null) throw Error("store must be defined");
    this.store = store;
  }

  public close(): void {
    close(this);
  }

  private setState(
    open_files: OpenFilesType | undefined,
    open_files_order?: OpenFilesOrderType,
    just_closed_files?: ClosedFilesType,
  ): void {
    const x: any = {};
    if (open_files != null) x.open_files = open_files;
    if (open_files_order != null) x.open_files_order = open_files_order;
    if (just_closed_files != null) {
      x.just_closed_files = just_closed_files;
    }
    this.actions.setState(x);
  }

  public close_all(): void {
    this.setState(Map({}), List([]));
  }

  public has(path: string): boolean {
    return this.store.get("open_files").has(path);
  }

  // Close the given path, so it is removed from both immutable data structures.
  public delete(path: string): void {
    const open_files_order = this.store.get("open_files_order");
    const index = open_files_order.indexOf(path);
    if (index == -1) return; // no-op if not there, like immutable.List delete.
    const open_files = this.store.get("open_files");
    const just_closed_files_prev = this.store.get("just_closed_files");

    // keep the most recent N
    const just_closed_files = just_closed_files_prev
      .push(path)
      .slice(-MAX_JUST_CLOSED_FILES);

    this.setState(
      open_files.delete(path),
      open_files_order.delete(index),
      just_closed_files,
    );
  }

  // Open or modify the given path, so it is inserted in the open_files Map,
  // and also put at the end of the open_files_order List.  If the
  // path is already in the data structure then instead the value
  // is set and the position in the open_files_order List is unchanged.

  // IMPORTANT: val isn't a full immutable.js object, since Editor will
  // get stored in it later, and Editor can't be converted to immutable,
  // so don't try to do that!!
  public set(path: string, key: string, val: any): void {
    let open_files = this.store.get("open_files");
    const cur = open_files.get(path);
    if (cur == null) {
      // Opening the path, so set things.
      let open_files_order = this.store.get("open_files_order");
      this.setState(
        open_files.set(path, Map({ [key]: val })),
        open_files_order.push(path),
      );
    } else {
      this.setState(open_files.set(path, cur.set(key, val)));
    }
    // remove it from just_closed_files, if it's there
    const just_closed_files = this.store.get("just_closed_files");

    if (just_closed_files.includes(path)) {
      this.setState(
        undefined,
        undefined,
        just_closed_files.filter((x) => x !== path),
      );
    }
  }

  public get(path: string, key: string): any {
    return this.store.getIn(["open_files", path, key]);
  }

  // Move whatever path is currently at old_index so that after the
  // move it is as new_index.  This is NOT a swap -- it just pulls
  // the path out then sticks it in a new place, shifting everything
  // else over.
  public move(opts: { old_index: number; new_index: number }): void {
    const open_files_order = this.store.get("open_files_order");
    if (
      opts.old_index >= open_files_order.size ||
      opts.new_index >= open_files_order.size
    ) {
      throw Error(
        `invalid indexes in moving tabs -- ${opts.old_index}, ${opts.new_index}`,
      );
    }

    const path: string | undefined = open_files_order.get(opts.old_index);
    if (path == null) {
      throw Error("bug");
    }
    const temp_list = open_files_order.delete(opts.old_index);
    const new_list = temp_list.splice(opts.new_index, 0, path);
    this.setState(undefined, new_list);
  }
}
