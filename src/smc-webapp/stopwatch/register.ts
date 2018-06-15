/*
Register the time editor -- stopwatch
  - set the file extension, icon, react component,
    and how to init and remove the actions/store
*/

let { register_file_editor } = require("../project_file");
import { redux_name, Store, AppRedux } from "../smc-react-ts";
let { webapp_client } = require("../webapp_client");
let { alert_message } = require("../alerts");

let { EditorTime } = require("./editor");
import { TimeActions, StopwatchEditorState } from "./actions";

register_file_editor({
  ext: ["time"],

  is_public: false,

  icon: "stopwatch",

  component: EditorTime,

  init(path: string, redux: AppRedux, project_id: string) {
    const name = redux_name(project_id, path, this.is_public);
    if (redux.getActions(name) !== undefined) {
      return name; // already initialized
    }

    const actions = redux.createActions(name, TimeActions);
    const store: Store<StopwatchEditorState> = redux.createStore(name);

    actions._init(project_id, path);

    const syncdb = webapp_client.sync_db({
      project_id,
      path,
      primary_keys: ["id"],
      string_cols: ["label"]
    });
    actions.syncdb = syncdb;
    actions.store = store;
    syncdb.once("init", err => {
      if (err) {
        const mesg = `Error opening '${path}' -- ${err}`;
        console.warn(mesg);
        alert_message({ type: "error", message: mesg });
        return;
      }
      actions._syncdb_change();
      return syncdb.on("change", actions._syncdb_change);
    });
    return name;
  },

  remove(path: string, redux: AppRedux, project_id: string) {
    const name = redux_name(project_id, path, this.is_public);
    const actions: InstanceType<typeof TimeActions> = redux.getActions(name);
    if (actions !== undefined && actions.syncdb !== undefined) {
      actions.syncdb.close();
    }
    const store: Store<StopwatchEditorState> = redux.getStore(name);
    if (store === undefined) {
      return name;
    }
    // It is *critical* to first unmount the store, then the actions,
    // or there will be a huge memory leak.
    redux.removeStore(name);
    redux.removeActions(name);
    return name;
  }
});
