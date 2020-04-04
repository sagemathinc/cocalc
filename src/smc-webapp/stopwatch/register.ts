/*
Register the time editor -- stopwatch
  - set the file extension, icon, react component,
    and how to init and remove the actions/store
*/

const { register_file_editor } = require("../project_file");
import { redux_name, Store, AppRedux } from "../app-framework";
import { alert_message } from "../alerts";

const { EditorTime } = require("./editor");
import { TimeActions, StopwatchEditorState } from "./actions";

import { syncdb2 as new_syncdb } from "../frame-editors/generic/client";

register_file_editor({
  ext: ["time"],

  is_public: false,

  icon: "stopwatch",

  component: EditorTime,

  init(path: string, redux: AppRedux, project_id: string): string {
    const name = redux_name(project_id, path, this.is_public);
    if (redux.getActions(name) !== undefined) {
      return name; // already initialized
    }

    const store: Store<StopwatchEditorState> = redux.createStore<
      StopwatchEditorState
    >(name);
    const actions = redux.createActions(name, TimeActions);

    actions._init(project_id, path);

    const syncdb = new_syncdb({
      project_id,
      path,
      primary_keys: ["id"],
      string_cols: ["label"],
    });
    actions.syncdb = syncdb;
    actions.store = store;
    syncdb.once("error", (err) => {
      const message = `Stopwatch error '${path}' -- ${err}`;
      alert_message({ type: "error", message });
    });
    syncdb.on("change", actions._syncdb_change);
    return name;
  },

  remove(path: string, redux: AppRedux, project_id: string): string {
    const name = redux_name(project_id, path, this.is_public);
    const actions: InstanceType<typeof TimeActions> = redux.getActions(name);
    if (actions !== undefined && actions.syncdb !== undefined) {
      actions.syncdb.close();
    }
    const store: Store<StopwatchEditorState> | undefined = redux.getStore<
      StopwatchEditorState
    >(name);
    if (store == undefined) {
      return name;
    }
    // It is *critical* to first unmount the store, then the actions,
    // or there will be a huge memory leak.
    redux.removeStore(name);
    redux.removeActions(name);
    return name;
  },
});
