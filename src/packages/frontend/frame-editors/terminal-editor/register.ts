/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the terminal editor
*/

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  id: "cocalc/terminal-editor",
  icon: "terminal",
  ext: "term",
  editor: async () => await import("./editor"),
  actions: async () => await import("./actions"),
});
