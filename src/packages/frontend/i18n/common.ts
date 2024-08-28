import { defineMessages } from "react-intl";

export const labels = defineMessages({
  cancel: {
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
  email_address: {
    id: "labels.email_address",
    defaultMessage: "Email address",
    description: "e.g. a label in a form for the email address field",
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
  save_title: {
    id: "labels.save_title",
    defaultMessage: "Save this file to disk",
    description:
      "In the context of saving files, this is the tooltip on a menu item or on a button",
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
  zoom_in: {
    id: "labels.zoom_in",
    defaultMessage: "Zoom in",
  },
  zoom_out: {
    id: "labels.zoom_out",
    defaultMessage: "Zoom out",
  },
  reload: {
    id: "labels.reload",
    defaultMessage: "Reload",
  },
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
      "Label on the menu enty to open the AI Assistant for generating documents",
  },
  ai_generate_title: {
    id: "labels.ai_generate_title",
    defaultMessage: "Create a new file with the help of AI",
    description:
      "Tooltip on the menu enty to open the AI Assistant for generating documents",
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
  editor_settings: {
    id: "editor.editor_settings",
    defaultMessage: "Editor Settings",
    description: "The name of the editor settings frame",
  },
});

export const jupyter = {
  editor: defineMessages({
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
        "Do you want to restart the kernel? All variable values will be lost.",
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
      id: "jupyter.commands.shutdown_kernel.menu",
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
  }),
};
