/*
Register the markdown editor
*/

import { Editor } from "./editor.ts";
import { Actions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "md",
  component: Editor,
  Actions
});
