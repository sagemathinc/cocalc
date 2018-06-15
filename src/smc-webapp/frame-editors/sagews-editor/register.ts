/*
Register the Sage Worksheet editor
*/

import { Editor } from "./editor";
import { Actions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "sagews",
  component: Editor,
  Actions
});
