/*
Register the PDF editor
*/

import { Editor } from "./editor";
import { PDFActions } from "./actions";

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "pdf",
  component: Editor,
  Actions: PDFActions,
});
