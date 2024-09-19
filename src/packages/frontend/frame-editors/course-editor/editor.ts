/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Spec for editing courses via a frame tree.
*/

import { set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import {
  Assignments,
  Configuration,
  SharedProject,
  Students,
  Handouts,
  Actions,
} from "./course-panels";
import { EditorDescription } from "../frame-tree/types";
import { addEditorMenus } from "@cocalc/frontend/frame-editors/frame-tree/commands";
import { menu } from "@cocalc/frontend/i18n";

const commands = set([
  // commented out for now since broken: See https://github.com/sagemathinc/cocalc/issues/7235
  //"decrease_font_size",
  //"increase_font_size",
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
      students: ["course-add-student"],
    },
  },
  action: {
    label: "Actions",
    pos: 1.2,
    entries: {
      projects: [
        "course-start-all-projects",
        "course-terminal-command",
        "course-reconfigure-all-projects",
      ],
      export: ["course-export-grades"],
    },
  },
};

const COMMANDS = {
  "course-add-student": {
    pos: 1,
    icon: "users",
    label: "Add Students",
    button: "+Student",
    title: "Add one or more students to this course.",
    onClick: ({ props }) => {
      const { id, actions } = props;
      actions.set_frame_type(id, "course_students");
      actions.setModal("add-students");
    },
  },
  "course-start-all-projects": {
    icon: "bolt",
    label: "Start all Student Projects",
    button: "Start All",
    title:
      "You can start all projects associated with this course so they are immediately ready for your students to use.",
    onClick: ({ props }) => {
      const { id, actions } = props;
      actions.set_frame_type(id, "course_actions");
      actions.setModal("start-all-projects");
    },
  },
  "course-terminal-command": {
    icon: "terminal",
    label: "Run Terminal Command in all Student Projects",
    button: "Terminal",
    title:
      "Run a bash terminal command in the home directory of all student projects. Up to 30 commands run in parallel, with a timeout of 1 minutes.",
    onClick: ({ props }) => {
      const { id, actions } = props;
      actions.set_frame_type(id, "course_actions");
      actions.setModal("terminal-command");
    },
  },
  "course-reconfigure-all-projects": {
    icon: "mail",
    label: "Reconfigure all Projects",
    button: "Reconfigure",
    title: "Update all projects with correct students, descriptions, etc.",
    onClick: ({ props }) => {
      const { id, actions } = props;
      actions.set_frame_type(id, "course_actions");
      actions.setModal("reconfigure-all-projects");
    },
  },
  "course-export-grades": {
    icon: "table",
    label: "Export Grades",
    button: "Grades",
    title:
      "Export all the grades you have recorded for students in your course to a csv or Python file.",
    onClick: ({ props }) => {
      const { id, actions } = props;
      actions.set_frame_type(id, "course_actions");
      actions.setModal("export-grades");
    },
  },
};

function initMenus() {
  const names = addEditorMenus({
    prefix: "course",
    editorMenus: COURSE_MENUS,
    getCommand: (name) => {
      return COMMANDS[name];
    },
  });
  for (const name of names) {
    commands[name] = true;
  }
}

initMenus();

const course_students: EditorDescription = {
  type: "course-students",
  short: "Students",
  name: "Students",
  icon: "users",
  component: Students,
  commands,
  buttons,
} as const;

const course_assignments: EditorDescription = {
  type: "course-assignments",
  short: "Assignments",
  name: "Assignments",
  icon: "share-square",
  component: Assignments,
  commands,
  buttons,
} as const;

const course_handouts: EditorDescription = {
  type: "course-handouts",
  short: "Handouts",
  name: "Handouts",
  icon: "copy",
  component: Handouts,
  commands,
  buttons,
} as const;

const course_configuration: EditorDescription = {
  type: "course-configuration",
  short: "Config",
  name: "Configuration",
  icon: "cogs",
  component: Configuration,
  commands,
  buttons,
} as const;

const course_actions: EditorDescription = {
  type: "course-actions",
  short: "Actions",
  name: "Actions",
  icon: "bolt",
  component: Actions,
  commands,
  buttons,
} as const;

const course_shared_project: EditorDescription = {
  type: "course-shared_project",
  short: "Shared",
  name: "Shared Project",
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
