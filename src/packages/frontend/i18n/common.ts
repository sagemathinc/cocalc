import { defineMessages } from "react-intl";

export const labels = defineMessages({
  projects: {
    id: "labels.projects",
    defaultMessage: "Projects",
    description:
      "Label for a collection of projects, label on a button, title, etc.",
  },
  create_project: {
    id: "labels.create_project",
    defaultMessage: "Create Project...",
    description:
      "Label on buttons to open dialog to create a project, with 3 dots",
  },
  account: {
    id: "labels.account",
    defaultMessage: "Account",
    description: "Title/button for showing the 'Account' settings.",
  },
  account_first_name: {
    id: "labels.account.first_name",
    defaultMessage: "First name",
    description: "Label for Account/First name:",
  },
  account_last_name: {
    id: "labels.account.last_name",
    defaultMessage: "Last name",
    description: "Label for Account/Last name:",
  },
  account_password: {
    id: "labels.acconut.password",
    defaultMessage: "Password",
    description: "The label of the password field",
  },
  account_password_change: {
    id: "labels.acconut.password.change",
    defaultMessage: "Change Password",
    description: "Button label for changing the password",
  },
  account_password_forgot: {
    id: "labels.acconut.password.forgot",
    defaultMessage: "Forgot Password?",
    description: "Label on link to reset password",
  },
});
