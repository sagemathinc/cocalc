/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Spec for editing courses via a frame tree.
*/

import React from "react";

import { COMMANDS } from "@cocalc/frontend/course/commands";
import { addEditorMenus } from "@cocalc/frontend/frame-editors/frame-tree/commands";
import { course, labels, menu } from "@cocalc/frontend/i18n";
import { set } from "@cocalc/util/misc";

import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import { FrameProps } from "./course-panel-wrapper";
import {
  Actions,
  Assignments,
  Configuration,
  Handouts,
  SharedProject,
  Students,
} from "./course-panels";

const commands = set([
  "decrease_font_size",
  "increase_font_size",
  "set_zoom",
  "save",
  "time_travel",
  "help",
]);

const buttons = undefined;

const COURSE_MENUS = {
  edit: {
    label: menu.edit,
    pos: 1,
    entries: {
      editStudents: [
        "course-add-students",
        "course-add-assignments",
        "course-add-handouts",
      ],
      courseUpgrades: ["course-upgrades"],
      configCourse: [
        "course-title-and-description",
        "course-email-invitation",
        "course-copy-limit",
      ],
      restrictCourse: [
        "course-collaborator-policy",
        "course-restrict-student-projects",
      ],
      nbgraderConfig: ["course-nbgrader"],
      environmentConfig: [
        "course-software-environment",
        "course-network-file-systems",
        "course-env-variables",
      ],
      courseSharing: ["course-configuration-copying"],
    },
  },
  action: {
    label: course.actions,
    pos: 1.2,
    entries: {
      projectsActions: [
        "course-start-all-projects",
        "course-terminal-command",
        "course-reconfigure-all-projects",
      ],
      exportGrades: ["course-export-grades"],
      constrolStudents: [
        "course-resend-invites",
        "course-copy-missing-handouts-and-assignments",
      ],
      courseDelete: [
        "course-empty-trash",
        "course-delete-student-projects",
        "course-delete-students",
      ],
      sharedProject: [
        "course-create-shared-project",
        "course-delete-shared-project",
      ],
    },
  },
};

const PREFIX = "course-";
function initMenus() {
  const names = addEditorMenus({
    prefix: "course",
    editorMenus: COURSE_MENUS,
    getCommand: (name) => {
      return COMMANDS[name.slice(PREFIX.length)];
    },
  });
  for (const name of names) {
    commands[name] = true;
  }
}

initMenus();

type CourseEditorDescription = Omit<EditorDescription, "component"> & {
  component: React.FC<FrameProps>;
};

const course_students: CourseEditorDescription = {
  type: "course-students",
  short: course.students,
  name: course.students,
  icon: "users",
  component: Students,
  commands,
  buttons,
} as const;

const course_assignments: CourseEditorDescription = {
  type: "course-assignments",
  short: course.assignments,
  name: course.assignments,
  icon: "share-square",
  component: Assignments,
  commands,
  buttons,
} as const;

const course_handouts: CourseEditorDescription = {
  type: "course-handouts",
  short: course.handouts,
  name: course.handouts,
  icon: "copy",
  component: Handouts,
  commands,
  buttons,
} as const;

const course_configuration: CourseEditorDescription = {
  type: "course-configuration",
  short: labels.configuration_short,
  name: labels.configuration,
  icon: "cogs",
  component: Configuration,
  commands,
  buttons,
} as const;

const course_actions: CourseEditorDescription = {
  type: "course-actions",
  short: course.actions,
  name: course.actions,
  icon: "bolt",
  component: Actions,
  commands,
  buttons,
} as const;

const course_shared_project: CourseEditorDescription = {
  type: "course-shared_project",
  short: labels.shared,
  name: course.shared_project,
  icon: "share-square",
  component: SharedProject,
  commands,
  buttons,
} as const;

export const EDITOR_SPEC = {
  course_students,
  course_assignments,
  course_handouts,
  course_configuration,
  course_actions,
  course_shared_project,
  terminal,
  time_travel,
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CourseEditor",
});
