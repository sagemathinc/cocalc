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
    this.create_jupyter_actions();
  }

  public close(): void {
    this.close_jupyter_actions();
    super.close();
  }

  private create_jupyter_actions(): void {
    this.jupyter_actions = create_jupyter_actions(
      this.name,
      this.redux,
      this.path,
      this.project_id
    );
  }

  private close_jupyter_actions(): void {
    if (this.jupyter_actions == null) return;
    close_jupyter_actions(this.redux, this.jupyter_actions);
    delete this.jupyter_actions;
  }
}
