/*
Jupyter Frame Editor Actions
*/

import { FrameTree } from "../frame-tree/types";
import { Actions, CodeEditorState } from "../code-editor/actions";

interface JupyterEditorState extends CodeEditorState {
}

export class JupyterActions extends Actions<JupyterEditorState> {
  protected doctype: string = "none"; // actual document is managed elsewhere

  _raw_default_frame_tree(): FrameTree {
    return { type: "jupyter_cell_notebook" };
  }
}
