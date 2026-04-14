/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the Whiteboard editor
*/

import { register_file_editor } from "@cocalc/frontend/frame-editors/frame-tree/register";

register_file_editor({
  id: "cocalc/whiteboard-editor",
  ext: "board",
  editor: async () => await import("./editor"),
  actions: async () => await import("./actions"),
});
