import { defineMessages } from "react-intl";

export const labels = defineMessages({
  button_cancel: {
    id: "labels.button.cancel",
    defaultMessage: "Cancel",
    description:
      "'Cancel' button on all those small confirmation modals (other one is 'Ok' or 'Yes')",
  },
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
  account_language_tooltip: {
    id: "labels.account.language_tooltip",
    defaultMessage: "Change the language of the user-interface.",
    description: "Tooltip text of dropdown to change the UI language",
  },
  frame_editors_title_bar_save_label: {
    id: "labels.frame-editors.title-bar.save_label",
    defaultMessage:
      "{type, select, is_public {Public} read_only {Readonly} other {Save}}",
    description: "Frame editor's title bar 'Save' button",
  },
  project_settings_restart_project_confirm_explanation: {
    id: "labels.project.settings.restart-project.confirm.explanation",
    defaultMessage:
      "Restarting the project server will terminate all processes in the project, update the project code, and start the project running again. Running <a>compute servers</a> are not affected. It takes a few seconds, and can fix some issues in case things are not working properly. You'll not lose any files, but you have to start your notebooks and worksheets again.",
  },
  project_settings_restart_project_confirm_ok: {
    id: "labels.project.settings.restart-project.confirm.ok",
    defaultMessage: "Yes, {task} project",
  },
  project_settings_stop_project_ok: {
    id: "labels.project.settings.stop-project.ok",
    defaultMessage: "Yes, stop project",
  },
  project_settings_stop_project_label: {
    id: "labels.project.settings.stop-project.label",
    defaultMessage: "Stop{short, select, true {} other { Project}}…",
  },
  upload: {
    id: "labels.upload",
    defaultMessage: "Upload",
    description: "Label on such buttons, where a file upload can be initiated",
  },
  preferences: { id: "labels.preferences", defaultMessage: "Preferences" },
  purchases: { id: "labels.purchases", defaultMessage: "Purchases" },
  subscriptions: { id: "labels.subscriptons", defaultMessage: "Subscriptions" },
  statements: {
    id: "labels.statements",
    defaultMessage: "Statements",
    description: "Billing statements",
  },
  licenses: {
    id: "labels.licenses",
    defaultMessage: "Licenses",
    description:
      "A license is part of a subscription or a one-time purchase to upgrade projects",
  },
  published_files: {
    id: "labels.published_files",
    defaultMessage: "Published Files",
  },
  upgrades: {
    id: "labels.upgrades",
    defaultMessage: "Upgrades",
    description: "Upgrades for specific projects",
  },
  cloud_file_system: {
    id: "labels.cloud_file_system",
    defaultMessage: "Cloud File Systems",
  },
  ssh_keys: { id: "labels.ssh_keys", defaultMessage: "SSH Keys" },
  support: { id: "labels.support", defaultMessage: "Support" },
  new: {
    id: "labels.new.file",
    defaultMessage: "New",
    description: "Create new file button '+ New'",
  },
  settings: {
    id: "labels.settings",
    defaultMessage: "Settings",
    description: "On a button to show project settings",
  },
  help: {
    id: "labels.help",
    defaultMessage: "Help",
    description: "Help entry in a menu or label on a button",
  },
  save: {
    id: "labels.save",
    defaultMessage: "Save",
    description: "In the context of saving files, in a menu or on a button",
  },
  split_frame_vertically_title: {
    id: "labels.split_frame_vertically.title",
    defaultMessage: "Split frame vertically into two columns",
  },
  split_frame_horizontally_title: {
    id: "labels.split_frame_horizontally.title",
    defaultMessage: "Split Down",
    description: "Split a frame horizontally",
  },
});

export const menu = defineMessages({
  file: {
    id: "menu.generic.file.label",
    defaultMessage: "File",
  },
  edit: {
    id: "menu.generic.edit.label",
    defaultMessage: "Edit",
  },
  insert: {
    id: "menu.generic.insert.label",
    defaultMessage: "Insert",
  },
  format: {
    id: "menu.generic.format.label",
    defaultMessage: "Format",
  },
  view: {
    id: "menu.generic.view.label",
    defaultMessage: "View",
  },
  go: {
    id: "menu.generic.go.label",
    defaultMessage: "Go",
  },
  help: {
    id: "menu.generic.help.label",
    defaultMessage: "Help",
  },
  new_file: {
    id: "menu.generic.new_file.label",
    defaultMessage: "New File",
  },
  run: {
    id: "menu.generic.run.label",
    defaultMessage: "Run",
  },
  kernel: {
    id: "menu.generic.kernel.label",
    defaultMessage: "Kernel",
    description:
      "Button label or menu entry for the 'Jupyter Kernel'. Keep its name 'Kernel' in all languages.",
  },
  close_and_halt: {
    id: "menu.generic.close_and_halt.label",
    defaultMessage: "Close and Halt...",
    description: "Close and halt the editor for Jupyter, a server, etc.",
  },
  halt_jupyter_button: {
    id: "menu.generic.halt_jupyter.button",
    defaultMessage: "Halt",
    description: "Halt Jupyter kernel and close the notebook editor",
  },
  halt_jupyter_title: {
    id: "menu.generic.halt_jupyter.title",
    defaultMessage: "Halt the running Jupyter kernel and close this notebook.",
  },
  kick_other_users_out_label: {
    id: "menu.generic.kick_other_users_out.label",
    defaultMessage: "Kick Other Users Out",
  },
  kick_other_users_out_button: {
    id: "menu.generic.kick_other_users_out.button",
    defaultMessage: "Kick",
  },
  kick_other_users_out_title: {
    id: "menu.generic.kick_other_users_out.title",
    defaultMessage:
      "Kick all other users out from this document. It will close in all other browsers.",
  },
  split: {
    id: "menu.generic.split.button",
    defaultMessage: "Split",
    description:
      "Split a frame horizontally or vertically (short single word on button)",
  },
});

export const editor = defineMessages({
  table_of_contents_short: {
    id: "editor.table_of_contents.short",
    defaultMessage: "Content",
  },
  table_of_contents_name: {
    id: "editor.table_of_contents.name",
    defaultMessage: "Table of Contents",
  },
});
