/*
Register the X Window editor
*/

import { Editor } from "./editor";
import { Actions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  no_unmount: false,  // keyboard focus issues still need to be addressed.
  icon: "window-restore",
  ext: "x11",
  component: Editor,
  Actions
});
