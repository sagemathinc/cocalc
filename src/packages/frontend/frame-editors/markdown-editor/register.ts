/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the markdown editor
*/

import { register_file_editor } from "../frame-tree/register";

["md", "markdown"].map((ext) =>
  register_file_editor({
    id: "cocalc/markdown-editor",
    ext,
    editor: async () => await import("./editor"),
    actions: async () => await import("./actions"),
  }),
);
