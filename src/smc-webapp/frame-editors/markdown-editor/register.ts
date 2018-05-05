/*
Register the markdown editor
*/

const { Editor } = require("./editor.ts");
const { Actions } = require("./actions");

import {register_file_editor} from '../frame-tree/register';

register_file_editor({
  ext: "md",
  component: Editor,
  Actions
});
