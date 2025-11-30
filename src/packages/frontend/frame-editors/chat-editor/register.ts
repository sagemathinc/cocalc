/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the chatroom editor
*/

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "sage-chat",
  editor: async () => await import("./editor"),
  actions: async () => await import("./actions"),
});

register_file_editor({
  ext: "chat",
  editor: async () => await import("./editor"),
  actions: async () => await import("./actions"),
});
