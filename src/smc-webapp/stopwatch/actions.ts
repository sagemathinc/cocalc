/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

/*
The actions -- what you can do with a timer, and also the
underlying synchronized state.
*/

let { misc } = require("smc-util/misc");
let { webapp_client } = require("../webapp_client");
import { Actions, Store } from "../smc-react-ts";
import { TypedMap } from "../smc-react/TypedMap";
import { List } from "immutable";

export interface TimeState {
  name: string;
  timers?: List<TimerRecord>;
  error?: string;
}

interface Timer {
  id: number;
  label?: string;
  total?: number;
  state: "paused" | "running" | "stopped";
  time: number;
}

type TimerRecord = TypedMap<Timer>;

export let TimeActions = class TimeActions extends Actions<TimeState> {
  private project_id: string;
  private path: string;
  public syncdb: any;
  public store: Store<TimeState>

  constructor(a?, b?) {
    super(a, b);
    this._syncdb_change = this._syncdb_change.bind(this);
    this.time_travel = this.time_travel.bind(this);
    this.stop_stopwatch = this.stop_stopwatch.bind(this);
    this.start_stopwatch = this.start_stopwatch.bind(this);
  }

  _init(project_id: string, path: string): void {
    this.project_id = project_id;
    this.path = path;
    // be explicit about exactly what state is in the store
    this.setState({
      timers: undefined
    });
  }

  init_error(err): void {
    this.setState({
      error: err
    });
  }

  _syncdb_change(): void {
    this.setState({
      timers: this.syncdb.get()
    });

    if (this.syncdb.count() === 0) {
      this.add_stopwatch();
    }
  }

  _set(obj: Timer): void {
    this.syncdb.set(obj);
    this.syncdb.save(); // save to file on disk
  }

  add_stopwatch(): void {
    let id = 1;
    while (
      (this.syncdb != null ? this.syncdb.get_one({ id }) : undefined) != null
    ) {
      id += 1;
    }
    this._set({
      id,
      label: "",
      total: 0,
      state: "stopped",
      time: webapp_client.server_time() - 0
    });
  }

  stop_stopwatch(id: number): void {
    this._set({
      id,
      total: 0,
      state: "stopped",
      time: webapp_client.server_time() - 0
    });
  }

  start_stopwatch(id: number): void {
    this._set({
      id,
      time: webapp_client.server_time() - 0,
      state: "running"
    });
  }

  pause_stopwatch(id: number): void {
    const x = this.syncdb != null ? this.syncdb.get_one({ id }) : undefined;
    if (x == null) {
      // stopwatch was deleted
      return;
    }
    this._set({
      id,
      time: webapp_client.server_time() - 0,
      total: x.get("total") + (webapp_client.server_time() - x.get("time")),
      state: "paused"
    });
  }

  time_travel(): void {
    this.redux.getProjectActions(this.project_id).open_file({
      path: misc.history_path(this.path),
      foreground: true
    });
  }

  undo(): void {
    this.syncdb != null ? this.syncdb.undo() : undefined;
  }

  redo(): void {
    this.syncdb != null ? this.syncdb.redo() : undefined;
  }
};
