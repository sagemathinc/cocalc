/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { alert_message } from "@cocalc/frontend/alerts";
import { redux, redux_name } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_split, startswith } from "@cocalc/util/misc";
import { ChatActions } from "./actions";
import { ChatStore } from "./store";
import { ChatMessageCache } from "@cocalc/frontend/chat/message-cache";

// it is fine to call this more than once.
export function initChat(project_id: string, path: string): ChatActions {
  const name = redux_name(project_id, path);
  if (redux.getActions(name) != null) {
    return redux.getActions(name); // already initialized
  }

  const actions = redux.createActions(name, ChatActions);
  const store = redux.createStore(name, ChatStore);
  actions.setState({ project_id, path });

  if (startswith(path_split(path).tail, ".")) {
    // Sidechat being opened -- ensure chat isn't marked as deleted:
    redux.getProjectActions(project_id)?.setNotDeleted(path);
  }

  const sync = (webapp_client.conat_client.conat() as any).sync;
  const syncdb = sync.immer({
    project_id,
    path,
    primary_keys: ["date", "sender_id", "event"],
    // used only for drafts, since store lots of versions as user types:
    string_cols: ["input"],
  });
  const cache = new ChatMessageCache(syncdb);
  syncdb.once("close", () => {
    cache.dispose();
  });

  syncdb.once("error", (err) => {
    const mesg = `Error using '${path}' -- ${err}`;
    console.warn(mesg);
    alert_message({ type: "error", message: mesg });
  });

  syncdb.once("ready", () => {
    actions.set_syncdb(syncdb, store, cache);
    actions.init_from_syncdb();
    syncdb.on("change", actions.syncdbChange);
    redux.getProjectActions(project_id)?.log_opened_time(path);
  });

  return actions;
}

export function remove(path: string, redux, project_id: string): string {
  const name = redux_name(project_id, path);
  const actions = redux.getActions(name);
  // Dispose per-chat resources before tearing down redux.
  actions?.dispose?.();
  actions?.syncdb?.close();
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
