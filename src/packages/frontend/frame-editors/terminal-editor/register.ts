/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the terminal editor
*/

import { register_file_editor } from "../frame-tree/register";
import { IS_TOUCH } from "@cocalc/frontend/feature";

// For now, on mobile, we stay with old terminal, since copy/paste don't work, etc.
// The new one is still available for testing using an extension of .term2.
const ext = IS_TOUCH ? "term2" : "term";

register_file_editor({
  icon: "terminal",
  ext,
  editor: async () => await import("./editor"),
  actions: async () => await import("./actions"),
});
