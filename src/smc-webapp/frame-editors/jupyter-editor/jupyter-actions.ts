/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { JupyterActions } from "../../jupyter/browser-actions";
import { JupyterStore, initial_jupyter_store_state } from "../../jupyter/store";

import { syncdb2 as new_syncdb } from "../generic/client";

const { webapp_client } = require("../../webapp_client");
import { meta_file } from "smc-util/misc";
import { alert_message } from "../../alerts";

export function redux_name(name: string): string {
  return `jupyter-${name}`;
}

export function create_jupyter_actions(
  redux,
  name: string,
  path: string,
  project_id: string
): JupyterActions {
  name = redux_name(name);
  const actions = redux.createActions(name, JupyterActions);
  const store = redux.createStore(
    name,
    JupyterStore,
    initial_jupyter_store_state
  );
  const syncdb_path = meta_file(path, "jupyter2"); // a.ipynb --> ".a.ipynb.sage-jupyter2"

  // Ensure meta_file isn't marked as deleted, which would block
  // opening the syncdb, which is clearly not the user's intention
  // at this point (since we're opening the ipynb file).
  redux.getProjectStore(project_id)?.get_listings()?.undelete(syncdb_path);

  const syncdb = new_syncdb({
    project_id,
    path: syncdb_path,
    change_throttle: 50, // our UI/React can handle more rapid updates; plus we want output FAST.
    patch_interval: 50,
    primary_keys: ["type", "id"],
    string_cols: ["input"],
    cursors: true,
    persistent: true,
  });

  actions._init(project_id, path, syncdb, store, webapp_client);

  syncdb.once("init", (err) => {
    if (err) {
      const message = `Error opening '${path}' -- ${err}`;
      console.warn(message);
      alert_message({ type: "error", message });
      return;
    }
    if (syncdb.count() === 0) {
      actions._syncdb_change([]); // hack?  Needed?
    }
  });

  return actions;
}

export function close_jupyter_actions(redux, name: string): void {
  name = redux_name(name);
  const jupyter_actions = redux.getActions(name);
  if (jupyter_actions == null) return;
  const store = jupyter_actions.store;
  jupyter_actions.close();

  // cleanup assistant -- TODO: will eventually move to its own editor actions...
  // TODO: or maybe this should move to jupyter_actions.close()...
  if ((jupyter_actions as any).assistant_actions != null) {
    const assistant_name = (jupyter_actions as any).assistant_actions.name;
    delete redux.getStore(assistant_name).state;
    redux.removeStore(assistant_name);
    redux.removeActions(assistant_name);
  }

  // cleanup main store/actions
  delete store.state;
  redux.removeStore(name);
  redux.removeActions(name);
}
