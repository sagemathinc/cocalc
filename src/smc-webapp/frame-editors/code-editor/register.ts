/*
Register the code editor
*/

const { file_associations } = require("smc-webapp/file-associations");

import { Editor } from "./editor.ts";

import { Actions } from "./actions.ts";

import { register_file_editor } from "../frame-tree/register";

const extensions: string[] = [];
for (let ext in file_associations) {
  if (file_associations[ext].editor === "codemirror") {
    extensions.push(ext);
  }
}

register_file_editor({
  ext: extensions,
  component: Editor,
  Actions
});
