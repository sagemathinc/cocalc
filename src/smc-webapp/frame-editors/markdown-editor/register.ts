/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the markdown editor
*/

import { Editor } from "./editor";
import { Actions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

["md", "markdown"].map((ext) =>
  register_file_editor({
    ext,
    component: Editor,
    Actions,
  })
);
