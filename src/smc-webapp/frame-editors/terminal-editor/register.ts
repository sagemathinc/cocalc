/*
Register the terminal editor
*/

import { Editor } from "./editor";
import { Actions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

let ext;
if (require("smc-webapp/feature").IS_TOUCH) {
  // For now, on mobile, we stay with old terminal, since copy/paste don't work, etc.
  // The new one is still available for testing using an extension of .term2.
  ext = "term2";
} else {
  ext = "term";
}

register_file_editor({
  ext,
  component: Editor,
  Actions
});
