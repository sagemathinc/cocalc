/*
Jupyter Frame Editor Actions
*/

import { FrameTree } from "../frame-tree/types";
import { Actions, CodeEditorState } from "../code-editor/actions";

const { alert_message } = require("../../alerts");

import { JupyterActions } from "../../jupyter/browser-actions";
import { JupyterStore, initial_jupyter_store_state } from "../../jupyter/store";
import { syncdb2 as new_syncdb } from "../generic/client";
const { webapp_client } = require("../../webapp_client");

import { meta_file } from "smc-util/misc";

interface JupyterEditorState extends CodeEditorState {}

export class JupyterEditorActions extends Actions<JupyterEditorState> {
  protected doctype: string = "none"; // actual document is managed elsewhere
  public jupyter_actions: JupyterActions;

  _raw_default_frame_tree(): FrameTree {
    return { type: "jupyter_cell_notebook" };
  }

  _init2(): void {
    this.init_jupyter_actions();
  }

  public close(): void {
    this.remove_jupyter_actions();
    super.close();
  }

  private init_jupyter_actions(): void {
    const name = "jupyter-" + this.name;
    const actions = this.redux.createActions(name, JupyterActions);
    this.jupyter_actions = actions;
    const store = this.redux.createStore(
      name,
      JupyterStore,
      initial_jupyter_store_state
    );
    const path = meta_file(this.path, "jupyter2"); // a.ipynb --> ".a.ipynb.sage-jupyter2"
    const project_id = this.project_id;

    const syncdb = new_syncdb({
      project_id,
      path,
      change_throttle: 50, // our UI/React can handle more rapid updates; plus we want output FAST.
      patch_interval: 50,
      primary_keys: ["type", "id"],
      string_cols: ["input"],
      cursors: true,
      persistent: true
    });

    actions._init(project_id, path, syncdb, store, webapp_client);

    syncdb.once("init", err => {
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
  }

  private remove_jupyter_actions(): void {
    if (this.jupyter_actions == null) return;
    const name = this.jupyter_actions.name;
    const store = this.jupyter_actions.store;
    this.jupyter_actions.close();

    // cleanup assistant -- TODO: will eventually move to its own editor actions...
    // TODO: or maybe this should move to jupyter_actions.close()...
    if ((this.jupyter_actions as any).assistant_actions != null) {
      const assistant_name = (this.jupyter_actions as any).assistant_actions.name;
      delete this.redux.getStore(assistant_name).state;
      this.redux.removeStore(assistant_name);
      this.redux.removeActions(assistant_name);
    }

    // cleanup main store/actions
    delete store.state;
    this.redux.removeStore(name);
    this.redux.removeActions(name);
  }
}
