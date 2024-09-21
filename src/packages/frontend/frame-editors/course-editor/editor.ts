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
import { ENV_VARS_ICON } from "@cocalc/frontend/project/settings/environment";

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
        "course-network-file-systems",
        "course-env-variables",
      ],
    },
  },
  action: {
    label: "Actions",
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

const COMMANDS = {
  "course-add-students": {
    icon: "users",
    label: "Add Students",
    button: "+Student",
    title: "Add one or more students to this course.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("add-students");
    },
  },
  "course-add-assignments": {
    icon: "share-square",
    label: "Add Assignments",
    button: "+Assignment",
    title: "Add one or more assignments to this course.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("add-assignments");
    },
  },
  "course-add-handouts": {
    icon: "text1",
    label: "Add Handouts",
    button: "+Handouts",
    title: "Add one or more handouts to this course.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("add-handouts");
    },
  },
  "course-title-and-description": {
    icon: "header",
    label: "Course Title and Description",
    button: "Title",
    title: "Set the course title and description.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("title-and-description");
    },
  },
  "course-email-invitation": {
    icon: "mail",
    label: "Email Invitation",
    button: "Invite",
    title:
      "If you add a student to this course using their email address, and they do not have a CoCalc account, then they will receive this email invitation.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("email-invitation");
    },
  },
  "course-copy-limit": {
    icon: "users",
    label: "Parallel Copy Limit",
    button: "Limit",
    title: "Max number of students to copy and collect files from in parallel.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("copy-limit");
    },
  },
  "course-collaborator-policy": {
    icon: "mail",
    label: "Collaborator Policy",
    button: "Collab",
    title:
      "Control if the owner and any collaborator on this student project may add collaborators to this project.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("collaborator-policy");
    },
  },
  "course-restrict-student-projects": {
    icon: "lock",
    label: "Restrict Student Projects",
    button: "Restrict",
    title: "Remove functionality from student projects",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("restrict-student-projects");
    },
  },
  "course-nbgrader": {
    icon: "graduation-cap",
    label: "Configure Nbgrader",
    button: "Nbgrader",
    title: "Configure how nbgrader works.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("nbgrader");
    },
  },
  "course-network-file-systems": {
    icon: "database",
    label: "Cloud Storage & Remote File Systems",
    button: "Nbgrader",
    title:
      "Give all student projects read-only access to the same cloud stores and remote file systems as this instructor project.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("network-file-systems");
    },
  },
  "course-env-variables": {
    icon: ENV_VARS_ICON,
    label: "Configure Environment Variables",
    button: "Environment",
    title:
      "Configure whether or not student projects inherit the environment variables of this instructor project.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("env-variables");
    },
  },
  "course-upgrades": {
    icon: "gears",
    label: "Configure Upgrades (Student or Instructor Pay)",
    button: "Upgrades",
    title:
      "Use a license to upgrade all projects, or require your students to purchase a specific license.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("upgrades");
    },
  },

  "course-start-all-projects": {
    icon: "bolt",
    label: "Start or Stop all Student Projects",
    button: "Start All",
    title:
      "You can start all projects associated with this course so they are immediately ready for your students to use.",
    onClick: ({ props }) => {
      const { actions } = props;
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
      const { actions } = props;
      actions.setModal("terminal-command");
    },
  },
  "course-reconfigure-all-projects": {
    icon: "mail",
    label: "Reconfigure all Projects",
    button: "Reconfigure",
    title: "Update all projects with correct students, descriptions, etc.",
    onClick: ({ props }) => {
      const { actions } = props;
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
      const { actions } = props;
      actions.setModal("export-grades");
    },
  },
  "course-resend-invites": {
    icon: "mail",
    label: "Resend Outstanding Invites",
    button: "Invites",
    title:
      "Send another email to every student who didn't sign up yet. This sends a maximum of one email every 1 day.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("resend-invites");
    },
  },
  "course-copy-missing-handouts-and-assignments": {
    icon: "graph",
    label: "Copy Missing Handouts and Assignments",
    button: "Copy Missing",
    title:
      "If you add new students to your course, you can ensure they have all the assignments and handouts that you have already assigned to other students in the course.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("copy-missing-handouts-and-assignments");
    },
  },
  "course-empty-trash": {
    icon: "trash",
    label: "Empty Trash",
    button: "Trash",
    title:
      "Empty trash by purging deleted students, assignments, and handouts.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("empty-trash");
    },
  },
  "course-delete-student-projects": {
    icon: "trash",
    label: "Delete Student Projects",
    button: "Delete",
    title:
      "If for some reason you would like to delete all the student projects created for this course, you may do so by clicking above.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("delete-student-projects");
    },
  },
  "course-delete-students": {
    icon: "trash",
    label: "Delete Students",
    button: "Delete",
    title:
      "Student projects will not be deleted. If you make a mistake, students can still be undeleted from the Student tab or using TimeTravel.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("delete-students");
    },
  },
  "course-delete-shared-project": {
    icon: "trash",
    label: "Delete Shared Project",
    button: "Delete",
    title:
      "Student projects will not be deleted. If you make a mistake, students can still be undeleted from the Student tab or using TimeTravel.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("delete-shared-project");
    },
  },
  "course-create-shared-project": {
    icon: "users",
    label: "Create Shared Project",
    button: "Shared",
    title:
      "Create a single common shared project, which everybody -- students and all collaborators on this project (your TAs and other instructors) -- have write access to.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("create-shared-project");
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
