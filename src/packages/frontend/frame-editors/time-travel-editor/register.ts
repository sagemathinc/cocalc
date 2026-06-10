/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the TimeTravel frame tree editor
*/

import { Editor } from "./editor";
import { TimeTravelActions } from "./actions";
import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  id: "cocalc/time-travel-editor",
  ext: "time-travel",
  component: Editor,
  Actions: TimeTravelActions,
});
