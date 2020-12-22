/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for editing Jupyter notebooks via a frame tree.
*/

import { set } from "smc-util/misc";
import { createEditor } from "../frame-tree/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import {
  Assignments,
  Configuration,
  SharedProject,
  Students,
  Handouts,
} from "./course-panels";

const buttons = set([
  "decrease_font_size",
  "increase_font_size",
  "save",
  "time_travel" /*,
  "undo",
  "redo"*/,
]);

export const EDITOR_SPEC = {
  course_students: {
    short: "Students",
    name: "Students",
    icon: "users",
    component: Students,
    buttons,
  },
  course_assignments: {
    short: "Assignments",
    name: "Assignments",
    icon: "share-square",
    component: Assignments,
    buttons,
  },
  course_handouts: {
    short: "Handouts",
    name: "Handouts",
    icon: "copy",
    component: Handouts,
    buttons,
  },
  course_configuration: {
    short: "Config",
    name: "Configuration",
    icon: "cogs",
    component: Configuration,
    buttons,
  },
  course_shared_project: {
    short: "Shared",
    name: "Shared Project",
    icon: "share-alt",
    component: SharedProject,
    buttons,
  },
  terminal,
  time_travel,
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CourseEditor",
});
