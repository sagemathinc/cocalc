/*
Register the HTML editor
*/

import { HTMLEditor } from "./editor.tsx";
import { Actions } from "./actions.ts";
import {register_file_editor} from '../frame-tree/register';

register_file_editor({
  ext: "html",
  component: HTMLEditor,
  Actions
});
