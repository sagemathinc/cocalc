/*
Jupyter Frame Editor Actions
*/

import { FrameTree } from "../frame-tree/types";
import { Actions, CodeEditorState } from "../code-editor/actions";

import {
  create_jupyter_actions,
  close_jupyter_actions
} from "./cell-notebook/jupyter-actions";

interface JupyterEditorState extends CodeEditorState {}

import { JupyterActions } from "../../jupyter/browser-actions";

export class JupyterEditorActions extends Actions<JupyterEditorState> {
  protected doctype: string = "none"; // actual document is managed elsewhere
  public jupyter_actions: JupyterActions;

  _raw_default_frame_tree(): FrameTree {
    return { type: "jupyter_cell_notebook" };
  }

  _init2(): void {
    this.init_new_frame();
  }

  public close(): void {
    super.close();
  }

  init_new_frame(): void {
    console.log("init_new_frame");
    this.store.on("new-frame", ({ id, type }) => {
      console.log("new-frame", id, type);
      if (type !== "jupyter_cell_notebook") {
        return;
      }
      this.create_jupyter_actions(id);
    });

    console.log(" this._get_leaf_ids() = ", this._get_leaf_ids());
    for (let id in this._get_leaf_ids()) {
      const node = this._get_frame_node(id);
      if (node == null) return;
      const type = node.get("type");
      if (type === "jupyter_cell_notebook") {
        this.create_jupyter_actions(id);
      }
    }
  }

  close_frame_hook(id: string, type: string): void {
    console.log("close hook", id, type);
    if (type != "jupyter_cell_notebook") return;
    this.close_jupyter_actions(id);
  }

  private create_jupyter_actions(id: string): void {
    console.log("create actions", id);
    create_jupyter_actions(
      this.redux,
      this.name,
      this.path,
      this.project_id,
      id
    );
  }

  private close_jupyter_actions(id: string): void {
    console.log("close actions", id);
    close_jupyter_actions(this.redux, this.name, id);
  }
}
