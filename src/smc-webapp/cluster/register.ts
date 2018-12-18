const { register_file_editor } = require("../project_file");
import { redux_name, Store, AppRedux } from "../app-framework";
const { webapp_client } = require("../webapp_client");
const { alert_message } = require("../alerts");

import { ClusterUI } from "./ui";
import { ClusterActions, ClusterState } from "./actions";

register_file_editor({
  ext: ["cluster"],

  is_public: false,

  icon: "network-wired",

  component: ClusterUI,

  init(path: string, redux: AppRedux, project_id: string) {
    const name = redux_name(project_id, path, this.is_public);
    if (redux.getActions(name) !== undefined) {
      return name; // already initialized
    }

    const store: Store<ClusterState> = redux.createStore(name);
    const actions = redux.createActions(name, ClusterActions);

    actions._init(project_id);

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
      syncdb.on("change", actions._syncdb_change);
      actions._syncdb_change();
    });
    return name;
  },

  remove(path: string, redux: AppRedux, project_id: string) {
    const name = redux_name(project_id, path, this.is_public);
    const actions: InstanceType<typeof ClusterActions> = redux.getActions(name);
    if (actions !== undefined && actions.syncdb !== undefined) {
      actions.syncdb.close();
    }
    const store: Store<ClusterState> | undefined = redux.getStore(name);
    if (store == undefined) {
      return name;
    }
    // It is *critical* to first unmount the store, then the actions,
    // or there will be a huge memory leak.
    redux.removeStore(name);
    redux.removeActions(name);
    return name;
  }
});
