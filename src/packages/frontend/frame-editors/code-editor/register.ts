/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the code editor
*/

import { file_associations } from "@cocalc/frontend/file-associations";
import { Editor } from "./editor";
import { Actions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

const extensions: string[] = [];
for (const ext in file_associations) {
  if (file_associations[ext].editor === "codemirror") {
    extensions.push(ext);
  }
}

register_file_editor({
  ext: extensions,
  component: Editor,
  Actions,
});
