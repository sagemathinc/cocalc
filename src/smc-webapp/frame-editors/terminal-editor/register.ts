/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the terminal editor
*/

import { Editor } from "./editor";
import { TerminalActions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

let ext;
if (require("smc-webapp/feature").IS_TOUCH) {
  // For now, on mobile, we stay with old terminal, since copy/paste don't work, etc.
  // The new one is still available for testing using an extension of .term2.
  ext = "term2";
} else {
  ext = "term";
}

register_file_editor({
  icon: "terminal",
  ext,
  component: Editor,
  Actions: TerminalActions,
});
