/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the Rst editor
*/

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  id: "cocalc/rst-editor",
  ext: "rst",
  editor: async () => await import("./editor"),
  actions: async () => await import("./actions"),
});
