/*
Spec for editing Jupyter notebooks via a frame tree.
*/

import { set } from "smc-util/misc2";
import { createEditor } from "../frame-tree/editor";

import {
  Assignments,
  Configuration,
  SharedProject,
  Students,
  Handouts
} from "./course-panels";
//import { Overview } from "./overview";

const buttons = set([
  "decrease_font_size",
  "increase_font_size",
  "save",
  "time_travel",
  "undo",
  "redo"
]);

export const EDITOR_SPEC = {
  /*
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
  },*/
  course_students: {
    short: "Students",
    name: "Students",
    icon: "users",
    component: Students,
    buttons
  },
  course_assignments: {
    short: "Assignments",
    name: "Assignments",
    icon: "share-square",
    component: Assignments,
    buttons
  },
  course_handouts: {
    short: "Handouts",
    name: "Handouts",
    icon: "copy",
    component: Handouts,
    buttons
  },
  course_configuration: {
    short: "Configuration",
    name: "Configuration",
    icon: "cogs",
    component: Configuration,
    buttons
  },
  course_shared_project: {
    short: "SharedProject",
    name: "SharedProject",
    icon: "share-alt",
    component: SharedProject,
    buttons
  }
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CourseEditor"
});
