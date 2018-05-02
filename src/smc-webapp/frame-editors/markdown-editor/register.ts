/*
Register the markdown editor
*/

const { Editor } = require("./editor.tsx");
const { Actions } = require("./actions");

const { register_file_editor } = require("../code-editor/register-generic");

register_file_editor({
  ext: "md",
  component: Editor,
  Actions
});
