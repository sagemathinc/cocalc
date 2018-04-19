/*
Register the LaTeX file editor

*/

import { Editor } from "./editor.jsx";
import { Actions } from "./actions";

import { register_file_editor } from "../code-editor/register-generic";

// Load plugin so that codemirror can automatically close latex environments.
import './codemirror-autoclose-latex'

register_file_editor({
    ext: "tex",
    component: Editor,
    Actions
});
