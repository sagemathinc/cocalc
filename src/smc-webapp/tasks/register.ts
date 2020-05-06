/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Register the task list editor

TODO: this is very similar to jupyter/register.coffee -- can this be refactored?
*/

const { register_file_editor } = require("../file-editors");
import { alert_message } from "../alerts";
import { redux_name } from "../app-framework";
const { webapp_client } = require("../webapp_client");

const { TaskEditor } = require("./editor");
const { TaskActions } = require("./actions");
const { TaskStore } = require("./store");

import { syncdb2 as new_syncdb } from "../frame-editors/generic/client";

register_file_editor({
  ext: ["tasks"],

  is_public: false,

  icon: "tasks",

  component: TaskEditor,

  init(path, redux, project_id) {
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

  remove(path, redux, project_id) {
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

  save(path, redux, project_id) {
    const name = redux_name(project_id, path);
    const actions = redux.getActions(name);
    return actions != null ? actions.save() : undefined;
  },
});
