/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The actions -- what you can do with a timer, and also the
underlying synchronized state.
*/

import { history_path } from "@cocalc/util/misc";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Actions, Store, TypedMap } from "@cocalc/frontend/app-framework";
import { List } from "immutable";

export interface StopwatchEditorState {
  name: string;
  timers?: List<TimerRecord>;
  error?: string;
}

export type TimerState = "paused" | "running" | "stopped";

interface Timer {
  id: number;
  label?: string;
  total?: number;
  state: TimerState;
  time: number;
  countdown?: number; // a countdown time is the same a stopwatch, but has this field, which is the number of seconds.
}

type TimerRecord = TypedMap<Timer>;

export class TimeActions extends Actions<StopwatchEditorState> {
  private project_id: string;
  private path: string;
  public syncdb: any;
  public store: Store<StopwatchEditorState>;

  public _init(project_id: string, path: string): void {
    this._syncdb_change = this._syncdb_change.bind(this);
    this.project_id = project_id;
    this.path = path;
    // be explicit about exactly what state is in the store
    this.setState({
      timers: undefined,
    });
  }

  public init_error(err): void {
    this.setState({
      error: err,
    });
  }

  public _syncdb_change(): void {
    this.setState({
      timers: this.syncdb.get(),
    });

    if (this.syncdb.get_doc().size === 0) {
      this.addStopwatch();
    }
  }

  private _set(obj: Partial<Timer>): void {
    this.syncdb.set(obj);
    this.syncdb.commit();
    this.syncdb.save_to_disk();
  }

  public addStopwatch(): void {
    // make id equal to the largest current id (or 0 if none)
    let id = 0;
    this.syncdb.get().map((data) => {
      id = Math.max(data.get("id"), id);
    });
    id += 1; // our new stopwatch has the largest id (so at the bottom)
    this._set({
      id,
      label: "",
      total: 0,
      state: "stopped",
      time: webapp_client.server_time() - 0,
    });
  }

  public deleteStopwatch(id: number): void {
    this.syncdb.delete({ id });
    if (this.syncdb.get_doc().size === 0) {
      this.addStopwatch();
    }
    this.syncdb.commit();
    this.syncdb.save_to_disk();
  }

  public resetStopwatch(id: number): void {
    this._set({
      id,
      total: 0,
      state: "stopped",
      time: webapp_client.server_time() - 0,
    });
  }

  public startStopwatch(id: number): void {
    this._set({
      id,
      time: webapp_client.server_time() - 0,
      state: "running",
    });
  }

  public pauseStopwatch(id: number): void {
    const x = this.syncdb && this.syncdb.get_one({ id });
    if (x == null) return;
    this._set({
      id,
      time: webapp_client.server_time() - 0,
      total: x.get("total") + (webapp_client.server_time() - x.get("time")),
      state: "paused",
    });
  }

  public setLabel(id: number, label: string): void {
    const x = this.syncdb && this.syncdb.get_one({ id });
    if (x == null) return;
    this._set({ id, label, state: x.get("state"), time: x.get("time") });
  }

  // Set current displayed time on clock or starting value for timer (and reset timer to be at that value),
  // where the input is the time in seconds.
  public setCountdown(id: number, time: number): void {
    const x = this.syncdb && this.syncdb.get_one({ id });
    if (x == null) return;
    this._set({
      id,
      countdown: time,
    });
  }

  public time_travel(): void {
    this.redux.getProjectActions(this.project_id).open_file({
      path: history_path(this.path),
      foreground: true,
    });
  }

  public undo(): void {
    if (this.syncdb) {
      this.syncdb.undo();
    }
  }

  public redo(): void {
    if (this.syncdb) {
      this.syncdb.redo();
    }
  }

  public addTimer(): void {
    // make id equal to the largest current id (or 0 if none)
    let id = 0;
    this.syncdb.get().map((data) => {
      id = Math.max(data.get("id"), id);
    });
    id += 1; // our new timer has the largest id (so at the bottom)
    this._set({
      id,
      label: "",
      total: 0,
      state: "stopped",
      time: webapp_client.server_time() - 0,
      countdown: 60,
    });
  }
}
