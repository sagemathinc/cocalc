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

import { NotebookFrameActions } from "./cell-notebook/actions";

export class JupyterEditorActions extends Actions<JupyterEditorState> {
  protected doctype: string = "none"; // actual document is managed elsewhere
  public jupyter_actions: JupyterActions;
  private frame_actions: { [id: string]: any } = {};

  _raw_default_frame_tree(): FrameTree {
    return { type: "jupyter_cell_notebook" };
  }

  _init2(): void {
    this.create_jupyter_actions();
  }

  public close(): void {
    this.close_jupyter_actions();
    super.close();
  }

  /*
  init_new_frame(): void {
    this.store.on("new-frame", ({ id, type }) => {
      if (type !== "jupyter_cell_notebook") {
        return;
      }
      this.create_jupyter_actions(id);
    });

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
    if (type != "jupyter_cell_notebook") return;
    this.close_jupyter_actions();
  }
  */

  private create_jupyter_actions(): void {
    this.jupyter_actions = create_jupyter_actions(
      this.redux,
      this.name,
      this.path,
      this.project_id
    );
  }

  private close_jupyter_actions(): void {
    close_jupyter_actions(this.redux, this.name);
  }

  focus(id?: string): void {
    if (id === undefined) {
      id = this._get_active_id();
      if (id === undefined) return;
    }
    this.get_frame_actions(id).focus();
  }

  private get_frame_actions(id: string) {
    if (this.frame_actions[id] != null) {
      return this.frame_actions[id];
    }
    return (this.frame_actions[id] = new NotebookFrameActions(this, id));
    // TODO: need to free up frame actions when frame is destroyed.

    // TODO: throw error if id is not of a valid frame.
  }

  // per-session sync-aware undo
  undo(id: string): void {
    id = id; // not used yet, since only one thing that can be undone.
    this.jupyter_actions.undo();
  }

  // per-session sync-aware redo
  redo(id: string): void {
    id = id; // not used yet
    this.jupyter_actions.redo();
  }

  cut(id: string): void {
    console.log("cut", id);
    this.get_frame_actions(id).cut();
  }

  copy(id: string): void {
    console.log("copy", id);
    this.get_frame_actions(id).copy();
  }

  paste(id: string, value?: string | true): void {
    console.log("paste", id, value);
    this.get_frame_actions(id).paste();
  }

  print(id): void {
    console.log("TODO: print", id);
    this.jupyter_actions.show_nbconvert_dialog("html");
  }

  async format(id?: string): Promise<void> {
    console.log("format", id);
  }

  public hide(): void {}

  
}
