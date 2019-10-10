/*
Spec for editing Jupyter notebooks via a frame tree.
*/

import { set } from "smc-util/misc2";
import { createEditor } from "../frame-tree/editor";

import { Assignments, Students } from "./course-panels";
import { Overview } from "./overview";
import { Handouts } from "./handouts";
import { Configuration } from "./configuration";
import { SharedProject } from "./shared-project";

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
  course_students: {
    short: "Students",
    name: "Students",
    icon: "users",
    component: Students,
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
  },
  course_handouts: {
    short: "Handouts",
    name: "Handouts",
    icon: "copy",
    component: Handouts,
    buttons: set([
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel"
    ])
  },
  course_configuration: {
    short: "Configuration",
    name: "Configuration",
    icon: "cogs",
    component: Configuration,
    buttons: set([
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel"
    ])
  },
  course_shared_project: {
    short: "SharedProject",
    name: "SharedProject",
    icon: "share-alt",
    component: SharedProject,
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
