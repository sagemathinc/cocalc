/*
Generic register function -- used by each frame tree editor to register itself with CoCalc

Basically, this is like register_file_editor, but much more specialized.
*/

const general_register_file_editor = require("smc-webapp/file-editors").register_file_editor;

const { redux_name } = require("smc-webapp/smc-react");

interface Register {
  ext:
    | string
    | string[] /* the filename extension or extentions that this editor should handle. */;
  component: any /* the renderable react component used for this editor */;
  Actions: any /* the class that defines the actions. */;
}

export function register_file_editor(opts: Register) {
  for (let is_public of [true, false]) {
    register(opts.ext, opts.component, opts.Actions, is_public);
  }
}

function register(ext, component, Actions, is_public) {
  general_register_file_editor({
    ext,
    is_public,
    component,
    init(path : string, redux, project_id : string) {
      const name = redux_name(project_id, path, is_public);
      if (redux.getActions(name) != null) {
        return name; // already initialized
      }
      // We purposely are just using the simple default store; that's all that is needed
      // for these editors.
      const store = redux.createStore(name);
      const actions = redux.createActions(name, Actions);

      // Call the base class init.  (NOTE: it also calls _init2 if defined.)
      actions._init(project_id, path, is_public, store);

      return name;
    },

    remove(path : string, redux, project_id : string)  : void {
      const name = redux_name(project_id, path, is_public);
      const actions = redux.getActions(name);
      if (actions != null) {
        actions.close();
        redux.removeActions(name);
      }
      const store = redux.getStore(name);
      if (store != null) {
        delete store.state;
        redux.removeStore(name);
      }
      return name;
    },

    save(path : string, redux, project_id : string) : void  {
      if (is_public) return;
      const name = redux_name(project_id, path, is_public);
      const actions = redux.getActions(name);
      if (actions) {
        actions.save();
      }
    }
  });
}
