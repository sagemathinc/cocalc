/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the task list editor

TODO: this is very similar to jupyter/register.coffee -- can this be refactored?
*/

import { register_file_editor } from "../../file-editors";
import { alert_message } from "../../alerts";
import { redux_name } from "../../app-framework";
import { webapp_client } from "../../webapp-client";

import { WhiteboardEditor } from "./editor";
import { WhiteboardActions } from "./actions";
import { WhiteboardStore } from "./store";

import { syncdb2 as new_syncdb } from "../../frame-editors/generic/client";

register_file_editor({
  ext: ["whiteboard"],

  is_public: false,

  icon: "chalkboard",

  component: WhiteboardEditor,

  init(path: string, redux, project_id: string) {
    const name = redux_name(project_id, path);
    if (redux.getActions(name) != null) {
      return name; // already initialized
    }

    const store = redux.createStore(name, WhiteboardStore);
    const actions = redux.createActions(name, WhiteboardActions);

    const syncdb = new_syncdb({
      project_id,
      path,
      primary_keys: ["id"],
    });

    actions._init(project_id, path, syncdb, store, webapp_client);

    syncdb.once("error", (err) => {
      const message = `Whiteboard editor error '${path}' -- ${err}`;
      alert_message({ type: "error", message });
    });

    return name;
  },

  remove(path: string, redux, project_id: string) {
    const name = redux_name(project_id, path);
    const actions = redux.getActions(name);
    if (actions != null) {
      actions.close();
    }
    const store = redux.getStore(name);
    if (store == null) {
      return;
    }
    delete store.state;
    redux.removeStore(name);
    redux.removeActions(name);
    return name;
  },

  save(path: string, redux, project_id: string) {
    const name = redux_name(project_id, path);
    redux.getActions(name)?.save();
  },
});
