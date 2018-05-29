/*
The actions -- what you can do with a timer, and also the
underlying synchronized state.
*/

const misc = require("smc-util/misc");
let { webapp_client } = require("../webapp_client");
import { Actions, Store } from "../smc-react-ts";
import { TypedMap } from "../smc-react/TypedMap";
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
}

type TimerRecord = TypedMap<Timer>;

export let TimeActions = class TimeActions extends Actions<StopwatchEditorState> {
  private project_id: string;
  private path: string;
  public syncdb: any;
  public store: Store<StopwatchEditorState>;

  _init = (project_id: string, path: string): void => {
    this.project_id = project_id;
    this.path = path;
    // be explicit about exactly what state is in the store
    this.setState({
      timers: undefined
    });
  };

  init_error = (err): void => {
    this.setState({
      error: err
    });
  };

  _syncdb_change = (): void => {
    this.setState({
      timers: this.syncdb.get()
    });

    if (this.syncdb.count() === 0) {
      this.add_stopwatch();
    }
  };

  _set = (obj: Timer): void => {
    this.syncdb.set(obj);
    this.syncdb.save(); // save to file on disk
  };

  add_stopwatch = (): void => {
    let id = 1;
    while (this.syncdb && this.syncdb.get_one({ id })) {
      id += 1;
    }
    this._set({
      id,
      label: "",
      total: 0,
      state: "stopped",
      time: webapp_client.server_time() - 0
    });
  };

  stop_stopwatch = (id: number): void => {
    this._set({
      id,
      total: 0,
      state: "stopped",
      time: webapp_client.server_time() - 0
    });
  };

  start_stopwatch = (id: number): void => {
    this._set({
      id,
      time: webapp_client.server_time() - 0,
      state: "running"
    });
  };

  pause_stopwatch = (id: number): void => {
    const x = this.syncdb && this.syncdb.get_one({ id });
    if (x) {
      this._set({
        id,
        time: webapp_client.server_time() - 0,
        total: x.get("total") + (webapp_client.server_time() - x.get("time")),
        state: "paused"
      });
    }
  };

  time_travel = (): void => {
    this.redux.getProjectActions(this.project_id).open_file({
      path: misc.history_path(this.path),
      foreground: true
    });
  };

  undo = (): void => {
    if (this.syncdb) {
      this.syncdb.undo();
    }
  };

  redo = (): void => {
    if (this.syncdb) {
      this.syncdb.redo();
    }
  };
};
