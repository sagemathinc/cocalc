/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the Sage Worksheet editor
*/

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "sagews",
  editor: async () => await import("./editor"),
  actions: async () => await import("./actions"),
});
