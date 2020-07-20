/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the task list editor

TODO: this is very similar to jupyter/register.coffee -- can this be refactored?
*/

// TODO: remove
import './desc-editor'
import './editor'
import './hashtag-bar'
import './headings'
import './history-viewer'
import './list'

import { register_file_editor } from "../../file-editors";
import { alert_message } from "../../alerts";
import { redux_name } from "../../app-framework";
import { webapp_client } from "../../webapp-client";

const { TaskEditor } = require("../../tasks/editor");
import { TaskActions } from "./actions";
import { TaskStore } from "./store";

import { syncdb2 as new_syncdb } from "../generic/client";

register_file_editor({
  ext: ["tasks"],

  is_public: false,

  icon: "tasks",

  component: TaskEditor,

  init(path: string, redux, project_id: string) {
    const name = redux_name(project_id, path);
    if (redux.getActions(name) != null) {
      return name; // already initialized
    }

    const store = redux.createStore(name, TaskStore);
    const actions = redux.createActions(name, TaskActions);

    const syncdb = new_syncdb({
      project_id,
      path,
      primary_keys: ["task_id"],
      string_cols: ["desc"],
    });

    actions._init(project_id, path, syncdb, store, webapp_client);

    syncdb.once("error", (err) => {
      const message = `Tasks error '${path}' -- ${err}`;
      alert_message({ type: "error", message });
    });

    return name;
  },

  remove(path:string, redux, project_id:string) {
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

  save(path:string, redux, project_id:string) {
    const name = redux_name(project_id, path);
    const actions = redux.getActions(name);
    return actions != null ? actions.save() : undefined;
  },
});
