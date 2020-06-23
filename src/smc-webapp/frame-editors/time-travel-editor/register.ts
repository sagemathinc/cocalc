/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the TimeTravel frame tree editor
*/

import { Editor } from "./editor";
import { TimeTravelActions } from "./actions";

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "time-travel",
  component: Editor,
  Actions: TimeTravelActions,
  is_public: false,
});
