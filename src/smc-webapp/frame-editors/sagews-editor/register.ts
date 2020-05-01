/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the Sage Worksheet editor
*/

import { Editor } from "./editor";
import { SageWorksheetActions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "sagews",
  component: Editor,
  Actions: SageWorksheetActions,
});
