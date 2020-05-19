/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the LaTeX file editor
*/

import { Editor } from "./editor";
import { Actions } from "./actions";
import { KNITR_EXTS } from "./constants";

import { register_file_editor } from "../frame-tree/register";

// Load plugin so that codemirror can automatically close latex environments.
import "./codemirror-autoclose-latex";

for (const ext of KNITR_EXTS.concat(["tex"])) {
  register_file_editor({
    ext: ext,
    component: Editor,
    Actions,
  });
}
