/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Showing what is currently happening to the user

The actual react component that displays activity is
ActivityDisplay in r_misc.
*/

import { CourseActions } from "../actions";
import { Map } from "immutable";

export class ActivityActions {
  private actions: CourseActions;
  private activity_id: number = -1;

  constructor(actions: CourseActions) {
    this.actions = actions;
  }

  public set_activity(
    opts: { id: number; desc?: string } | { id?: number; desc: string }
  ): number {
    if (this.actions.is_closed()) return -1;
    if (opts.id == null) {
      this.activity_id += 1;
      opts.id = this.activity_id;
    }
    const store = this.actions.get_store();
    if (store == null) {
      // course was closed
      return -1;
    }
    let activity = store.get("activity");
    if (opts.desc == null) {
      activity = activity.delete(opts.id);
    } else {
      activity = activity.set(opts.id, opts.desc);
    }
    this.actions.setState({ activity });
    return opts.id;
  }

  public clear_activity(id?: number): void {
    if (this.actions.is_closed()) return;
    if (id != null) {
      this.set_activity({ id }); // clears for this id since desc not provided
    } else {
      this.actions.setState({ activity: Map() }); // clear all activity
    }
  }
}
