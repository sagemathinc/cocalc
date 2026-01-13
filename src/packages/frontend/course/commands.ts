/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IconName } from "@cocalc/frontend/components/icon";

import { defineMessage } from "react-intl";

import type { CourseEditorActions } from "@cocalc/frontend/frame-editors/course-editor/actions";
import { course, IntlMessage, labels } from "@cocalc/frontend/i18n";
import { ENV_VARS_ICON } from "@cocalc/frontend/project/settings/environment";

// ATTN: the COMMANDS configuration is not only used in the menu (using ManageCommands),
// but also directly in some dialogs. Hence this is a subset from the Command type.
type Command = {
  title: string | IntlMessage;
  label: string | IntlMessage;
  onClick: (arg: { props: { actions: CourseEditorActions } }) => void;
  icon: IconName;
  button: string | IntlMessage;
};

export const COMMANDS: { [name: string]: Command } = {
  "add-students": {
    icon: "users",
    label: course.add_students,
    button: defineMessage({
      id: "course.commands.add-students.button",
      defaultMessage: "+Student",
      description:
        "Adding Students in a course. A short label on a button, starting with a + sign.",
    }),
    title: course.add_students_tooltip,
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("add-students");
    },
  },
  "add-assignments": {
    icon: "share-square",
    label: course.add_assignments,
    button: defineMessage({
      id: "course.commands.add-assignments.button",
      defaultMessage: "+Assignment",
      description:
        "Adding an assignment in a course.  A short label on a button, starting with a + sign.",
    }),
    title: defineMessage({
      id: "course.commands.add-assignments.tooltip",
      defaultMessage: "Add one or more assignments to this course.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("add-assignments");
    },
  },
  "add-handouts": {
    icon: "text1",
    label: defineMessage({
      id: "course.commands.add-handouts.label",
      defaultMessage: "Add Handouts",
      description: "Adding a handout in a course.",
    }),
    button: defineMessage({
      id: "course.commands.add-handouts.button",
      defaultMessage: "+Handouts",
      description:
        "Adding a handout in a course.  A short label on a button, starting with a + sign.",
    }),
    title: defineMessage({
      id: "course.commands.add-handouts.tooltip",
      defaultMessage: "Add one or more handouts to this course.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("add-handouts");
    },
  },
  "title-and-description": {
    icon: "header",
    label: course.title_and_description_label,
    button: labels.title,
    title: defineMessage({
      id: "course.commands.title-and-description.tooltip",
      defaultMessage: "Set the course title and description.",
      description: "title and description of a course for students.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("title-and-description");
    },
  },
  "email-invitation": {
    icon: "mail",
    label: course.email_invitation_label,
    button: labels.invite,
    title: defineMessage({
      id: "course.commands.email-invitation.tooltip",
      defaultMessage:
        "If you add a student to this course using their email address, and they do not have a CoCalc account, then they will receive this email invitation.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("email-invitation");
    },
  },
  "copy-limit": {
    icon: "users",
    label: defineMessage({
      id: "course.commands.copy-limit.label",
      defaultMessage: "Parallel Copy Limit",
    }),
    button: labels.limit,
    title: defineMessage({
      id: "course.commands.copy-limit.tooltip",
      defaultMessage:
        "Max number of students to copy and collect files from in parallel.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("copy-limit");
    },
  },
  "collaborator-policy": {
    icon: "mail",
    label: course.collaborator_policy,
    button: defineMessage({
      id: "course.commands.collaborator-policy.button",
      defaultMessage: "Collab",
      description: "Short label on a button, abbrivation of 'Collaborators'",
    }),
    title: defineMessage({
      id: "course.commands.collaborator-policy.tooltip",
      defaultMessage:
        "Control if the owner and any collaborator on this student project may add collaborators to this project.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("collaborator-policy");
    },
  },
  "restrict-student-projects": {
    icon: "lock",
    label: course.restrict_student_projects,
    button: labels.restrict,
    title: defineMessage({
      id: "course.commands.restrict-student-projects.toolteip",
      defaultMessage: "Remove functionality from student projects",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("restrict-student-projects");
    },
  },
  nbgrader: {
    icon: "graduation-cap",
    label: defineMessage({
      id: "course.commands.nbgrader.label",
      defaultMessage: "Configure nbgrader",
    }),
    button: labels.nbgrader,
    title: defineMessage({
      id: "course.commands.nbgrader.tooltip",
      defaultMessage: "Configure how nbgrader works.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("nbgrader");
    },
  },
  "software-environment": {
    icon: "laptop",
    label: labels.software_environment,
    button: labels.software,
    title: defineMessage({
      id: "course.commands.software-environment.tooltip",
      defaultMessage:
        "Configure the software environment that all student projects will use.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("software-environment");
    },
  },
  "network-file-systems": {
    icon: "database",
    label: labels.cloud_storage_remote_filesystems,
    button: labels.nbgrader,
    title: defineMessage({
      id: "course.commands.network-file-systems.tooltip",
      defaultMessage:
        "Give all student projects read-only access to the same cloud stores and remote file systems as this instructor project.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("network-file-systems");
    },
  },
  "env-variables": {
    icon: ENV_VARS_ICON,
    label: defineMessage({
      id: "course.commands.env-variables.label",
      defaultMessage: "Configure Environment Variables",
    }),
    button: labels.environment,
    title: defineMessage({
      id: "course.commands.env-variables.tooltip",
      defaultMessage:
        "Configure whether or not student projects inherit the environment variables of this instructor project.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("env-variables");
    },
  },
  "configuration-copying": {
    icon: "copy",
    label: defineMessage({
      id: "course.commands.configuration-copying.label",
      defaultMessage: "Copy Course Configuration",
    }),
    button: labels.config,
    title: defineMessage({
      id: "course.commands.configuration-copying.tooltip",
      defaultMessage: "Copy configuration from this course to other courses.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("configuration-copying");
    },
  },
  upgrades: {
    icon: "gears",
    label: defineMessage({
      id: "course.commands.upgrades.label",
      defaultMessage: "Configure Upgrades (Student or Instructor Pay)",
    }),
    button: labels.upgrades,
    title: defineMessage({
      id: "course.commands.upgrades.tooltip",
      defaultMessage:
        "Use a license to upgrade all projects, or require your students to purchase a specific license.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("upgrades");
    },
  },
  "start-all-projects": {
    icon: "bolt",
    label: defineMessage({
      id: "course.commands.start-all-projects.label",
      defaultMessage: "Start or Stop all Student Projects",
    }),
    button: labels.start_all,
    title: defineMessage({
      id: "course.commands.start-all-projects.tooltip",
      defaultMessage:
        "You can start all projects associated with this course so they are immediately ready for your students to use.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("start-all-projects");
    },
  },
  "terminal-command": {
    icon: "terminal",
    label: defineMessage(course.run_terminal_command_title),
    button: labels.terminal,
    title: defineMessage({
      id: "course.commands.terminal-command.tooltip",
      defaultMessage:
        "Run a bash terminal command in the home directory of all student projects. Up to 30 commands run in parallel, with a timeout of 1 minutes.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("terminal-command");
    },
  },
  "reconfigure-all-projects": {
    icon: "mail",
    label: course.reconfigure_all_projects,
    button: labels.reconfigure,
    title: defineMessage({
      id: "course.commands.reconfigure-all-projects.tooltip",
      defaultMessage:
        "Update all projects with correct students, descriptions, etc.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("reconfigure-all-projects");
    },
  },
  "export-grades": {
    icon: "table",
    label: course.export_grades,
    button: course.grades,
    title: defineMessage({
      id: "course.commands.export-grades.tooltip",
      defaultMessage:
        "Export all the grades you have recorded for students in your course to a csv or Python file.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("export-grades");
    },
  },
  "resend-invites": {
    icon: "mail",
    label: course.resend_invites,
    button: labels.invites,
    title: defineMessage({
      id: "course.commands.resend-invites.tooltip",
      defaultMessage:
        "Send another email to every student who didn't sign up yet. This sends a maximum of one email every 1 day.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("resend-invites");
    },
  },
  "copy-missing-handouts-and-assignments": {
    icon: "graph",
    label: course.copy_missing_handouts_assignments,
    button: defineMessage({
      id: "course.commands.copy-missing-handouts-and-assignments.button",
      defaultMessage: "Copy Missing",
    }),
    title: defineMessage({
      id: "course.commands.copy-missing-handouts-and-assignments.tooltip",
      defaultMessage:
        "If you add new students to your course, you can ensure they have all the assignments and handouts that you have already assigned to other students in the course.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("copy-missing-handouts-and-assignments");
    },
  },
  "empty-trash": {
    icon: "trash",
    label: labels.empty_trash,
    button: labels.trash,
    title: defineMessage({
      id: "course.commands.empty-trash.tooltip",
      defaultMessage:
        "Empty trash by purging deleted students, assignments, and handouts.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("empty-trash");
    },
  },
  "delete-student-projects": {
    icon: "trash",
    label: defineMessage(course.delete_student_projects),
    button: labels.delete,
    title: defineMessage({
      id: "course.commands.delete-student-projects.tooltip",
      defaultMessage:
        "If for some reason you would like to delete all the student projects created for this course, you may do so by clicking above.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("delete-student-projects");
    },
  },
  "delete-students": {
    icon: "trash",
    label: defineMessage({
      id: "course.commands.delete-students.label",
      defaultMessage: "Delete Students",
    }),
    button: labels.delete,
    title: defineMessage({
      id: "course.commands.delete-students.tooltip",
      defaultMessage:
        "Student projects will not be deleted. If you make a mistake, students can still be undeleted from the Student tab or using TimeTravel.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("delete-students");
    },
  },
  "delete-shared-project": {
    icon: "trash",
    label: course.delete_shared_project,
    button: labels.delete,
    title: defineMessage({
      id: "course.commands.delete-shared-project.tooltip",
      defaultMessage:
        "If it exists, delete the common shared project, which everybody has access to.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("delete-shared-project");
    },
  },
  "create-shared-project": {
    icon: "users",
    label: course.create_shared_project,
    button: defineMessage({
      id: "course.commands.create-shared-project.button",
      defaultMessage: "Shared",
    }),
    title: defineMessage({
      id: "course.commands.create-shared-project.tooltip",
      defaultMessage:
        "Create a single common shared project, which everybody – students and all collaborators on this project (your TAs and other instructors) – have write access to.",
    }),
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("create-shared-project");
    },
  },
} as const;
