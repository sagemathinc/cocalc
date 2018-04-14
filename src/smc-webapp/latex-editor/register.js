/*
Register the LaTeX file editor

*/

import { Editor } from "./editor.jsx";
import { Actions } from "./actions";

import { register_file_editor } from "../code-editor/register-generic";

register_file_editor({
    ext: "tex",
    component: Editor,
    Actions
});
