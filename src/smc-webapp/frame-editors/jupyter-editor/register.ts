/*
Register the Jupyter notebook frame tree editor
*/

import { Editor } from "./editor";
import { JupyterEditorActions } from "./actions";

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "ipynb",
  component: Editor,
  Actions: JupyterEditorActions,
  is_public: false
});
