/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { defineMessages } from "react-intl";

// cSpell:ignore noconf collabs nostop

export const labels = defineMessages({
  unique_id_is_missing: {
    defaultMessage: "unique id missing",
    description:
      "This is just an internal message to trigger ID collisions. If you hit this, your i18n message has no ID. Please consult the README in this directory for more information. The usual pattern is something like [dir].[subdir/filename].[section].[label|message|...]. Messages in this file however are prefixed with their purpose.",
  },
  cancel: {
    id: "labels.button.cancel",
    defaultMessage: "Cancel",
    description:
      "'Cancel' button on all those small confirmation modals (other one is 'Ok' or 'Yes')",
  },
  reset: {
    id: "labels.reset",
    defaultMessage: "Reset",
    description: "A 'Reset' button on a small confirmation modal dialog",
  },
  edit: {
    id: "labels.edit",
    defaultMessage: "Edit",
    description: "Short label on a button to edit a text field.",
  },
  generate: {
    id: "labels.generate",
    defaultMessage: "Generate",
    description: "Short label on a button to generate something.",
  },
  other: {
    id: "labels.other",
    defaultMessage: "Other",
  },
  on: {
    id: "labels.on",
    defaultMessage: "On",
    description:
      "short single word, just a few characters long, for a label. Should mean 'enabled'.",
  },
  off: {
    id: "labels.off",
    defaultMessage: "Off",
    description:
      "short single word, just a few characters long, for a label. Should mean 'disabled'.",
  },
  yes: {
    id: "labels.yes",
    defaultMessage: "Yes",
    description:
      "A confirmation response, typically used in dialogs or prompts.",
  },
  no: {
    id: "labels.no",
    defaultMessage: "No",
    description: "A denial response, often used in dialogs or prompts.",
  },
  project: {
    id: "labels.project",
    defaultMessage: "Project",
    description: "Label for a single project, label on a button, title, etc.",
  },
  projects: {
    id: "labels.projects",
    defaultMessage: "Projects",
    description:
      "Label for a collection of projects, label on a button, title, etc.",
  },
  create: {
    id: "labels.create",
    defaultMessage: "create",
  },
  create_project: {
    id: "labels.create_project",
    defaultMessage: "Create Project...",
    description:
      "Label on buttons to open dialog to create a project, with 3 dots",
  },
  relative: {
    id: "labels.relative",
    defaultMessage: "Relative",
  },
  absolute: {
    id: "labels.absolute",
    defaultMessage: "Absolute",
  },
  account: {
    id: "labels.account",
    defaultMessage: "Account",
    description: "Title/button for showing the 'Account' settings.",
  },
  account_first_name: {
    id: "labels.account.first_name",
    defaultMessage: "First Name",
    description: "Label for Account/First name:",
  },
  account_last_name: {
    id: "labels.account.last_name",
    defaultMessage: "Last Name",
    description: "Label for Account/Last name:",
  },
  account_password: {
    id: "labels.account.password",
    defaultMessage: "Password",
    description: "The label of the password field",
  },
  account_password_change: {
    id: "labels.account.password.change",
    defaultMessage: "Change Password",
    description: "Button label for changing the password",
  },
  account_password_forgot: {
    id: "labels.account.password.forgot",
    defaultMessage: "Forgot Password?",
    description: "Label on link to reset password",
  },
  account_language_tooltip: {
    id: "labels.account.language_tooltip",
    defaultMessage: "Change the language of the user interface.",
    description: "Tooltip text of dropdown to change the UI language",
  },
  account_configuration: {
    id: "labels.account_configuration",
    defaultMessage: "Account Configuration",
    description: "The configuration for the user's account.",
  },
  appearance: {
    id: "labels.appearance",
    defaultMessage: "Appearance",
    description: "Visual appearance and theme settings",
  },
  profile: {
    id: "labels.profile",
    defaultMessage: "Profile",
    description: "User profile settings and information",
  },
  billing: {
    id: "labels.billing",
    defaultMessage: "Billing",
    description: "Billing and payment related settings",
  },
  email_address: {
    id: "labels.email_address",
    defaultMessage: "Email Address",
    description: "e.g. a label in a form for the email address field",
  },
  editor: {
    id: "labels.editor",
    defaultMessage: "Editor",
    description: "Code editor settings and preferences",
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
    description: 'task is one of "start", "restart", "stop"',
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
    description: "Label on a button, where a file upload can be initiated",
  },
  upload_tooltip: {
    id: "labels.upload_tooltip",
    defaultMessage:
      "Upload files from your computer into this project's directory",
    description: "Tooltip for a button, where a file upload can be initiated",
  },
  preferences: { id: "labels.preferences", defaultMessage: "Preferences" },
  purchases: { id: "labels.purchases", defaultMessage: "Purchases" },
  subscriptions: {
    id: "labels.subscriptions",
    defaultMessage: "Subscriptions",
  },
  statements: {
    id: "labels.statements",
    defaultMessage: "Statements",
    description: "Billing statements",
  },
  license: {
    id: "labels.license",
    defaultMessage: "License",
    description:
      "A license is part of a subscription or a one-time purchase to upgrade projects",
  },
  licenses: {
    id: "labels.licenses",
    defaultMessage: "Licenses",
    description:
      "A license is part of a subscription or a one-time purchase to upgrade projects",
  },
  status: {
    id: "labels.status",
    defaultMessage: "Status",
  },
  state: {
    id: "labels.state",
    defaultMessage: "State",
    description: "The state some object is in, e.g. running, stopped, ...",
  },
  published_files: {
    id: "labels.published_files",
    defaultMessage: "Published",
  },
  upgrades: {
    id: "labels.upgrades",
    defaultMessage: "Upgrades",
    description: "Upgrades for specific projects",
  },
  loading: {
    id: "labels.loading",
    defaultMessage: "Loading...",
    description:
      "The UI tells the user to wait, until a some information is available",
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
  new_tooltip: {
    id: "labels.new.file.tooltip",
    defaultMessage: "Create a new file",
    description: "A new file in a file-system",
  },
  pages: {
    id: "labels.pages",
    defaultMessage: "Pages",
    description: "Pages in a document",
  },
  pay_as_you_go: {
    id: "labels.pay_as_you_go",
    defaultMessage: "Pay As You Go",
    description: "Pay-as-you-go billing option",
  },
  payment_methods: {
    id: "labels.payment_methods",
    defaultMessage: "Payment Methods",
    description: "Payment methods management",
  },
  payments: {
    id: "labels.payments",
    defaultMessage: "Payments",
    description: "Payment history and transactions",
  },
  settings: {
    id: "labels.settings",
    defaultMessage: "Settings",
    description: "On a button to show the configuration settings",
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
  save_changes: {
    id: "labels.save_changes",
    defaultMessage: "Save changes",
    description: "A short label on a button to save changes made to a setting",
  },
  save_title: {
    id: "labels.save_title",
    defaultMessage: "Save this file to disk",
    description:
      "In the context of saving files, this is the tooltip on a menu item or on a button",
  },
  not_implemented: {
    id: "labels.not_implemented",
    defaultMessage: "not implemented",
    description: "A feature has not been implemented yet.",
  },
  split_frame_vertically_title: {
    id: "labels.split_frame_vertically.title",
    defaultMessage: "Split Vertically",
    description: "Split frame vertically into two columns",
  },
  split_frame_horizontally_title: {
    id: "labels.split_frame_horizontally.title",
    defaultMessage: "Split Horizontally",
    description: "Split frame horizontally",
  },
  assistant: {
    id: "labels.assistant",
    defaultMessage: "Assistant",
    description: "The button to engage with the AI Assistant dialog",
  },
  timetravel: {
    id: "labels.timetravel",
    defaultMessage: "TimeTravel",
    description:
      "Open the 'TimeTravel' history of the current document. It records all changes of that file over time.",
  },
  timetravel_title: {
    id: "labels.timetravel_title",
    defaultMessage: "Show complete editing history of this document",
  },
  terminal: {
    id: "labels.terminal",
    defaultMessage: "Terminal",
    description: "Title of the Linux Terminal frame",
  },
  admin: {
    id: "labels.admin",
    defaultMessage: "Admin",
  },
  notifications: {
    id: "labels.notifications",
    defaultMessage: "Notifications",
  },
  snippets: {
    id: "labels.snippets",
    defaultMessage: "Snippets",
    description: "Short label for opening the 'Snippets' frame",
  },
  overview: {
    id: "labels.overview",
    defaultMessage: "Overview",
  },
  zoom_in: {
    id: "labels.zoom_in",
    defaultMessage: "Zoom in",
  },
  zoom_out: {
    id: "labels.zoom_out",
    defaultMessage: "Zoom out",
  },
  zoom_in_short: {
    id: "labels.zoom_in_short",
    defaultMessage: "In",
    description: "Short label on a button for zooming in",
  },
  zoom_out_short: {
    id: "labels.zoom_out_short",
    defaultMessage: "Out",
    description: "Short label on a button for zooming out",
  },
  width: {
    id: "labels.width",
    defaultMessage: "Width",
  },
  height: {
    id: "labels.height",
    defaultMessage: "Height",
  },
  reload: {
    id: "labels.reload",
    defaultMessage: "Reload",
  },
  remove: { id: "labels.remove", defaultMessage: "Remove" },
  cut: { id: "labels.cut", defaultMessage: "Cut" },
  copy: { id: "labels.copy", defaultMessage: "Copy" },
  undo: { id: "labels.undo", defaultMessage: "Undo" },
  paste: { id: "labels.paste", defaultMessage: "Paste" },
  redo: { id: "labels.redo", defaultMessage: "Redo" },
  reload_title: {
    id: "labels.reload_title",
    defaultMessage: "Reload this document",
  },
  ai_generate_label: {
    id: "labels.ai_generate_label",
    defaultMessage: "Help me write...",
    description:
      "Label on the menu entry to open the AI Assistant for generating documents",
  },
  ai_generate_title: {
    id: "labels.ai_generate_title",
    defaultMessage: "Create a new file with the help of AI",
    description:
      "Tooltip on the menu entry to open the AI Assistant for generating documents",
  },
  ai: {
    id: "labels.ai",
    defaultMessage: "AI",
    description: "Artificial Intelligence short abbreviation",
  },
  stop: {
    id: "labels.stop",
    defaultMessage: "Stop",
    description: "Label on a button to stop an ongoing process",
  },
  restart: {
    id: "labels.restart",
    defaultMessage: "Restart",
    description:
      "Label on a button to restart a job, or Jupyter Notebook kernel, etc.",
  },
  validate: {
    id: "labels.validate",
    defaultMessage: "Validate",
  },
  clear: {
    id: "labels.clear",
    defaultMessage: "Clear",
    description: "Clean or clear something out, such that it empty",
  },
  word_count: {
    id: "labels.word_count",
    defaultMessage: "Word Count",
    description: "Tool to count words in a document",
  },
  latex_document: {
    id: "labels.latex_document",
    defaultMessage: "LaTeX Document",
    description:
      "Indicating a LaTeX Documents on a button label or frame title",
  },
  sagemath_worksheet: {
    id: "labels.sagemath_worksheet",
    defaultMessage: "SageMath Worksheet",
    description: "A SageMath Worksheet label on a button or frame title",
  },
  linux_terminal: {
    id: "labels.linux_terminal",
    defaultMessage: "Linux Terminal",
    description: "On a label or frame title describing a Linux Terminal",
  },
  line_numbers: {
    id: "labels.line_numbers",
    defaultMessage: "Line Numbers",
    description: "Show or toggle line numbers in a code file",
  },
  code_folding: {
    id: "labels.code_folding",
    defaultMessage: "Code Folding",
    description: "Hide sections in a source code file",
  },
  slideshow: {
    id: "labels.slideshow",
    defaultMessage: "Slideshow",
  },
  insert: {
    id: "labels.insert",
    defaultMessage: "Insert",
  },
  refresh: {
    id: "labels.refresh",
    defaultMessage: "Refresh",
  },
  print: {
    id: "labels.print",
    defaultMessage: "Print",
  },
  new_dots: {
    id: "labels.new_dots",
    defaultMessage: "New...",
  },
  documentation: {
    id: "labels.documentation",
    defaultMessage: "Documentation",
  },
  buttons: {
    id: "labels.buttons",
    defaultMessage: "Buttons",
  },
  explorer: {
    id: "labels.explorer",
    defaultMessage: "Explorer",
    description: "a short label for showing a file explorer",
  },
  log: {
    id: "labels.log",
    defaultMessage: "Log",
    description: "a short label for showing a chronological log of activities",
  },
  x11_desktop: {
    id: "labels.x11_desktop",
    defaultMessage: "Graphical X11 Desktop",
    description:
      "Short label of a button to create an emulated X11 desktop environment",
  },
  chatroom: {
    id: "labels.chatroom",
    defaultMessage: "Chatroom",
  },
  tabs: {
    id: "labels.tabs",
    defaultMessage: "Tabs",
    description: "a short label to show tabs of open files in the UI",
  },
  collabs_info: {
    id: "labels.project.page.project-collaborators.info",
    defaultMessage:
      "Collaborators are other users, who can access this project. They can view and edit the same files as you.",
  },
  collaborators: {
    id: "labels.collaborators",
    defaultMessage: "Collaborators",
    description: "Collaborators (people) on a project, working together",
  },
  chat: {
    id: "labels.chat",
    defaultMessage: "Chat",
    description: "Short label on a button to open a chatroom",
  },
  created: {
    id: "labels.created",
    defaultMessage: "Created",
    description: "Short label for a field, which shows the creation date",
  },
  about: {
    id: "labels.about",
    defaultMessage: "About",
    description:
      "Title on a section or label on a button to show information 'about' something.",
  },
  users: {
    id: "labels.users",
    defaultMessage: "Users",
    description:
      "Short label of a table, which shows the list of users having access",
  },
  project_info_title: {
    id: "labels.project_info_title",
    defaultMessage: "Processes",
    description:
      "Short label of the panel, to show running processes in this project",
  },
  recent: {
    id: "labels.recent",
    defaultMessage: "Recent",
    description: "Something that happened recently",
  },
  recent_files: {
    id: "labels.recent_files",
    defaultMessage: "Recent Files",
    description: "Recently opened or edited files",
  },
  files: {
    id: "labels.files",
    defaultMessage: "Files",
    description: "Files in a directory in a file-explorer",
  },
  activity: {
    id: "labels.activity",
    defaultMessage: "Activity",
    description: "Recent activity",
  },
  hidden_files: {
    id: "labels.hidden_files",
    defaultMessage:
      "{hidden, select, true {Hide hidden files} other {Show hidden files}}. Hidden files in Linux start with a '.' in their filename. They are usually not meant to be edited.",
    description: "show/hide hidden files in a file-explorer in a UI",
  },
  masked_files: {
    id: "labels.masked_files",
    defaultMessage:
      "{masked, select, true {Hide masked files} other {Show masked files}}. Masked files are autogenerated or temporary files, which are not meant to be edited. They are grayed out.",
    description: "show/hide masked files in a file-explorer in a UI.",
  },
  folder: {
    id: "labels.folder",
    defaultMessage: "folder",
    description: "a folder organizing files in a file-system",
  },
  download: {
    id: "labels.download",
    defaultMessage: "download",
    description: "download a file from the web",
  },
  videos: {
    id: "labels.videos",
    defaultMessage: "Videos",
  },
  search: {
    id: "labels.search",
    defaultMessage: "Search",
  },
  close: {
    id: "labels.close",
    defaultMessage: "Close",
  },
  dismiss: {
    id: "labels.dismiss",
    defaultMessage: "Dismiss",
    description: "Short label on a button to dismiss a dialog or modal",
  },
  guide: {
    id: "labels.guide",
    defaultMessage: "Guide",
  },
  select: {
    id: "labels.select",
    defaultMessage: "Select",
    description:
      "Short label on a button in a dialog, to confirm a 'selection'.",
  },
  select_a_kernel: {
    id: "labels.select_a_kernel",
    defaultMessage: "Select a Kernel",
    description: "A kernel in a Jupyter Notebook",
  },
  invited: {
    id: "labels.invited",
    defaultMessage: "invited",
    description: "A user of an online service has been invited",
  },
  ready: {
    id: "labels.ready",
    defaultMessage: "Ready",
  },
  halt: {
    id: "labels.halt",
    defaultMessage: "Halt",
    description: "Short label on a button to halt or stop something",
  },
  deleted: {
    id: "labels.deleted",
    defaultMessage: "deleted",
    description: "a file has been deleted",
  },
  delete: {
    id: "labels.delete",
    defaultMessage: "Delete",
  },
  undelete: {
    id: "labels.undelete",
    defaultMessage: "Undelete",
    comment: "Short label on a button, to undo a deletion",
  },
  delete_forever: {
    id: "labels.delete_forever",
    defaultMessage: "Delete Forever",
    comment: "Short label on a button, to delete an item forever",
  },
  communication: {
    id: "labels.communication",
    defaultMessage: "Communication",
    description:
      "How communication happens, showing banners, sending messages, etc.",
  },
  browser: {
    id: "labels.browser",
    defaultMessage: "Browser",
    description: "Web browser settings and performance",
  },
  file_explorer: {
    id: "labels.file_explorer",
    defaultMessage: "File Explorer",
    description: "File browser and file management interface",
  },
  theme: {
    id: "labels.theme",
    defaultMessage: "Theme",
    description: "Visual UI theme of the application",
  },
  downloaded: {
    id: "labels.downloaded",
    defaultMessage: "downloaded",
    description: "a file has been downloaded",
  },
  moved: {
    id: "labels.moved",
    defaultMessage: "moved",
    description: "a file has been moved",
  },
  renamed: {
    id: "labels.renamed",
    defaultMessage: "renamed",
    description: "a file has been renamed",
  },
  copied: {
    id: "labels.copied",
    defaultMessage: "copied",
    description: "a file has been copied",
  },
  shared: {
    id: "labels.shared",
    defaultMessage: "shared",
    description: "a file has been shared",
  },
  uploaded: {
    id: "labels.uploaded",
    defaultMessage: "uploaded",
    description: "a file has been uploaded",
  },
  created_file: {
    id: "labels.created_file",
    defaultMessage: "created",
    description: "a file has been created",
  },
  connecting: {
    id: "labels.connecting",
    defaultMessage: "Connecting",
    description:
      "Short label, telling the user a connecting is about to be established.",
  },
  disconnected: {
    id: "labels.disconnected",
    defaultMessage: "Disconnected",
    description:
      "Short label, telling the user a possible connection has not been established.",
  },
  connection: {
    id: "labels.connection",
    defaultMessage: "Connection",
  },
  terminal_command: {
    id: "labels.terminal_command",
    defaultMessage: "Terminal command",
    description:
      "Short label/placeholder for entering a Linux Terminal command in a text box",
  },
  language: {
    id: "labels.language",
    defaultMessage: "Language",
  },
  always_running: {
    id: "labels.always_running",
    defaultMessage: "Always Running",
  },
  idle_timeout: {
    id: "labels.idle_timeout",
    defaultMessage: "Idle Timeout",
  },
  uptime: {
    id: "labels.uptime",
    defaultMessage: "Uptime",
  },
  more_info: {
    id: "labels.more_info",
    defaultMessage: "More info",
    description: "Short label for showing 'more information' about something",
  },
  message_plural: {
    id: "labels.message.plural",
    defaultMessage: "{num, plural, one {Message} other {Messages}}",
  },
  reconnect: {
    id: "labels.reconnect",
    defaultMessage: "Reconnect",
  },
  color: {
    id: "labels.color",
    defaultMessage: "Color",
  },
  config: {
    id: "labels.config",
    defaultMessage: "Config",
  },
  configuration: {
    id: "labels.configuration",
    defaultMessage: "Configuration",
  },
  configuration_short: {
    id: "labels.configuration.short",
    defaultMessage: "Config",
  },
  title: {
    id: "labels.title",
    defaultMessage: "Title",
  },
  invite: {
    id: "labels.invite",
    defaultMessage: "Invite",
  },
  limit: {
    id: "labels.limit",
    defaultMessage: "Limit",
  },
  restrict: {
    id: "labels.restrict",
    defaultMessage: "Restrict",
  },
  change: {
    id: "labels.change",
    defaultMessage: "Change",
  },
  nbgrader: {
    id: "labels.nbgrader",
    defaultMessage: "nbgrader",
  },
  name: { id: "labels.name", defaultMessage: "Name" },
  description: { id: "labels.description", defaultMessage: "Description" },
  no_description: {
    id: "labels.no_description",
    defaultMessage: "no description",
  },
  software: {
    id: "labels.software",
    defaultMessage: "Software",
  },
  software_environment: {
    id: "labels.software_environment",
    defaultMessage: "Software Environment",
  },
  cloud_storage_remote_filesystems: {
    id: "labels.cloud_storage_remote_filesystems",
    defaultMessage: "Cloud Storage & Remote File Systems",
  },
  environment: {
    id: "labels.environment",
    defaultMessage: "Environment",
  },
  start_all: {
    id: "labels.start_all",
    defaultMessage: "Start All",
  },
  reconfigure: {
    id: "labels.reconfigure",
    defaultMessage: "Reconfigure",
  },
  invites: {
    id: "labels.invites",
    defaultMessage: "Invites",
  },
  trash: {
    id: "labels.trash",
    defaultMessage: "Trash",
  },
  empty_trash: { id: "labels.empty_trash", defaultMessage: "Empty Trash" },
  draft: {
    id: "labels.draft",
    defaultMessage: "Draft",
  },
  drafts: {
    id: "labels.drafts",
    defaultMessage: "Drafts",
  },
  keyboard: {
    id: "labels.keyboard",
    defaultMessage: "Keyboard",
    description: "Keyboard settings and shortcuts",
  },
  keyboard_shortcuts: {
    id: "labels.keyboard_shortcuts",
    defaultMessage: "Keyboard shortcuts",
  },
  ssh_and_api_keys: {
    id: "labels.keys",
    defaultMessage: "API & SSH Keys",
    description: "API keys and SSH keys management",
  },
  terms_of_service: {
    id: "labels.terms_of_service",
    defaultMessage: "Terms of Service",
  },
  last_active: {
    id: "labels.last_active",
    defaultMessage: "Last Active",
  },
  last_edited: {
    id: "labels.last_edited",
    defaultMessage: "Last Edited",
  },
  project_status: {
    id: "labels.project_status",
    defaultMessage: "Project Status",
  },
  you: {
    id: "labels.you",
    defaultMessage: "You",
    description:
      "Single word. Referring to the user of this application, i.e. 'you' is the person the given message talks to",
  },
  open: {
    id: "labels.open",
    defaultMessage: "Open",
  },
  item_plural: {
    id: "labels.item_plural",
    defaultMessage: `{total, plural, one {item} other {items}}`,
    description: "e.g. zero, one, or more items in a listing",
  },
  starred: {
    id: "labels.starred",
    defaultMessage: "Starred",
    description: "Items marked with a star",
  },
  back: {
    id: "labels.back",
    defaultMessage: "Back",
    description: "Button label to navigate back",
  },
  messages_title: {
    id: "labels.messages.title",
    defaultMessage: "Messages, Mentions and News",
    description:
      "Title of the panel where user messages, messages about a user being mentioned, and general news of the platform are shown",
  },
  messages: {
    id: "labels.messages",
    defaultMessage: "Messages",
  },
  messages_inbox: {
    id: "labels.messages.inbox",
    defaultMessage: "Inbox",
    description: "Inbox where all incoming messages are",
  },
  messages_sent: {
    id: "labels.messages.sent",
    defaultMessage: "Sent",
    description: "All sent messages are here",
  },
  messages_all_messages: {
    id: "labels.messages.all_messages",
    defaultMessage: "All Messages",
    description: "All messages are here",
  },
  messages_archive: {
    id: "labels.messages.archive",
    defaultMessage: "Archive",
    description: "Short labels on a button, to archive a message",
  },
  messages_read: {
    id: "labels.messages.read",
    defaultMessage: "Read",
    description: "Short labels on a button, to mark a message read",
  },
  messages_unread: {
    id: "labels.messages.unread",
    defaultMessage: "Unread",
    description: "Short labels on a button, to mark a message unread",
  },
  messages_to_inbox: {
    id: "labels.messages.to_inbox",
    defaultMessage: "To Inbox",
    description: "Short labels on a button, to move a message into the inbox",
  },
  messages_body: {
    id: "labels.messages.body",
    defaultMessage: "Body",
    description: "Text of the message",
  },
  messages_to: {
    id: "labels.messages.to",
    defaultMessage: "To",
    description: "Where to send the message to",
  },
  messages_subject: {
    id: "labels.messages.subject",
    defaultMessage: "Subject",
    description: "Subject line of the message",
  },
  increase_font_size: {
    id: "labels.increase_font_size",
    defaultMessage: "Increase font size.",
  },
  decrease_font_size: {
    id: "labels.decrease_font_size",
    defaultMessage: "Decrease font size.",
  },
  n_of_m: {
    id: "labels.n_of_m",
    defaultMessage: "{n} of {m}",
    description: "item n in a list of m items.",
  },
  balance: {
    id: "labels.balance",
    defaultMessage: "Balance",
    description: "Short label for a monetary balance on an account",
  },
  previous_page: {
    id: "labels.previous_page",
    defaultMessage: "Previous Page",
    description: "Navigate to previous page in a document",
  },
  next_page: {
    id: "labels.next_page",
    defaultMessage: "Next Page",
    description: "Navigate to next page in a document",
  },
});

export const menu = defineMessages({
  pause_resume: {
    id: "menu.terminal.pause_resume",
    defaultMessage: "{pause, select, true {Resume} other {Pause}}",
  },
  file: {
    id: "menu.generic.file.label",
    defaultMessage: "File",
  },
  open: {
    id: "menu.generic.open_file.label",
    defaultMessage: "Open...",
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
  close_and_halt_title: {
    id: "menu.generic.close_and_halt.title",
    defaultMessage: "Halt backend server and close this file.",
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
    defaultMessage: "Force Resize",
  },
  kick_other_users_out_button: {
    id: "menu.generic.kick_other_users_out.button",
    defaultMessage: "Resize",
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
  remove_all_buttons: {
    id: "menu.generic.button_bar.disable.label",
    defaultMessage: "Remove All Buttons",
  },
  reset_toolbar_button_default: {
    id: "menu.generic.reset_toolbar_button_default",
    defaultMessage: "Reset Toolbar to Default",
  },
});

export const editor = defineMessages({
  snippets_label: {
    id: "editor.snippets.label",
    defaultMessage: "Snippets",
  },
  snippets_tooltip: {
    id: "editor.snippets.tooltip",
    defaultMessage: "Open a panel containing code snippets.",
  },
  table_of_contents_short: {
    id: "editor.table_of_contents.short",
    defaultMessage: "Contents",
    description: "Short for Table of Contents",
  },
  table_of_contents_name: {
    id: "editor.table_of_contents.name",
    defaultMessage: "Table of Contents",
  },
  terminal_cmd_help_title: {
    id: "editor.terminal.cmd.help.title",
    defaultMessage:
      "Show documentation for using the Linux Terminal in CoCalc.",
  },
  build_control_and_log_title: {
    id: "editor.build_control_and_log.title",
    defaultMessage: "Build Control and Log",
  },
  build_control_and_log_title_short: {
    id: "editor.build_control_and_log.title.short",
    defaultMessage: "Build",
  },
  errors_and_warnings_title_short: {
    id: "editor.errors_and_warning.title.short",
    defaultMessage: "Problems", // common term for Errors and Warnings
  },
  errors_and_warnings_title: {
    id: "editor.errors_and_warning.title",
    defaultMessage: "Errors and Warnings",
  },
  pdfjs_canvas_title_short: {
    id: "editor.pdfjs_canvas.title.short",
    defaultMessage: "PDF (preview)",
  },
  pdfjs_canvas_title: {
    id: "editor.pdfjs_canvas.title",
    defaultMessage: "PDF - Preview",
  },
  pdf_embed_title_short: {
    id: "editor.latex.pdf_embed.title.short",
    defaultMessage: "PDF (native)",
  },
  pdf_embed_title: {
    id: "editor.latex.pdf_embed.title",
    defaultMessage: "PDF - Native",
  },
  toggle_pdf_dark_mode_title: {
    id: "editor.toggle_pdf_dark_mode.title",
    defaultMessage: "Toggle dark mode of PDF off, to see the original file",
  },
  toggle_pdf_dark_mode_label: {
    id: "editor.toggle_pdf_dark_mode.label",
    defaultMessage: "Toggle PDF Dark Mode",
  },
  latex_source_code_label_name: {
    id: "editor.latex.source_code.name",
    defaultMessage: "LaTeX Source Code",
    description: "Name of a LaTeX document editor",
  },
  latex_source_code_label_short: {
    id: "editor.latex.source_code.short",
    defaultMessage: "Source",
    description: "Name of a LaTeX source document editor",
  },
  latex_command_print_label: {
    id: "editor.latex.command.print.label",
    defaultMessage: "Print LaTeX Source",
  },
  latex_command_print_tooltip: {
    id: "editor.latex.command.print.tooltip",
    defaultMessage:
      "Print the source code of this document.  Use Print from the PDF Preview frame to print the rendered document.",
  },
  latex_cm_title_short: {
    id: "editor.latex.cm.title.short",
    defaultMessage: "Source",
  },
  latex_cm_title: {
    id: "editor.latex.cm.title",
    defaultMessage: "LaTeX Source Code",
  },
  editor_settings: {
    id: "editor.editor_settings",
    defaultMessage: "Editor Settings",
    description: "The name of the editor settings frame",
  },
  guide_tooltip: {
    id: "editor.guide_tooltip",
    defaultMessage:
      "Tool for creating, testing, and learning about Linux Terminal commands.",
  },
  clear_terminal_popconfirm_title: {
    id: "editor.clear_terminal_popconfirm_title",
    defaultMessage: "Clear this Terminal?",
  },
  clear_terminal_tooltip: {
    id: "editor.clear_terminal_tooltip",
    defaultMessage:
      "Clearing this Linux Terminal frame terminates running programs, respawns the shell, and cleans up the display buffer.",
  },
  clear_terminal_popconfirm_confirm: {
    id: "editor.clear_terminal_popconfirm_confirm",
    defaultMessage: "Yes, clean up!",
  },
});

export const jupyter = {
  editor: defineMessages({
    nbgrader_minimal_stubs: {
      id: "jupyter.editor.nbgrader.actions.confirm_assign.minimal_stubs",
      defaultMessage: "Generate with minimal stubs",
    },
    nbgrader_create_title: {
      id: "jupyter.editor.nbgrader.actions.confirm_assign.title",
      defaultMessage:
        "Generate Student Version{full, select, true { of Jupyter Notebook} other {}}",
    },
    nbgrader_create_body: {
      id: "jupyter.editor.nbgrader.actions.confirm_assign.body",
      defaultMessage: `Generating the student version of the Jupyter Notebook will create a new Jupyter Notebook "{target}"
        that is ready to distribute to your students.
        This process locks cells and writes metadata so parts of the notebook can't be accidentally edited or deleted;
        it removes solutions, and replaces them with code or text stubs saying (for example) "YOUR ANSWER HERE";
        and it clears all outputs.
        Once done, you can easily inspect the resulting notebook to make sure everything looks right.
        (This is analogous to 'nbgrader assign'.)
        The CoCalc course management system will *only* copy the {STUDENT_SUBDIR} subdirectory
        that contains this generated notebook to students.`,
    },
    snippets_tooltip: {
      id: "jupyter.editor.snippets_tooltip",
      defaultMessage: "Open a panel containing code snippets.",
    },
    run_all_cells: {
      id: "jupyter.editor.run_all_cells.label",
      defaultMessage: "Run All Cells",
      description: "Run all cells in a Jupyter Notebook ",
    },
    run_selected_cells: {
      id: "jupyter.editor.run_selected_cells.label",
      defaultMessage: "Run Selected Cells",
      description: "Run selected cells in a Jupyter Notebook",
    },
    console_label: {
      id: "jupyter.editor.console_label",
      defaultMessage: "Jupyter Console",
    },
    console_title: {
      id: "jupyter.editor.console_title",
      defaultMessage:
        "Open the Jupyter command line console connected to the running kernel.",
    },
    browser_actions_trust_title: {
      id: "jupyter.editor.browser_actions.trust.title",
      defaultMessage: "Trust this Notebook?",
      description: "For a specific Jupyter Notebook",
    },
    browser_actions_trust_body: {
      id: "jupyter.editor.browser_actions.trust.body",
      defaultMessage:
        "A trusted Jupyter notebook may execute hidden Javascript code or carry out other attacks via malicious HTML.  Selecting trust below, or evaluating any cell, will disable the code that strips dangerous HTML from this notebook. (NOTE: CoCalc does NOT implement the official Jupyter security model for trusted notebooks; in particular, we assume that you do trust collaborators on your CoCalc projects. Also, in many cases we still do not execute Javascript in HTML, even if the notebook is trusted.)",
    },
    close_and_halt_label: {
      id: "jupyter.editor.browser_actions.close_and_halt.label",
      defaultMessage: "Close and halt",
    },
    close_and_halt_body: {
      id: "jupyter.editor.browser_actions.close_and_halt.body",
      defaultMessage:
        "Are you sure you want to close this file and halt the kernel?  All variable state will be lost.",
    },
    restart_and_run_all_title: {
      id: "jupyter.editor.restart_and_run_all.title",
      defaultMessage: "Restart kernel and run notebook",
      description: "For a Jupyter Notebook",
    },
    restart_and_run_all_body: {
      id: "jupyter.editor.restart_and_run_all.body",
      defaultMessage:
        "Are you sure you want to restart the kernel and run the notebook?  All variable state and output will be reset, though past output is available in TimeTravel.",
      description: "For a Jupyter Notebook",
    },
    restart_and_run_all_stop: {
      id: "jupyter.editor.restart_and_run_all.stop",
      defaultMessage: "Run all (stop on first error)",
      description: "In a Jupyter Notebook, running all cells after a restart",
    },
    restart_and_run_all_nostop: {
      id: "jupyter.editor.restart_and_run_all.nostop",
      defaultMessage: "Run all (do not stop on errors)",
      description: "In a Jupyter Notebook, running all cells after a restart",
    },
    restart_and_run_all_no_halt_label: {
      id: "jupyter.editor.restart_and_run_all_no_halt.label",
      defaultMessage: "Restart and run all",
      description: "Button label for restarting a Jupyter Notebook",
    },
    restart_and_run_all_no_halt_title: {
      id: "jupyter.editor.restart_and_run_all_no_halt.title",
      defaultMessage:
        "Restart kernel and run all cells (do not stop on errors)",
      description: "Description for restarting a Jupyter Notebook",
    },
    restart_and_run_all_no_halt_body: {
      id: "jupyter.editor.restart_and_run_all_no_halt.body",
      defaultMessage:
        "Are you sure you want to restart the kernel and re-execute all cells?  All variable state and output will be reset, though past output is available in TimeTravel.",
      description: "Description for restarting a Jupyter Notebook",
    },
    confirm_restart_label: {
      id: "jupyter.editor.confirm_restart.label",
      defaultMessage: "Restart",
    },
    confirm_restart_continue_label: {
      id: "jupyter.editor.confirm_restart.continue_label",
      defaultMessage: "Continue running",
      description:
        "Continue working with the Jupyter Notebook, not restarting Kernel",
    },
    confirm_restart_title: {
      id: "jupyter.editor.confirm_restart.title",
      defaultMessage: "Restart kernel?",
    },
    confirm_restart_body: {
      id: "jupyter.editor.confirm_restart.body",
      defaultMessage:
        "Do you want to restart the kernel? All variable values will be lost.  If you are restarted to detect a new package, restart *twice* due to the kernel pool.",
    },
    confirm_halt_kernel_title: {
      id: "jupyter.editor.confirm_halt_kernel.title",
      defaultMessage: "Halt kernel?",
    },
    confirm_halt_kernel_body: {
      id: "jupyter.editor.confirm_halt_kernel.body",
      defaultMessage:
        "Do you want to kill the running kernel?  All variable values will be lost.  The kernel will only start if you try to evaluate some code.",
    },
    confirm_halt_kernel_continue: {
      id: "jupyter.editor.confirm_halt_kernel.continue",
      defaultMessage: "Continue running",
    },
    confirm_halt_kernel_halt: {
      id: "jupyter.editor.confirm_halt_kernel.halt",
      defaultMessage: "Halt",
    },
    raw_json_editor_title: {
      id: "jupyter.editor.raw_json_editor.title",
      defaultMessage: "Raw JSON editor",
    },
    raw_json_editor_short: {
      id: "jupyter.editor.raw_json_editor.short",
      defaultMessage: "JSON edit",
    },
    raw_json_view_title: {
      id: "jupyter.editor.raw_json_view.title",
      defaultMessage: "Raw JSON viewer",
    },
    raw_json_view_short: {
      id: "jupyter.editor.raw_json_view.short",
      defaultMessage: "JSON view",
    },
    introspect_short: {
      id: "jupyter.editor.introspect.short",
      defaultMessage: "Introspect",
    },
    introspect_title: {
      id: "jupyter.editor.introspect.title",
      defaultMessage: "Introspection",
    },
  }),
  commands: defineMessages({
    insert_cell_above: {
      id: "jupyter.commands.insert_cell_above",
      defaultMessage: "Insert Cell Above",
    },
    insert_cell_below: {
      id: "jupyter.commands.insert_cell_below",
      defaultMessage: "Insert Cell Below",
    },
    enter_command_mode: {
      id: "jupyter.commands.enter_command_mode",
      defaultMessage: "Enter command mode",
    },
    enter_edit_mode: {
      id: "jupyter.commands.enter_edit_mode",
      defaultMessage: "Enter edit mode",
    },
    toggle_all_line_numbers: {
      id: "jupyter.commands.toggle_all_line_numbers",
      defaultMessage: "Toggle Line Numbers of All Cells",
    },
    toggle_cell_line_numbers: {
      id: "jupyter.commands.toggle_cell_line_numbers",
      defaultMessage: "Toggle Line Numbers of Selected Cells",
    },
    change_kernel: {
      id: "jupyter.commands.change_kernel",
      defaultMessage: "Change Kernel...",
      description: "Change the Kernel in the Jupyter Notebook",
    },
    close_and_halt_menu: {
      id: "jupyter.commands.close_and_halt.menu",
      defaultMessage: "Close and halt",
      description: "Close and halt the Kernel and Jupyter Notebook",
    },
    change_kernel_title: {
      id: "jupyter.commands.change_kernel_title",
      defaultMessage: "Select from any of the available kernels.",
      description:
        "Tooltip description for changing the Kernel in the Jupyter Notebook",
    },
    cell_toolbar_none: {
      id: "jupyter.commands.cell_toolbar_none",
      defaultMessage: "No cell toolbar",
      description: "Jupyter Notebook cell toolbar 'None' hides the toolbar",
    },
    cell_toolbar_none_menu: {
      id: "jupyter.commands.cell_toolbar_none_menu",
      defaultMessage: "None",
      description: "Jupyter Notebook cell toolbar 'None' hides the toolbar",
    },
    change_cell_to_code: {
      id: "jupyter.commands.change_cell_to_code.label",
      defaultMessage: "Change Cell to Code",
    },
    change_cell_to_markdown: {
      id: "jupyter.commands.change_cell_to_markdown.label",
      defaultMessage: "Change Cell to Markdown",
      description: "Cell in a Jupyter Notebook",
    },
    change_cell_to_raw: {
      id: "jupyter.commands.change_cell_to_raw.label",
      defaultMessage: "Change Cell to Raw",
      description: "Cell in a Jupyter Notebook",
    },
    restart_kernel_noconf_menu: {
      id: "jupyter.commands.restart_kernel_noconf.menu",
      defaultMessage: "Restart kernel",
      description: "Restart Kernel of a Jupyter Notebook",
    },
    restart_kernel_clear_noconf_menu: {
      id: "jupyter.commands.restart_kernel_clear_noconf.menu",
      defaultMessage: "Restart kernel and clear output",
      description: "Restart Kernel of a Jupyter Notebook and clear all output",
    },
    restart_kernel_label: {
      id: "jupyter.commands.restart_kernel.label",
      defaultMessage: "Restart Kernel...",
      description: "Restart Kernel of a Jupyter Notebook",
    },
    restart_kernel_button: {
      id: "jupyter.commands.restart_kernel.button",
      defaultMessage: "Kernel",
      description: "Restart Kernel of a Jupyter Notebook",
    },
    restart_kernel_run_all_cells: {
      id: "jupyter.commands.restart_kernel_run_all_cells",
      defaultMessage: "Restart and Run All Cells...",
      describe: "In a Jupyter Notebook, restart kernel and run all cells",
    },
    restart_kernel_run_all_cells_button: {
      id: "jupyter.commands.restart_kernel_run_all_cells.button",
      defaultMessage: "Run all...",
      describe: "In a Jupyter Notebook, restart kernel and run all cells",
    },
    restart_kernel_run_all_cells_noconf: {
      id: "jupyter.commands.restart_kernel_run_all_cells_noconf",
      defaultMessage: "Restart Kernel and Run All Cells",
      describe: "In a Jupyter Notebook, restart kernel and run all cells",
    },
    restart_kernel_run_all_cells_noconf_button: {
      id: "jupyter.commands.restart_kernel_run_all_cells_noconf_button",
      defaultMessage: "Run All",
      describe: "In a Jupyter Notebook, restart kernel and run all cells",
    },
    restart_kernel_run_all_cells_menu: {
      id: "jupyter.commands.restart_kernel_run_all_cells_menu",
      defaultMessage: "Run all...",
      describe: "In a Jupyter Notebook, restart kernel and run all cells",
    },
    restart_kernel_run_all_cells_without_halting: {
      id: "jupyter.commands.restart_kernel_run_all_cells_without_halting",
      defaultMessage: "Restart and Run All (do not stop on errors)...",
      describe: "In a Jupyter Notebook, restart kernel and run all cells",
    },
    restart_kernel_clear_output_menu: {
      id: "jupyter.commands.restart_kernel_clear_output.menu",
      defaultMessage: "Restart Kernel and Clear All Outputs...",
      describe: "In a Jupyter Notebook, restart kernel and clear output",
    },
    run_cell_and_insert_below: {
      id: "jupyter.commands.run_cell_and_insert_below",
      defaultMessage: "Run Selected Cells and Insert Below",
      description: "In a Jupyter Notebook",
    },
    run_cell_and_insert_below_title: {
      id: "jupyter.commands.run_cell_and_insert_below_title",
      defaultMessage:
        "Run all cells that are currently selected. Insert a new cell after the last one.",
      description: "In a Jupyter Notebook",
    },
    run_cell: {
      id: "jupyter.commands.run_cell",
      defaultMessage: "Run Selected Cells and Do Not Advance",
      description: "In a Jupyter Notebook",
    },
    run_cell_title: {
      id: "jupyter.commands.run_cell_title",
      defaultMessage:
        "Run all cells that are currently selected. Do not move the selection.",
      description: "In a Jupyter Notebook",
    },
    run_cell_and_select_next: {
      id: "jupyter.commands.run_cell_and_select_next",
      defaultMessage: "Run Selected Cells",
      description: "In a Jupyter Notebook",
    },
    run_current_cell: {
      id: "jupyter.commands.run_current_cell",
      defaultMessage: "Run Current Cell",
    },
    interrupt_kernel: {
      id: "jupyter.commands.interrupt_kernel",
      defaultMessage: "Interrupt Kernel (Stop)",
      description: "In a Jupyter Notebook, interrupt the running kernel",
    },
    shutdown_kernel_button: {
      id: "jupyter.commands.shutdown_kernel.button",
      defaultMessage: "Off",
      description: "In a Jupyter Notebook, turn the running kernel off",
    },
    shutdown_kernel_menu: {
      id: "jupyter.commands.shutdown_kernel.menu.dots",
      defaultMessage: "Shutdown Kernel...",
      description: "In a Jupyter Notebook, turn the running kernel off",
    },
    shutdown_kernel_confirm_title: {
      id: "jupyter.commands.shutdown_kernel.title",
      defaultMessage: "Shutdown kernel?",
      description: "In a Jupyter Notebook",
    },
    shutdown_kernel_confirm_body: {
      id: "jupyter.commands.shutdown_kernel.body",
      defaultMessage:
        "Do you want to shutdown the current kernel? All variable values will be lost.",
      description: "In a Jupyter Notebook",
    },
    shutdown_kernel_confirm_label_shutdown: {
      id: "jupyter.commands.shutdown_kernel.label.shutdown",
      defaultMessage: "Shutdown",
      description: "Shutting down a Kernel of a Jupyter Notebook",
    },
    shutdown_kernel_confirm_label_continue: {
      id: "jupyter.commands.shutdown_kernel.label.continue",
      defaultMessage: "Continue running",
      description: "Continue running the Kernel of a Jupyter Notebook",
    },
    halt_kernel_menu: {
      id: "jupyter.commands.halt_kernel_menu.menu",
      defaultMessage: "Halt kernel...",
      description: "Halting a Kernel of a Jupyter Notebook",
    },
    validate_label: {
      id: "jupyter.commands.validate.label",
      defaultMessage: "Validate",
      description: "Validate a Jupyter Notebook",
    },
    validate_tooltip: {
      id: "jupyter.commands.validate.tooltip",
      defaultMessage:
        "Restart Jupyter Notebook and run all cells to validate that it works.",
      description: "Validate a Jupyter Notebook",
    },
    validate_title: {
      id: "jupyter.commands.validate.title",
      defaultMessage: "Validate notebook?",
      description: "Validate a Jupyter Notebook",
    },
    validate_body: {
      id: "jupyter.commands.validate.body",
      defaultMessage:
        "Validating the notebook will restart the kernel and run all cells in order, even those with errors.  This will ensure that all output is exactly what results from running all cells in order.",
      description: "Validate a Jupyter Notebook",
    },
    refresh_kernels: {
      id: "jupyter.commands.refresh_kernels",
      defaultMessage: "Refresh Kernel List",
      description: "Reload list of all Kernels for Jupyter Notebooks",
    },
    refresh_kernels_tooltip: {
      id: "jupyter.commands.refresh_kernels.tooltip",
      defaultMessage:
        "Reload list of all available Kernels for running Jupyter Notebooks",
    },
    run_all_cells_menu: {
      id: "jupyter.commands.run_all_cells.menu",
      defaultMessage: "Run All Cells",
      description: "Run all cells in a Jupyter Notebook",
    },
    run_all_cells_above_menu: {
      id: "jupyter.commands.run_all_cells_above.menu",
      defaultMessage: "Run All Above Selected Cell",
      description: "Run all cells above selected cell in a Jupyter Notebook",
    },
    run_all_cells_below_menu: {
      id: "jupyter.commands.run_all_cells_below.menu",
      defaultMessage: "Run Selected Cell and All Below",
      description:
        "Run selected cell and all cells below selected cell in a Jupyter Notebook",
    },
    paste_cells_menu: {
      id: "jupyter.commands.paste_cells.menu",
      defaultMessage: "Paste Cells",
      description: "Cells in a Jupyter Notebook",
    },
    paste_cells_above_menu: {
      id: "jupyter.commands.paste_cells_above.menu",
      defaultMessage: "Paste Cells Above",
      description: "Cells in a Jupyter Notebook",
    },
    paste_cells_below_menu: {
      id: "jupyter.commands.paste_cells_below.menu",
      defaultMessage: "Paste Cells Below",
      description: "Cells in a Jupyter Notebook",
    },
    paste_cells_replace_menu: {
      id: "jupyter.commands.paste_cells_replace.menu",
      defaultMessage: "Paste Cells and Replace",
      description: "Cells in a Jupyter Notebook",
    },
    insert_cells_menu: {
      id: "jupyter.commands.insert_cells.menu",
      defaultMessage: "Insert Cell",
      description: "Cells in a Jupyter Notebook",
    },
    delete_cells_menu: {
      id: "jupyter.commands.delete_cells.menu",
      defaultMessage: "Delete Cells",
      description: "Cells in a Jupyter Notebook",
    },
    move_cells_menu: {
      id: "jupyter.commands.move_cells.menu",
      defaultMessage: "Move Cells",
      description: "Cells in a Jupyter Notebook",
    },
    split_and_merge_menu: {
      id: "jupyter.commands.split_and_merge.menu",
      defaultMessage: "Split and Merge",
      description: "Cells in a Jupyter Notebook",
    },
    select_cells_menu: {
      id: "jupyter.commands.select_cells.menu",
      defaultMessage: "Select Cells",
      description: "Cells in a Jupyter Notebook",
    },
    cell_type_menu: {
      id: "jupyter.commands.cell_type.menu",
      defaultMessage: "Cell Type",
      description: "Cells in a Jupyter Notebook",
    },
    clear_output_menu: {
      id: "jupyter.commands.clear_output.menu",
      defaultMessage: "Clear Output",
      description: "Cells in a Jupyter Notebook",
    },
    format_cells_menu: {
      id: "jupyter.commands.format_cells.menu",
      defaultMessage: "Format Cells",
      description: "Cells in a Jupyter Notebook",
    },
    format_cells_menu_button: {
      id: "jupyter.commands.format_cells.menu.button",
      defaultMessage: "Format",
      description: "Cells in a Jupyter Notebook",
    },
    cells_collapse_menu: {
      id: "jupyter.commands.cells_collapse.menu",
      defaultMessage: "Collapse",
      description: "Cells in a Jupyter Notebook",
    },
    cells_expand_menu: {
      id: "jupyter.commands.cells_expand.menu",
      defaultMessage: "Expand",
      description: "Cells in a Jupyter Notebook",
    },
    cells_protect_menu: {
      id: "jupyter.commands.cells_protect.menu",
      defaultMessage: "Protect",
      description: "Cells in a Jupyter Notebook",
    },
    cells_unlock_menu: {
      id: "jupyter.commands.cells_unlock.menu",
      defaultMessage: "Remove Protection",
      description: "Cells in a Jupyter Notebook",
    },
    cells_unlock_menu_button: {
      id: "jupyter.commands.cells_unlock.menu.button",
      defaultMessage: "Unlock",
      description: "Cells in a Jupyter Notebook",
    },
    view_toolbars_menu_button: {
      id: "jupyter.commands.view_toolbars.menu.button",
      defaultMessage: "Toolbars",
    },
    view_toolbars_menu: {
      id: "jupyter.commands.view_toolbars.menu",
      defaultMessage: "Cell Toolbar",
      description: "Cells in a Jupyter Notebook",
    },
    download_as_pdf: {
      id: "jupyter.commands.download_as_pdf",
      defaultMessage: "Save and Export As PDF",
    },
    download_as_html: {
      id: "jupyter.commands.download_as_html",
      defaultMessage: "Save and Export As HTML",
    },
    export_menu: {
      id: "jupyter.commands.export.menu",
      defaultMessage: "Save and Export...",
    },
    nbgrader_assign_menu: {
      id: "jupyter.commands.nbgrader_assign.menu",
      defaultMessage: "Generate student version...",
    },
    nbgrader_assign_button: {
      id: "jupyter.commands.nbgrader_assign.button",
      defaultMessage: "Generate",
    },
    nbgrader_assign_tooltip: {
      id: "jupyter.commands.nbgrader_assign.tooltip",
      defaultMessage:
        "Generate the student version of this document, which strips out the extra instructor tests and cells.",
    },
    nbconvert_slides: {
      id: "jupyter.commands.nbconvert_slides.label",
      defaultMessage: "Slideshow server via nbconvert",
      description: "do not translate 'nbconvert'",
    },
    cut_cells: {
      id: "jupyter.commands.cut_cells.label",
      defaultMessage: "Cut Cells",
      description: "Cells in a Jupyter Notebook",
    },
    copy_cells: {
      id: "jupyter.commands.copy_cells.label",
      defaultMessage: "Copy Cells",
      description: "Cells in a Jupyter Notebook",
    },
    delete_cells: {
      id: "jupyter.commands.delete_cells.label",
      defaultMessage: "Delete Cells",
      description: "Cells in a Jupyter Notebook",
    },
    find_and_replace: {
      id: "jupyter.commands.find_and_replace.label",
      defaultMessage: "Find and Replace",
    },
    delete_all_blank_code_cells: {
      id: "jupyter.commands.delete_all_blank_code_cells.label",
      defaultMessage: "Delete All Blank Code Cells",
    },
    merge_selected_cells_menu: {
      id: "jupyter.commands.merge_cells.menu",
      description: "Cells in a Jupyter Notebook",
      defaultMessage: "Merge Selected Cells",
    },
  }),
};

export const dialogs = defineMessages({
  select_llm: {
    id: "ai-generator.select_llm",
    defaultMessage: "Select language model",
  },
  project_start_warning_title: {
    id: "project-start-warning.title",
    defaultMessage: "Start this project?",
  },
  project_start_warning_content: {
    id: "project-start-warning.content",
    defaultMessage: `You must start the project "{project_title}" before you can {what}. {title}`,
  },
  project_actions_rename_file: {
    id: "project_actions.rename_file.what",
    defaultMessage: `rename {src}`,
  },
  project_open_file_what: {
    id: "project.open_file.what",
    defaultMessage: `open the file "{path}"`,
  },
  project_actions_create_file_what: {
    id: "project_actions.create_file.what",
    defaultMessage: `create the file "{path}"`,
  },
  client_project_exec_msg: {
    id: "client.project.exec.msg",
    defaultMessage: `{blocking, select,
    true {execute the command {arg}}
    other {getting job {arg}}}`,
  },
  client_project_exec_start_first: {
    id: "client.project.exec.start_first",
    defaultMessage: "You must start the project first",
  },
});

export const course = defineMessages({
  actions: {
    id: "course.actions",
    defaultMessage: "Actions",
  },
  shared_project: {
    id: "course.shared_project",
    defaultMessage: "Shared Project",
  },
  student: {
    id: "course.student",
    defaultMessage: "Student",
    description: "a student in an online course",
  },
  students: {
    id: "course.students",
    defaultMessage: "Students",
    description: "students in an online course",
  },
  add_students: {
    id: "course.add_students",
    defaultMessage: "Add Students",
  },
  add_students_tooltip: {
    id: "course.add_students_tooltip",
    defaultMessage: "Add one or more students to this course.",
  },
  show_deleted_students_msg: {
    id: "course.show_deleted_students.msg",
    defaultMessage: `{show, select, true {show} other {hide}}
    {num_deleted} deleted
    {num_deleted, plural, one {student} other {students}}`,
  },
  show_deleted_students_tooltip: {
    id: "course.show_deleted_students.tooltip",
    defaultMessage: `{show, select,
    true {Click here to hide deleted students from the bottom of the list of students.}
    other {Click here to show all deleted students at the bottom of the list.  You can then click on the student and click undelete if necessary.}}`,
  },
  create_shared_project: {
    id: "course.create_shared_project",
    defaultMessage: "Create Shared Project",
  },
  delete_shared_project: {
    id: "course.delete_shared_project",
    defaultMessage: "Delete Shared Project",
  },
  reconfigure_all_projects: {
    id: "course.reconfigure_all_projects",
    defaultMessage: "Reconfigure all Projects",
  },
  export_grades: {
    id: "course.export_grades",
    defaultMessage: "Export Grades",
  },
  grades: {
    id: "course.grades",
    defaultMessage: "Grades",
  },
  resend_invites: {
    id: "course.resend_invites",
    defaultMessage: "Resend Outstanding Email Invites",
  },
  copy_missing_handouts_assignments: {
    id: "course.copy_missing_handouts_assignments",
    defaultMessage: "Copy Missing Handouts and Assignments",
  },
  title_and_description_label: {
    id: "course.commands.title-and-description.label",
    defaultMessage: "Course Title and Description",
    description: "title and description of a course for students.",
  },
  email_invitation_label: {
    id: "course.commands.email-invitation.label",
    defaultMessage: "Email Invitation",
  },
  run_terminal_command_title: {
    id: "course.commands.terminal-command.label",
    defaultMessage: "Run Terminal Command in all Student Projects",
  },
  delete_student_projects: {
    id: "course.commands.delete-student-projects.title",
    defaultMessage: "Delete all Student Projects",
  },
  assign_button: {
    id: "course.assignments.assign.button",
    defaultMessage: "Assign",
    description:
      "Send out files to the given student, they will be copied over to the student project in an online course.",
  },
  add_assignments: {
    id: "course.commands.add-assignments.label",
    defaultMessage: "Add Assignments",
    description: "Adding an assignment in a course",
  },
  assignment: {
    id: "course.assignment",
    defaultMessage: "assignment",
    description:
      "An assignment in an online course. Consisting of files for students to work with.",
  },
  handout: {
    id: "course.handout",
    defaultMessage: "handout",
    description:
      "A handout in an online course. Consisting of files for students to work with.",
  },
  assignments: {
    id: "course.assignments",
    defaultMessage: "Assignments",
    description:
      "Assignments in an online course. Consisting of files for students to work with.",
  },
  handouts: {
    id: "course.handouts",
    defaultMessage: "Handouts",
    description:
      "Handouts in an online course. Consisting of files for students to work with.",
  },
  due_date: {
    id: "course.due_date",
    defaultMessage: "Due Date",
  },
  distribute: {
    id: "course.distribute",
    defaultMessage: "Distribute",
  },
  collaborator_policy: {
    id: "course.commands.collaborator-policy.label",
    defaultMessage: "Collaborator Policy",
  },
  restrict_student_projects: {
    id: "course.commands.restrict-student-projects.label",
    defaultMessage: "Restrict Student Projects",
  },
});
