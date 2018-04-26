/*
Register the HTML editor
*/

// import { Editor } from "./editor";
const { Editor } = require("./editor");
// import { Actions } from "./actions";
const { Actions } = require("./actions.ts");

// import { register_file_editor } from '../code-editor/register-generic';
const { register_file_editor } = require("../code-editor/register-generic");

register_file_editor({
  ext: "html",
  component: Editor,
  Actions
});
