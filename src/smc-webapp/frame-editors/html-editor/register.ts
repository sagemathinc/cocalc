/*
Register the HTML editor
*/

import { Editor } from "./editor.ts";
import { Actions } from "./actions.ts";
import {register_file_editor} from '../frame-tree/register';

register_file_editor({
  ext: "html",
  component: Editor,
  Actions
});
