/*
Spec for editing Jupyter notebooks via a frame tree.
*/

import { set } from "smc-util/misc2";
import { createEditor } from "../frame-tree/editor";

import { Overview } from "./overview";
import { Assignments } from "./assignments";
/*import { Students } from "./students";
import { Handouts } from "./handouts";
import { Configuration } from "./configuration";
import { SharedProject } from "./shared-project";
*/

export const EDITOR_SPEC = {
  course_overview: {
    short: "Overview",
    name: "Course Overview",
    icon: "file",
    component: Overview,
    buttons: set([
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel"
    ])
  },
  course_assignments: {
    short: "Assignments",
    name: "Assignments",
    icon: "share-square",
    component: Assignments,
    buttons: set([
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel"
    ])
  }
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CourseEditor"
});
