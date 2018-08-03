/*
Register the Jupyter Notebook editor and viewer with CoCalc
  - set the file extension, icon, react component,
    and how to init and remove the actions/store
*/

const misc = require("smc-util/misc");

const { register_file_editor } = require("../file-editors");
const { alert_message } = require("../alerts");
import { redux_name } from "../app-framework";
const { webapp_client } = require("../webapp_client");

const { JupyterEditor } = require("./main");
const { JupyterActions } = require("./actions");
const { JupyterStore } = require("./store");

require("./nbgrader");

export function register() {
  return register_file_editor({
    ext: ["ipynb"],

    is_public: false,

    icon: "list-alt",

    component: JupyterEditor,

    init(path, redux, project_id) {
      const name = redux_name(project_id, path);
      if (redux.getActions(name) != null) {
        return name; // already initialized
      }

      const actions = redux.createActions(name, JupyterActions);
      const store = redux.createStore(name, JupyterStore);

      const syncdb = webapp_client.sync_db({
        project_id,
        path: misc.meta_file(path, "jupyter2"), // a.ipynb --> ".a.ipynb.sage-jupyter2"
        change_throttle: 5, // our UI/React can handle more rapid updates; plus we want output FAST.
        patch_interval: 5,
        save_interval: 1500,
        primary_keys: ["type", "id"],
        string_cols: ["input"],
        cursors: true
      });

      actions._init(project_id, path, syncdb, store, webapp_client);

      //# if window.smc? then window.jupyter_actions = actions # for DEBUGGING

      syncdb.once("init", err => {
        if (err) {
          const mesg = `Error opening '${path}' -- ${err}`;
          console.warn(mesg);
          alert_message({ type: "error", message: mesg });
          return;
        }
        if (syncdb.count() === 0) {
          return actions._syncdb_change();
        }
      }); // cause initialization -- TODO: will get moved to backend/project.

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

      // cleanup assistant
      if (actions.assistant_actions != null) {
        const assistant_name = actions.assistant_actions.name;
        delete redux.getStore(assistant_name).state;
        redux.removeStore(assistant_name);
        redux.removeActions(assistant_name);
      }

      // cleanup main store/actions
      delete store.state;
      redux.removeStore(name);
      redux.removeActions(name);
      return name;
    },

    save(path, redux, project_id) {
      const name = redux_name(project_id, path);
      const actions = redux.getActions(name);
      return actions != null ? actions.save() : undefined;
    }
  });
}

register();

// separated out so can be used on backend
require("./register-nbviewer").register(webapp_client);

// Temporary so long as we support jupyter classic
require("./jupyter-classic-support");
