/*
Register the R Markdown editor

*/

import { Editor } from "./editor";
import { RmdActions } from "./actions";

const { register_file_editor } = require("../code-editor/register-generic");

register_file_editor({
  ext: "rmd",
  component: Editor,
  Actions : RmdActions
});
