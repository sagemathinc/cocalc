/*
Register the HTML editor
*/

import { HTMLEditor } from "./editor.tsx";
import { Actions } from "./actions.ts";

// import { register_file_editor } from '../code-editor/register-generic';
const { register_file_editor } = require("../code-editor/register-generic");

register_file_editor({
  ext: "html",
  component: HTMLEditor,
  Actions
});
