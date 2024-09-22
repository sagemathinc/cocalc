import { ENV_VARS_ICON } from "@cocalc/frontend/project/settings/environment";

export const COMMANDS = {
  "add-students": {
    icon: "users",
    label: "Add Students",
    button: "+Student",
    title: "Add one or more students to this course.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("add-students");
    },
  },
  "add-assignments": {
    icon: "share-square",
    label: "Add Assignments",
    button: "+Assignment",
    title: "Add one or more assignments to this course.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("add-assignments");
    },
  },
  "add-handouts": {
    icon: "text1",
    label: "Add Handouts",
    button: "+Handouts",
    title: "Add one or more handouts to this course.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("add-handouts");
    },
  },
  "title-and-description": {
    icon: "header",
    label: "Course Title and Description",
    button: "Title",
    title: "Set the course title and description.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("title-and-description");
    },
  },
  "email-invitation": {
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
  "copy-limit": {
    icon: "users",
    label: "Parallel Copy Limit",
    button: "Limit",
    title: "Max number of students to copy and collect files from in parallel.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("copy-limit");
    },
  },
  "collaborator-policy": {
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
  "restrict-student-projects": {
    icon: "lock",
    label: "Restrict Student Projects",
    button: "Restrict",
    title: "Remove functionality from student projects",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("restrict-student-projects");
    },
  },
  nbgrader: {
    icon: "graduation-cap",
    label: "Configure Nbgrader",
    button: "Nbgrader",
    title: "Configure how nbgrader works.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("nbgrader");
    },
  },
  "software-environment": {
    icon: "laptop",
    label: "Software Environment",
    button: "Software",
    title:
      "Configure the software environment that all student projects will use.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("software-environment");
    },
  },
  "network-file-systems": {
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
  "env-variables": {
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
  "configuration-copying": {
    icon: "clone",
    label: "Copy Course Configuration",
    button: "Config",
    title: "Easily copy configuration from this course to other courses.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("configuration-copying");
    },
  },
  upgrades: {
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

  "start-all-projects": {
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
  "terminal-command": {
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
  "reconfigure-all-projects": {
    icon: "mail",
    label: "Reconfigure all Projects",
    button: "Reconfigure",
    title: "Update all projects with correct students, descriptions, etc.",
    onClick: ({ props }) => {
      const { actions } = props;
      actions.setModal("reconfigure-all-projects");
    },
  },
  "export-grades": {
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
  "resend-invites": {
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
  "copy-missing-handouts-and-assignments": {
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
  "empty-trash": {
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
  "delete-student-projects": {
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
  "delete-students": {
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
  "delete-shared-project": {
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
  "create-shared-project": {
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
