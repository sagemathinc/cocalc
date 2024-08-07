/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the LaTeX file editor
*/
import { KNITR_EXTS } from "./constants";
import { register_file_editor } from "../frame-tree/register";

for (const ext of KNITR_EXTS.concat(["tex"])) {
  register_file_editor({
    ext: ext,
    editor: async () => await import("./editor"),
    actions: async () => {
      // Load plugin so that codemirror can automatically close latex environments.
      import("./codemirror-autoclose-latex");
      // Return the actions module.
      return await import("./actions");
    },
  });
}
