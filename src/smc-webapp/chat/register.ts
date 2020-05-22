/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux_name } from "../app-framework";
import { webapp_client } from "../webapp-client";
import { alert_message } from "../alerts";
import { register_file_editor } from "../file-editors";

import { ChatStore } from "./store";
import { ChatActions } from "./actions";
import { ChatRoom } from "./chatroom";

export function init(path: string, redux, project_id: string): string {
  const name = redux_name(project_id, path);
  if (redux.getActions(name) != null) {
    return name; // already initialized
  }

  const actions = redux.createActions(name, ChatActions);
  const store = redux.createStore(name, ChatStore);
  actions.setState({ project_id, path });

  const syncdb = webapp_client.sync_client.sync_db({
    project_id,
    path,
    primary_keys: ["date"],
  });

  syncdb.once("error", (err) => {
    const mesg = `Error using '${path}' -- ${err}`;
    console.warn(mesg);
    alert_message({ type: "error", message: mesg });
  });

  syncdb.once("ready", () => {
    actions.set_syncdb(syncdb);
    actions.store = store;
    actions.init_from_syncdb();
    syncdb.on("change", actions.syncdb_change.bind(actions));
    syncdb.on("has-uncommitted-changes", (val) =>
      actions.setState({ has_uncommitted_changes: val })
    );
    syncdb.on("has-unsaved-changes", (val) =>
      actions.setState({ has_unsaved_changes: val })
    );
    redux.getProjectActions(project_id)?.log_opened_time(path);
  });

  return name;
}

export function remove(path: string, redux, project_id: string): string {
  const name = redux_name(project_id, path);
  const actions = redux.getActions(name);
  actions?.close();
  const store = redux.getStore(name);
  if (store == null) {
    return name;
  }
  delete store.state;
  // It is *critical* to first unmount the store, then the actions,
  // or there will be a huge memory leak.
  redux.removeStore(name);
  redux.removeActions(name);
  return name;
}

register_file_editor({
  ext: "sage-chat",
  icon: "comment",
  init,
  component: ChatRoom,
  remove,
});
