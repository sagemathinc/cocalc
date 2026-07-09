/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the .app agent editor (CoCalc Apps)
*/

import { register_file_editor } from "@cocalc/frontend/frame-editors/frame-tree/register";

register_file_editor({
  id: "cocalc/agent-editor",
  ext: "app",
  editor: async () => await import("./editor"),
  actions: async () => await import("./actions"),
});
