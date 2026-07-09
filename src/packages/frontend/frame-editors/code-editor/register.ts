/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the code editor
*/

import {
  file_associations,
  on_file_associations_change,
} from "@cocalc/frontend/file-associations";
import { Editor } from "./editor";
import { Actions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

function register_codemirror_extension(ext: string): void {
  if (file_associations[ext]?.editor === "codemirror") {
    register_file_editor({
      id: "cocalc/code-editor",
      ext,
      component: Editor,
      Actions,
    });
  }
}

for (const ext in file_associations) {
  register_codemirror_extension(ext);
}

on_file_associations_change((ext, spec) => {
  if (spec?.editor === "codemirror") {
    register_codemirror_extension(ext);
  }
});
