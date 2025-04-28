/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import {
  JupyterStore,
  initial_jupyter_store_state,
} from "@cocalc/jupyter/redux/store";
import { syncdb2 as new_syncdb } from "../generic/client";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { SYNCDB_OPTIONS } from "@cocalc/jupyter/redux/sync";
import { syncdbPath } from "@cocalc/util/jupyter/names";

export function redux_name(name: string): string {
  return `jupyter-${name}`;
}

export function create_jupyter_actions(
  redux,
  name: string,
  path: string,
  project_id: string,
): JupyterActions {
  name = redux_name(name);
  const actions = redux.createActions(name, JupyterActions);
  const store = redux.createStore(
    name,
    JupyterStore,
    initial_jupyter_store_state,
  );
  const syncdb_path = syncdbPath(path);

  // Ensure meta_file isn't marked as deleted, which would block
  // opening the syncdb, which is clearly not the user's intention
  // at this point (since we're opening the ipynb file).
  redux.getProjectActions(project_id)?.setNotDeleted(syncdb_path);

  const syncdb = new_syncdb({
    ...SYNCDB_OPTIONS,
    project_id,
    path: syncdb_path,
  });

  actions._init(project_id, path, syncdb, store, webapp_client);

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
