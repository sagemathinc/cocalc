/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the course frame tree editor
*/

import { Editor } from "./editor";
import { CourseEditorActions } from "./actions";

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "course",
  component: Editor,
  Actions: CourseEditorActions,
  is_public: false,
});
