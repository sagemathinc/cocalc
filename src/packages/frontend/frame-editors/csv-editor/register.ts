/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the CSV editor
*/

import { register_file_editor } from "../frame-tree/register";

export const ICON = "table";

register_file_editor({
  ext: "csv",
  icon: "table",
  editor: async () => await import("./editor"),
  actions: async () => await import("./actions"),
});
