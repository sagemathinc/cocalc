/*
Register the R Markdown editor
*/

import { Editor } from "./editor";
import { RmdActions } from "./actions";

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "rmd",
  component: Editor,
  Actions: RmdActions
});
