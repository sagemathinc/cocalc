/*
Register the Jupyter Notebook editor and viwer with CoCalc
  - set the file extension, icon, react component,
    and how to init and remove the actions/store

This is in a separate module from the main non-public version, so it can
be used on the backend.
*/

const { register_file_editor } = require("../../file-editors");
//TODO -- import { register_file_editor } from "../../file-editors";
import { redux_name } from "../../app-framework";
import { NBViewer } from "./nbviewer";
import { NBViewerActions } from "./actions";
import { NBViewerStore } from "./store";

export function register(webapp_client) {
  return register_file_editor({
    ext: ["ipynb"],

    is_public: true,

    icon: "list-alt",

    component: NBViewer,

    // TODO: type
    init(path: any, redux: any, project_id: string, content: any) {
      const name = redux_name(project_id, path);
      if (redux.getActions(name) != null) {
        return name; // already initialized
      }
      const actions = redux.createActions(name, NBViewerActions);
      const store = redux.createStore(name, NBViewerStore);
      actions._init(project_id, path, store, webapp_client, content);
      return name;
    },

    // TODO: type
    remove(path: any, redux: any, project_id: string) {
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
    }
  });
}
