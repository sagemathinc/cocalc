/*
Register the Jupyter notebook frame tree editor
*/

import { Editor } from "./editor";
import { JupyterActions } from "./actions";

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "ipynb",
  component: Editor,
  Actions: JupyterActions,
  is_public: false
});
