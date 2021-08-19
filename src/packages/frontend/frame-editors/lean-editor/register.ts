/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the LEAN theorem prover editor
*/

import { register_file_editor } from "../frame-tree/register";
require("./_lean.sass");

register_file_editor({
  ext: "lean",
  editor: async () => {
    // Load plugin so that codemirror can automatically insert LEAN symbols
    await import("./codemirror-lean-symbols");
    // Register the tab completion helper for lean mode.
    await import("./tab-completion");
    return await import("./editor");
  },
  actions: async () => await import("./actions"),
});
