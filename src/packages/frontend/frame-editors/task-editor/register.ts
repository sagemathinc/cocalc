/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the tasks editor
*/

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "tasks",
  editor: async () => await import("./editor"),
  actions: async () => await import("./actions"),
});
