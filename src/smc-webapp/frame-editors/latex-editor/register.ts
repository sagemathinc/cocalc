/*
Register the LaTeX file editor
*/

import { Editor } from "./editor";
import { Actions } from "./actions";
import { KNITR_EXTS } from "./constants.ts";

import { register_file_editor } from "../frame-tree/register";

// Load plugin so that codemirror can automatically close latex environments.
import "./codemirror-autoclose-latex";

for (let ext of KNITR_EXTS.concat(["tex"])) {
  register_file_editor({
    ext: ext,
    component: Editor,
    Actions
  });
}
