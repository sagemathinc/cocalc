/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
