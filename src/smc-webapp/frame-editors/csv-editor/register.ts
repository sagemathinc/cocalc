/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the HTML editor
*/

import { CsvEditor } from "./editor";
import { Actions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

export const ICON = "table";

register_file_editor({
  ext: "csv",
  icon: ICON,
  component: CsvEditor,
  Actions,
});
