/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Comprehensive list of Jupyter notebook (version 5) commands
we support and how they work.

See frontend/frame-editors/jupyter-editor/editor.ts for how these are organized into menus.
*/

import type { IconName } from "@cocalc/frontend/components/icon";

import { defineMessage } from "react-intl";

import { redux } from "@cocalc/frontend/app-framework";
import { FORMAT_SOURCE_ICON } from "@cocalc/frontend/frame-editors/frame-tree/config";
import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import {
  editor,
  IntlMessage,
  jupyter,
  labels,
  menu,
} from "@cocalc/frontend/i18n";
import { getIntl } from "@cocalc/frontend/i18n/get-intl";
import { open_new_tab } from "@cocalc/frontend/misc";
import { NotebookMode } from "@cocalc/jupyter/types";
import { JupyterActions } from "./browser-actions";
import {
  COPY_CELL_ICON,
  DELETE_CELL_ICON,
  RUN_ALL_CELLS_ABOVE_ICON,
  RUN_ALL_CELLS_BELOW_ICON,
  SPLIT_CELL_ICON,
} from "./consts";

export const CLEAR_CELL_OUTPUT_LABEL = defineMessage({
  id: "jupyter.cell-buttonbar-menu.clear-output",
  defaultMessage: "Clear Output",
});

export interface KeyboardCommand {
  mode?: NotebookMode;
  which: number;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  twice?: boolean;
  meta?: boolean;
  key?: string;
  // TODO: key is currently only used for displaying what the shortcut is; however,
  // "which" is deprecated and we should switch to using only key.
  // However, key is also tricky, e.g., key for shift+h is an upper case "H", but
  // if you just hit h it is lower case "h", so you can't just switch to using event.key.
  // See https://github.com/sagemathinc/cocalc/issues/4020
}

export interface CommandDescription {
  m: string | IntlMessage; // m=menu = fuller description for use in menus and commands
  f: Function; // function that implements command.
  b?: string | IntlMessage; // very short label; use for a button
  i?: IconName;
  ir?: "90"; // rotate icon
  k?: KeyboardCommand[]; // keyboard commands
  t?: string | IntlMessage; // t=title = much longer description for tooltip
  menu?: string | IntlMessage; // alternative to m just for dropdown menu
  d?: string; // even more extensive description (e.g., for a tooltip).
  r?: boolean; // if set, this is a read only safe command
}

export interface AllActions {
  jupyter_actions?: JupyterActions;
  frame_actions?: NotebookFrameActions;
  editor_actions?: JupyterEditorActions;
}

export function commands(actions: AllActions): {
  [name: string]: CommandDescription;
} {
  function id(): string {
    return actions.frame_actions?.store.get("cur_id");
  }

  return {
    "cell toolbar none": {
      i: "ban",
      m: jupyter.commands.cell_toolbar_none,
      menu: jupyter.commands.cell_toolbar_none_menu,
      f: () => actions.jupyter_actions?.cell_toolbar(),
      r: true,
    },

    "cell toolbar attachments": {
      m: defineMessage({
        id: "jupyter.commands.cell_toolbar_attachments.label",
        defaultMessage: "Attachments toolbar",
      }),
      i: "image",
      menu: defineMessage({
        id: "jupyter.commands.cell_toolbar_attachments.menu",
        defaultMessage: "Attachments",
      }),
      f: () => actions.jupyter_actions?.cell_toolbar("attachments"),
      r: true,
    },

    "cell toolbar ids": {
      i: "tags-filled",
      m: defineMessage({
        id: "jupyter.commands.cell_toolbar_ids.label",
        defaultMessage: "Edit cell IDs toolbar",
      }),
      menu: defineMessage({
        id: "jupyter.commands.cell_toolbar_ids.menu",
        defaultMessage: "Id's",
      }),
      f: () => actions.jupyter_actions?.cell_toolbar("ids"),
      r: true,
    },

    "cell toolbar tags": {
      i: "tags-outlined",
      m: defineMessage({
        id: "jupyter.commands.cell_toolbar_tags.label",
        defaultMessage: "Edit cell tags toolbar",
      }),
      menu: defineMessage({
        id: "jupyter.commands.cell_toolbar_tags.menu",
        defaultMessage: "Tags",
      }),
      f: () => actions.jupyter_actions?.cell_toolbar("tags"),
      r: true,
    },

    "cell toolbar metadata": {
      m: defineMessage({
        id: "jupyter.commands.cell_toolbar_metadata.label",
        defaultMessage: "Edit custom metadata toolbar",
      }),
      i: "tags-outlined",
      menu: defineMessage({
        id: "jupyter.commands.cell_toolbar_metadata.menu",
        defaultMessage: "Metadata",
      }),
      f: () => actions.jupyter_actions?.cell_toolbar("metadata"),
      r: true,
    },

    "cell toolbar create_assignment": {
      i: "graduation-cap",
      m: defineMessage({
        id: "jupyter.commands.cell_toolbar_create_assignment.label",
        defaultMessage: "Create Assignment Using nbgrader",
        description: "Do not translate 'nbgrader'",
      }),
      menu: defineMessage({
        id: "jupyter.commands.cell_toolbar_create_assignment.menu",
        defaultMessage: "Create assignment (nbgrader)",
        description: "Do not translate 'nbgrader'",
      }),
      f: () => actions.jupyter_actions?.cell_toolbar("create_assignment"),
      r: true,
    },

    "cell toolbar slideshow": {
      i: "slides",
      m: defineMessage({
        id: "jupyter.commands.cell_toolbar_slideshow.label",
        defaultMessage: "Slideshow toolbar",
      }),
      menu: defineMessage({
        id: "jupyter.commands.cell_toolbar_slideshow.menu",
        defaultMessage: "Slideshow",
      }),
      f: () => actions.jupyter_actions?.cell_toolbar("slideshow"),
      r: true,
    },

    "change cell to code": {
      i: "code-outlined",
      m: jupyter.commands.change_cell_to_code,
      k: [{ which: 89, mode: "escape" }],
      f: () => actions.frame_actions?.set_selected_cell_type("code"),
    },

    "change cell to heading 1": {
      i: "header",
      m: defineMessage({
        id: "jupyter.commands.change_cell_to_heading_1.label",
        defaultMessage: "Change Markdown to Heading 1",
      }),
      k: [{ which: 49, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 1),
    },
    "change cell to heading 2": {
      i: "header",
      m: defineMessage({
        id: "jupyter.commands.change_cell_to_heading_2.label",
        defaultMessage: "Change Markdown to Heading 2",
      }),
      k: [{ which: 50, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 2),
    },
    "change cell to heading 3": {
      i: "header",
      m: defineMessage({
        id: "jupyter.commands.change_cell_to_heading_3.label",
        defaultMessage: "Change Markdown to Heading 3",
      }),
      k: [{ which: 51, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 3),
    },
    "change cell to heading 4": {
      i: "header",
      m: defineMessage({
        id: "jupyter.commands.change_cell_to_heading_4.label",
        defaultMessage: "Change Markdown to Heading 4",
      }),
      k: [{ which: 52, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 4),
    },
    "change cell to heading 5": {
      i: "header",
      m: defineMessage({
        id: "jupyter.commands.change_cell_to_heading_5.label",
        defaultMessage: "Change Markdown to Heading 5",
      }),
      k: [{ which: 53, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 5),
    },
    "change cell to heading 6": {
      i: "header",
      m: defineMessage({
        id: "jupyter.commands.change_cell_to_heading_6.label",
        defaultMessage: "Change Markdown to Heading 6",
      }),
      k: [{ which: 54, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 6),
    },

    "change cell to markdown": {
      m: jupyter.commands.change_cell_to_markdown,
      i: "markdown",
      k: [{ which: 77, mode: "escape" }],
      f: () => actions.frame_actions?.set_selected_cell_type("markdown"),
    },

    "change cell to raw": {
      m: jupyter.commands.change_cell_to_raw,
      k: [{ which: 82, mode: "escape" }],
      f: () => actions.frame_actions?.set_selected_cell_type("raw"),
    },

    "clear all cells output": {
      m: defineMessage({
        id: "jupyter.commands.clear_all_cells_output.label",
        defaultMessage: "Clear All Cell Outputs",
      }),
      t: defineMessage({
        id: "jupyter.commands.clear_all_cells_output.tooltip",
        defaultMessage: "Clear the output of all cells in the notebook",
      }),
      f: () => actions.jupyter_actions?.clear_all_outputs(),
    },

    "clear cell output": {
      i: "battery-empty",
      m: defineMessage({
        id: "jupyter.commands.clear_cells_output.label",
        defaultMessage: "Clear Output of Selected Cells",
      }),
      t: defineMessage({
        id: "jupyter.commands.clear_cells_output.tooltip",
        defaultMessage: "Clear the output of the selected cells",
      }),
      f: () => actions.frame_actions?.clear_selected_outputs(),
    },

    "close and halt": {
      i: "PoweroffOutlined",
      m: jupyter.commands.close_and_halt_menu,
      f: () => actions.jupyter_actions?.confirm_close_and_halt(),
      r: true,
    },

    "close pager": {
      m: "Close Pager",
      k: [{ which: 27, mode: "escape" }],
      f: () => {
        actions.editor_actions?.close_introspect();
      },
      r: true,
    },

    "confirm restart kernel": {
      m: jupyter.commands.restart_kernel_label,
      b: jupyter.commands.restart_kernel_button,
      i: "reload",
      k: [{ mode: "escape", which: 48, twice: true }],
      f: () => actions.jupyter_actions?.confirm_restart(),
    },

    "confirm halt kernel": {
      m: jupyter.commands.halt_kernel_menu,
      i: "stop",
      f: () => actions.jupyter_actions?.confirm_halt_kernel(),
    },

    "confirm restart kernel and clear output": {
      i: "retweet",
      b: labels.clear,
      m: jupyter.commands.restart_kernel_clear_output_menu,
      menu: "Clear output...",
      f: () => actions.jupyter_actions?.restart_clear_all_output(),
    },

    "confirm restart kernel and run all cells": {
      m: jupyter.commands.restart_kernel_run_all_cells,
      b: jupyter.commands.restart_kernel_run_all_cells_button,
      menu: jupyter.commands.restart_kernel_run_all_cells_menu,
      i: "forward",
      f: () => {
        if (actions.frame_actions != null) {
          actions.jupyter_actions?.restart_and_run_all(actions.frame_actions);
        }
      },
    },

    "confirm restart kernel and run all cells without halting on error": {
      m: jupyter.commands.restart_kernel_run_all_cells_without_halting,
      menu: jupyter.commands.restart_kernel_run_all_cells_without_halting,
      i: "run",
      k: [{ which: 13, ctrl: true, shift: true }],
      f: () => {
        if (actions.frame_actions != null) {
          actions.jupyter_actions?.restart_and_run_all_no_halt(
            actions.frame_actions,
          );
        }
      },
    },

    "confirm shutdown kernel": {
      i: "PoweroffOutlined",
      b: jupyter.commands.shutdown_kernel_button,
      m: jupyter.commands.shutdown_kernel_menu,
      async f(): Promise<void> {
        const intl = await getIntl();
        const shutdown = intl.formatMessage(
          jupyter.commands.shutdown_kernel_confirm_label_shutdown,
        );
        const cont = intl.formatMessage(
          jupyter.commands.shutdown_kernel_confirm_label_continue,
        );
        const choice = await actions.jupyter_actions?.confirm_dialog({
          title: intl.formatMessage(
            jupyter.commands.shutdown_kernel_confirm_title,
          ),
          body: intl.formatMessage(
            jupyter.commands.shutdown_kernel_confirm_body,
          ),
          choices: [
            { title: cont },
            { title: shutdown, style: "danger", default: true },
          ],
        });
        if (choice === shutdown) {
          actions.jupyter_actions?.shutdown();
        }
      },
    },

    "copy cell": {
      i: COPY_CELL_ICON,
      m: jupyter.commands.copy_cells,
      k: [{ mode: "escape", which: 67 }],
      f: () => actions.frame_actions?.copy_selected_cells(),
      r: true,
    },

    //"copy cell attachments": undefined, // no clue what this means or is for... but I can guess...

    "cut cell": {
      i: "scissors",
      m: jupyter.commands.cut_cells,
      k: [{ mode: "escape", which: 88 }],
      f: () => actions.frame_actions?.cut_selected_cells(),
    },

    //"cut cell attachments": undefined, // no clue

    "delete cell": {
      // jupyter has this but ONLY with d,d as shortcut, since they have no undo.
      // Actually, it turns out after extensive testing that even with undo, users don't
      // realize to use it if they accidentally delete a cell, so we are removing the standard
      // keyboard shortcuts for delete:
      //.   https://github.com/sagemathinc/cocalc/issues/7831
      m: jupyter.commands.delete_cells,
      i: DELETE_CELL_ICON,
      k: [
        { mode: "escape", which: 68, twice: true },
        // { mode: "escape", which: 8 },
        // { mode: "escape", which: 46 },
      ],
      f: () => actions.frame_actions?.delete_selected_cells(),
    },

    "delete all blank code cells": {
      // Requested by a user; not in upstream jupyter or any known extension
      // https://github.com/sagemathinc/cocalc/issues/6194
      i: "trash",
      m: jupyter.commands.delete_all_blank_code_cells,
      f: () => actions.jupyter_actions?.delete_all_blank_code_cells(),
    },

    "duplicate notebook": {
      m: defineMessage({
        id: "jupyter.commands.duplicate_notebook.menu",
        defaultMessage: "Make a copy...",
      }),
      f: () => actions.jupyter_actions?.file_action("duplicate"),
      r: true,
    },

    "edit keyboard shortcuts": {
      i: "keyboard",
      b: defineMessage({
        id: "jupyter.commands.edit_keyboard_shortcuts.button",
        defaultMessage: "Commands",
      }),
      m: defineMessage({
        id: "jupyter.commands.edit_keyboard_shortcuts.label",
        defaultMessage: "All Keyboard Shortcuts and Commands...",
      }),
      f: () => actions.jupyter_actions?.show_keyboard_shortcuts(),
      r: true,
    },

    "enter command mode": {
      m: jupyter.commands.enter_command_mode,
      k: [
        { which: 27, mode: "edit" },
        { ctrl: true, mode: "edit", which: 77 },
        { alt: true, mode: "edit", which: 77 },
      ],
      f() {
        if (
          actions.frame_actions?.store.get("mode") === "escape" &&
          actions.jupyter_actions?.store.get("introspect") != null
        ) {
          actions.jupyter_actions?.clear_introspect();
        }

        if (
          actions.jupyter_actions?.store.getIn([
            "cm_options",
            "options",
            "keyMap",
          ]) === "vim"
        ) {
          // Vim mode is trickier...
          if (
            actions.frame_actions?.store.get("cur_cell_vim_mode", "escape") !==
            "escape"
          ) {
            return;
          }
        }
        actions.frame_actions?.set_mode("escape");
      },
      r: true,
    },

    "enter edit mode": {
      m: jupyter.commands.enter_edit_mode,
      k: [{ which: 13, mode: "escape" }],
      f: () => {
        actions.frame_actions?.unhide_current_input();
        actions.frame_actions?.set_mode("edit");
      },
    },

    "extend selection above": {
      m: "Enter selection above cell",
      k: [
        { mode: "escape", shift: true, which: 75 },
        { mode: "escape", shift: true, which: 38 },
      ],
      f: () => actions.frame_actions?.extend_selection(-1),
      r: true,
    },

    "extend selection below": {
      m: "Enter selection below cell",
      k: [
        { mode: "escape", shift: true, which: 74 },
        { mode: "escape", shift: true, which: 40 },
      ],
      f: () => actions.frame_actions?.extend_selection(1),
      r: true,
    },

    "find and replace": {
      i: "replace",
      b: "Replace",
      m: jupyter.commands.find_and_replace,
      k: [
        { mode: "escape", which: 70 },
        { alt: true, mode: "escape", which: 70 },
      ],
      f: () => actions.jupyter_actions?.show_find_and_replace(),
    },

    "global undo": {
      m: labels.undo,
      i: "undo",
      d: "Global user-aware undo.  Undo the last change *you* made to the notebook.",
      k: [
        { alt: true, mode: "escape", which: 90 },
        { ctrl: true, mode: "escape", which: 90 },
      ],
      f: () => actions.frame_actions?.undo(),
    },

    "global redo": {
      m: labels.redo,
      i: "repeat",
      d: "Global user-aware redo.  Redo the last change *you* made to the notebook.",
      k: [
        { alt: true, mode: "escape", which: 90, shift: true },
        { ctrl: true, mode: "escape", which: 90, shift: true },
        { alt: true, mode: "escape", which: 89 },
        { ctrl: true, mode: "escape", which: 89 },
      ],
      f: () => actions.frame_actions?.redo(),
    },

    "hide all line numbers": {
      i: "list-ol",
      m: "Hide Line Numbers for All Cells",
      f: () => actions.jupyter_actions?.set_line_numbers(false),
      r: true,
    },

    "hide header": {
      m: defineMessage({
        id: "jupyter.commands.hide_header.menu",
        defaultMessage: "Hide header",
      }),
      f: () => actions.jupyter_actions?.set_header_state(true),
      r: true,
    },

    "insert cell above": {
      m: jupyter.commands.insert_cell_above,
      i: "arrow-circle-up",
      k: [{ mode: "escape", which: 65 }],
      f: () => {
        actions.frame_actions?.insert_cell(-1);
      },
    },

    "insert cell below": {
      m: jupyter.commands.insert_cell_below,
      i: "arrow-circle-down",
      k: [{ mode: "escape", which: 66 }],
      f: () => {
        actions.frame_actions?.insert_cell(1);
      },
    },

    "interrupt kernel": {
      i: "stop",
      b: labels.stop,
      m: jupyter.commands.interrupt_kernel,
      k: [{ mode: "escape", which: 73, twice: true }],
      f: () => actions.jupyter_actions?.signal("SIGINT"),
    },

    "merge cell with next cell": {
      i: "merge-cells-outlined",
      ir: "90",
      m: defineMessage({
        id: "jupyter.commands.merge_cell_below.menu",
        description: "Cells in a Jupyter Notebook",
        defaultMessage: "Merge Cell Below",
      }),
      f: () => actions.frame_actions?.merge_cell_below(),
    },

    "merge cell with previous cell": {
      i: "merge-cells-outlined",
      ir: "90",
      m: defineMessage({
        id: "jupyter.commands.merge_cell_above.menu",
        description: "Cells in a Jupyter Notebook",
        defaultMessage: "Merge Cell Above",
      }),
      f: () => actions.frame_actions?.merge_cell_above(),
    },

    "merge cells": {
      i: "merge-cells-outlined",
      ir: "90",
      m: jupyter.commands.merge_selected_cells_menu,
      k: [{ mode: "escape", shift: true, which: 77 }],
      f: () => actions.frame_actions?.merge_selected_cells(),
    },

    "merge selected cells": {
      // why is this in jupyter; it's the same as the above?
      i: "merge-cells-outlined",
      ir: "90",
      m: jupyter.commands.merge_selected_cells_menu,
      f: () => actions.frame_actions?.merge_selected_cells(),
    },

    "move cell down": {
      i: "arrow-down",
      m: defineMessage({
        id: "jupyter.commands.move_cells_down.menu",
        description: "Cells in a Jupyter Notebook",
        defaultMessage: "Move Selected Cells Down",
      }),
      k: [{ alt: true, mode: "escape", which: 40 }],
      f: () => actions.frame_actions?.move_selected_cells(1),
    },

    "move cell up": {
      i: "arrow-up",
      m: defineMessage({
        id: "jupyter.commands.move_cells_up.menu",
        description: "Cells in a Jupyter Notebook",
        defaultMessage: "Move Selected Cells Up",
      }),
      k: [{ alt: true, mode: "escape", which: 38 }],
      f: () => actions.frame_actions?.move_selected_cells(-1),
    },

    "move cursor down": {
      m: defineMessage({
        id: "jupyter.commands.move_cursor_down.menu",
        defaultMessage: "Move cursor down",
      }),
      f: () => actions.frame_actions?.move_edit_cursor(1),
      r: true,
    },

    "move cursor up": {
      m: defineMessage({
        id: "jupyter.commands.move_cursor_up.menu",
        defaultMessage: "Move cursor up",
      }),
      f: () => actions.frame_actions?.move_edit_cursor(-1),
      r: true,
    },

    "new notebook": {
      m: labels.new_dots,
      f: () => actions.jupyter_actions?.file_new(),
      r: true,
    },

    "nbconvert ipynb": {
      i: "jupyter",
      m: "Notebook (.ipynb)",
      f() {
        actions.jupyter_actions?.save();
        actions.jupyter_actions?.file_action("download");
      },
      r: true,
    },

    "nbconvert asciidoc": {
      i: "file-code",
      m: "AsciiDoc (.asciidoc)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("asciidoc"),
      r: true,
    },

    "nbconvert python": {
      i: "python",
      m: "Python (.py)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("python"),
      r: true,
    },

    "nbconvert classic html": {
      i: "html5",
      m: "HTML via Classic nbconvert (.html)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("classic-html"),
      r: true,
    },

    "nbconvert classic pdf": {
      i: "file-pdf",
      m: "PDF via Classic nbconvert and Chrome (.pdf)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("classic-pdf"),
      r: true,
    },

    "nbconvert lab html": {
      i: "html5",
      m: "HTML via JupyterLab nbconvert (.html)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("lab-html"),
      r: true,
    },

    "nbconvert lab pdf": {
      i: "file-pdf",
      m: "PDF via JupyterLab nbconvert and Chrome (.pdf)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("lab-pdf"),
      r: true,
    },

    "nbconvert cocalc html": {
      i: "html5",
      m: "HTML (.html)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("cocalc-html"),
      r: true,
    },

    "nbconvert markdown": {
      i: "markdown",
      m: "Markdown (.md)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("markdown"),
      r: true,
    },

    "nbconvert rst": {
      i: "code",
      m: "reST (.rst)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("rst"),
      r: true,
    },

    "nbconvert slides": {
      i: "slides",
      m: jupyter.commands.nbconvert_slides,
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("slides"),
      r: true,
    },

    slideshow: {
      i: "slides",
      m: labels.slideshow,
      f: () => actions.editor_actions?.show_revealjs_slideshow(),
      r: true,
    },

    "table of contents": {
      m: editor.table_of_contents_name,
      f: () => actions.editor_actions?.show_table_of_contents(),
      r: true,
    },

    "nbconvert tex": {
      i: "tex",
      m: "LaTeX (.tex)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("latex"),
      r: true,
    },

    "nbconvert cocalc pdf": {
      i: "file-pdf",
      m: "PDF (.pdf)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("cocalc-pdf"),
      r: true,
    },

    "nbconvert latex pdf": {
      i: "tex",
      m: "PDF via LaTeX and nbconvert (minimal image support) (.pdf)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("pdf"),
      r: true,
    },

    "nbconvert script": {
      i: "code-outlined",
      m: "Executable Script",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("script"),
      r: true,
    },

    "nbconvert sagews": {
      i: "sagemath",
      m: "Sage Worksheet (.sagews)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("sagews"),
      r: true,
    },

    "nbgrader validate": {
      i: "graduation-cap",
      t: jupyter.commands.validate_tooltip,
      m: jupyter.commands.validate_label,
      menu: jupyter.commands.validate_label,
      f: () => {
        if (actions.frame_actions != null) {
          actions.jupyter_actions?.nbgrader_actions.confirm_validate(
            actions.frame_actions,
          );
        }
      },
    },

    "nbgrader assign": {
      i: "graduation-cap",
      t: jupyter.commands.nbgrader_assign_tooltip,
      m: jupyter.commands.nbgrader_assign_menu,
      menu: jupyter.commands.nbgrader_assign_menu,
      b: jupyter.commands.nbgrader_assign_button,
      f: () => actions.jupyter_actions?.nbgrader_actions.confirm_assign(),
    },

    "open file": {
      m: menu.open,
      f: () => actions.jupyter_actions?.file_open(),
      r: true,
    },

    "paste cell above": {
      m: jupyter.commands.paste_cells_above_menu,
      k: [
        { mode: "escape", shift: true, which: 86 },
        { mode: "escape", shift: true, ctrl: true, which: 86 },
        { mode: "escape", shift: true, alt: true, which: 86 },
      ],
      f: () => actions.frame_actions?.paste_cells(-1),
    },

    //"paste cell attachments": undefined, // TODO ? not sure what the motivation is...

    "paste cell below": {
      k: [{ mode: "escape", which: 86 }],
      m: jupyter.commands.paste_cells_below_menu,
      f: () => actions.frame_actions?.paste_cells(1),
    },

    "paste cell and replace": {
      // jupyter doesn't have this but it's normal paste behavior!
      i: "paste",
      m: jupyter.commands.paste_cells_replace_menu,
      k: [
        { mode: "escape", alt: true, which: 86 },
        { mode: "escape", ctrl: true, which: 86 },
      ],
      f() {
        if (actions.frame_actions == null) return;
        if (actions.frame_actions.store.get("sel_ids", { size: 0 }).size > 0) {
          actions.frame_actions?.paste_cells(0);
        } else {
          actions.frame_actions?.paste_cells(1);
        }
      },
    },

    "no kernel": {
      i: "ban",
      m: defineMessage({
        id: "jupyter.commands.no_kernel.menu",
        defaultMessage: "Set Kernel to None...",
        description: "Kernel of a Jupyter Notebook",
      }),
      t: defineMessage({
        id: "jupyter.commands.no_kernel.tooltip",
        defaultMessage:
          "Set the notebook so that it doesn't have any kernel set at all.",
        description: "Kernel of a Jupyter Notebook",
      }),
      f: () => actions.jupyter_actions?.confirm_remove_kernel(),
    },

    "refresh kernels": {
      i: "refresh",
      m: jupyter.commands.refresh_kernels,
      t: jupyter.commands.refresh_kernels_tooltip,
      f: () =>
        actions.jupyter_actions?.fetch_jupyter_kernels({ noCache: true }),
    },

    "custom kernel": {
      i: "external-link",
      m: defineMessage({
        id: "jupyter.commands.custom_kernel.menu.menu",
        defaultMessage: "How to Create a Custom Kernel...",
      }),
      t: defineMessage({
        id: "jupyter.commands.custom_kernel.menu.tooltip",
        defaultMessage:
          "Show tutorial for how to create your own custom Jupyter kernel and use it here.",
      }),
      f: () => actions.jupyter_actions?.custom_jupyter_kernel_docs(),
      r: true,
    },

    "rename notebook": {
      m: "Rename...",
      f: () => actions.jupyter_actions?.file_action("rename"),
    },

    "restart kernel": {
      m: jupyter.commands.restart_kernel_noconf_menu,
      b: labels.restart,
      f: () => actions.jupyter_actions?.restart(),
    },

    "restart kernel and clear output": {
      m: jupyter.commands.restart_kernel_clear_noconf_menu,
      f() {
        actions.jupyter_actions?.restart();
        actions.jupyter_actions?.clear_all_outputs();
      },
    },

    "restart kernel and run all cells": {
      m: jupyter.commands.restart_kernel_run_all_cells_noconf,
      i: "forward",
      b: jupyter.commands.restart_kernel_run_all_cells_noconf_button,
      async f() {
        actions.frame_actions?.set_all_md_cells_not_editing();
        await actions.jupyter_actions?.restart();
        actions.jupyter_actions?.run_all_cells();
      },
    },

    "run all cells": {
      m: jupyter.commands.run_all_cells_menu,
      i: "forward",
      f: () => {
        actions.frame_actions?.set_all_md_cells_not_editing();
        actions.jupyter_actions?.run_all_cells();
      },
    },

    "run all cells above": {
      i: RUN_ALL_CELLS_ABOVE_ICON,
      m: jupyter.commands.run_all_cells_above_menu,
      f: () => actions.frame_actions?.run_all_above(),
    },

    "run all cells below": {
      i: RUN_ALL_CELLS_BELOW_ICON,
      ir: "90",
      m: jupyter.commands.run_all_cells_below_menu,
      f: () => actions.frame_actions?.run_all_below(),
    },

    "run cell and insert below": {
      i: "step-forward",
      m: jupyter.commands.run_cell_and_insert_below,
      b: "Run +",
      t: jupyter.commands.run_cell_and_insert_below_title,
      k: [{ which: 13, alt: true }],
      f: () =>
        actions.frame_actions?.run_selected_cells_and_insert_new_cell_below(),
    },

    // NOTE: This entry *must* be below "run cell and insert below", since
    // the meta has to take precedence over the alt (which is also meta automatically
    // on a mac). https://github.com/sagemathinc/cocalc/issues/7000
    "run cell": {
      i: "play",
      m: jupyter.commands.run_cell,
      b: "Stay",
      t: jupyter.commands.run_cell_title,
      k: [
        { which: 13, ctrl: true },
        { which: 13, meta: true },
      ],
      f() {
        actions.frame_actions?.run_selected_cells();
        actions.frame_actions?.set_mode("escape");
        actions.frame_actions?.scroll("cell visible");
      },
    },

    "run cell and select next": {
      i: "step-forward",
      m: jupyter.commands.run_cell_and_select_next,
      b: "Run",
      k: [{ which: 13, shift: true }],
      f() {
        actions.frame_actions?.shift_enter_run_selected_cells();
        actions.frame_actions?.scroll("cell visible");
      },
    },

    "run current cell and select next": {
      i: "step-forward",
      m: jupyter.commands.run_current_cell,
      b: "Run",
      f() {
        actions.frame_actions?.shift_enter_run_current_cell();
        actions.frame_actions?.scroll("cell visible");
      },
    },

    "save notebook": {
      m: labels.save,
      k: [
        { which: 83, alt: true },
        { which: 83, ctrl: true },
      ],
      f: () => actions.jupyter_actions?.save(),
    },

    "scroll cell visible": {
      m: defineMessage({
        id: "jupyter.commands.scroll_cell_visible.menu",
        description: "Cell in a Jupyter Notebook",
        defaultMessage: "Scroll Selected Cell Into View",
      }),
      f: () => actions.frame_actions?.scroll("cell visible"),
      r: true,
    },

    "scroll notebook down": {
      m: defineMessage({
        id: "jupyter.commands.scroll_notebook_down.menu",
        description: "A Jupyter Notebook",
        defaultMessage: "Scroll Notebook Down",
      }),
      k: [{ mode: "escape", which: 32 }],
      f: () => actions.frame_actions?.scroll("list down"),
      r: true,
    },

    "scroll notebook up": {
      m: defineMessage({
        id: "jupyter.commands.scroll_notebook_up.menu",
        description: "A Jupyter Notebook",
        defaultMessage: "Scroll Notebook Up",
      }),
      k: [{ mode: "escape", shift: true, which: 32 }],
      f: () => actions.frame_actions?.scroll("list up"),
      r: true,
    },

    "select all cells": {
      i: "menu-outlined",
      m: defineMessage({
        id: "jupyter.commands.select_all_cells.menu",
        description: "Cells in a Jupyter Notebook",
        defaultMessage: "Select All Cells",
      }),
      k: [
        { alt: true, mode: "escape", which: 65 },
        { ctrl: true, mode: "escape", which: 65 },
      ],
      f: () => actions.frame_actions?.select_all_cells(),
      r: true,
    },

    "select all code cells": {
      i: "code-outlined",
      m: "Select all Code Cells",
      f: () => actions.frame_actions?.select_all_cells("code"),
      r: true,
    },

    "select all markdown cells": {
      i: "markdown",
      m: "Select all Markdown Cells",
      f: () => actions.frame_actions?.select_all_cells("markdown"),
      r: true,
    },

    "deselect all cells": {
      i: "ban",
      m: defineMessage({
        id: "jupyter.commands.deselect_all_cells.menu",
        description: "Cells in a Jupyter Notebook",
        defaultMessage: "Deselect All Cells",
      }),
      f: () => actions.frame_actions?.unselect_all_cells(),
      r: true,
    },

    "select next cell": {
      m: defineMessage({
        id: "jupyter.commands.select_next_cell.menu",
        description: "Cells in a Jupyter Notebook",
        defaultMessage: "Select Next Cell",
      }),
      k: [
        { which: 40, mode: "escape" },
        { which: 74, mode: "escape" },
      ],
      f() {
        actions.frame_actions?.move_cursor(1);
        actions.frame_actions?.unselect_all_cells();
        actions.frame_actions?.scroll("cell visible");
      },
      r: true,
    },

    "select previous cell": {
      m: defineMessage({
        id: "jupyter.commands.select_previous_cell.menu",
        description: "Cells in a Jupyter Notebook",
        defaultMessage: "Select Previous Cell",
      }),
      k: [
        { which: 38, mode: "escape" },
        { which: 75, mode: "escape" },
      ],
      f() {
        actions.frame_actions?.move_cursor(-1);
        actions.frame_actions?.unselect_all_cells();
        actions.frame_actions?.scroll("cell visible");
      },
      r: true,
    },

    "show all line numbers": {
      i: "list-ol",
      m: defineMessage({
        id: "jupyter.commands.show_all_line_numbers.menu",
        description: "Cells in a Jupyter Notebook",
        defaultMessage: "Show Line Numbers for All Cells",
      }),
      f: () => actions.jupyter_actions?.set_line_numbers(true),
      r: true,
    },

    "show code folding": {
      i: "list-ol",
      m: defineMessage({
        id: "jupyter.commands.show_code_folding.menu",
        defaultMessage: "Enable Code Folding",
      }),

      f: () =>
        redux.getActions("account").set_editor_settings("code_folding", true),
      r: true,
    },

    "hide code folding": {
      i: "list-ol",
      m: defineMessage({
        id: "jupyter.commands.hide_code_folding.menu",
        defaultMessage: "Disable Code Folding",
      }),
      f: () =>
        redux.getActions("account").set_editor_settings("code_folding", false),
      r: true,
    },

    "show command palette": {
      m: "Show command palette...",
      k: [
        { alt: true, shift: true, which: 80 },
        { ctrl: true, shift: true, which: 80 },
      ],
      f: () => actions.jupyter_actions?.show_keyboard_shortcuts(),
      r: true,
    },

    "show header": {
      m: defineMessage({
        id: "jupyter.commands.show_header.menu",
        defaultMessage: "Show header",
      }),
      f: () => actions.jupyter_actions?.set_header_state(false),
      r: true,
    },

    "show keyboard shortcuts": {
      i: "keyboard",
      m: defineMessage({
        id: "jupyter.commands.show_keyboard_shortcuts.menu",
        defaultMessage: "Show keyboard shortcuts...",
      }),
      k: [{ mode: "escape", which: 72 }],
      f: () => actions.jupyter_actions?.show_keyboard_shortcuts(),
      r: true,
    },

    "shutdown kernel": {
      i: "PoweroffOutlined",
      m: defineMessage({
        id: "jupyter.commands.shutdown_kernel.menu",
        description: "Kernel of a Jupyter Notebook",
        defaultMessage: "Shutdown kernel",
      }),
      f: () => actions.jupyter_actions?.shutdown(),
    },

    "split cell at cursor": {
      i: SPLIT_CELL_ICON,
      m: defineMessage({
        id: "jupyter.commands.split_cell_at_cursor.menu",
        defaultMessage: "Split Cell",
        description: "Cell in a Jupyter Notebook",
      }),
      k: [
        { ctrl: true, shift: true, which: 189 },
        { ctrl: true, key: ";", which: 186 },
      ],
      f() {
        actions.frame_actions?.set_mode("escape");
        actions.frame_actions?.split_current_cell();
      },
    },

    "tab key": {
      k: [{ mode: "escape", which: 9 }],
      m: defineMessage({
        id: "jupyter.commands.tab_key.menu",
        defaultMessage: "Tab Key (completion)",
        description: "Tab Key of a computer keyboard",
      }),
      b: defineMessage({
        id: "jupyter.commands.tab_key.button",
        defaultMessage: "Tab",
        description: "Tab Key of a computer keyboard",
      }),
      i: "tab",
      f: () => actions.frame_actions?.tab_key(),
    },

    "shift+tab key": {
      i: "question-circle",
      k: [{ mode: "escape", shift: true, which: 9 }],
      m: "Shift+Tab (docstring)",
      f: () => actions.frame_actions?.shift_tab_key(),
    },

    "time travel": {
      m: labels.timetravel,
      f: () => actions.jupyter_actions?.show_history_viewer(),
      r: true,
    },

    "toggle all cells output collapsed": {
      m: "Toggle Collapsed Output of All Cells",
      f: () => actions.jupyter_actions?.toggle_all_outputs("collapsed"),
    },

    "toggle all line numbers": {
      i: "list-ol",
      m: jupyter.commands.toggle_all_line_numbers,
      k: [{ mode: "escape", shift: true, which: 76 }],
      f: () => actions.jupyter_actions?.toggle_line_numbers(),
      r: true,
    },

    "toggle cell line numbers": {
      i: "list-ol",
      m: jupyter.commands.toggle_cell_line_numbers,
      k: [{ mode: "escape", which: 76 }],
      f: () => actions.jupyter_actions?.toggle_cell_line_numbers(id()),
      r: true,
    },

    "toggle cell output collapsed": {
      m: "Toggle Collapsed Output",
      k: [{ mode: "escape", which: 79 }],
      f: () => actions.frame_actions?.toggle_selected_outputs("collapsed"),
    },

    "toggle cell output scrolled": {
      m: "Toggle Scrolled Output of Selected Cells",
      k: [{ mode: "escape", which: 79, shift: true }],
      f: () => actions.frame_actions?.toggle_selected_outputs("scrolled"),
    },

    "toggle all cells output scrolled": {
      m: "Toggle Scrolled Output of All Cells",
      f: () => actions.jupyter_actions?.toggle_all_outputs("scrolled"),
    },

    "set cell output scrolled": {
      i: "sliders",
      t: "Set the output of all selected cells to have a max height and be scrollable, so they don't use up too much vertical space. This is the default for new cells.",
      m: "Scroll Selected Outputs",
      f: () =>
        actions.frame_actions?.setScrolled({
          all: false,
          scrolled: true,
        }),
    },
    "set all cell output scrolled": {
      i: "sliders",
      m: "Scroll All Output",
      t: "Set the output of all cells to have a max height and be scrollable, so they don't use up too much vertical space. This is the default for new cells.",

      f: () =>
        actions.frame_actions?.setScrolled({
          all: true,
          scrolled: true,
        }),
    },

    "unset cell output scrolled": {
      i: "sliders",
      t: "Set the output of all selected cells to NOT have a max height and scroll, so you do not have to scroll to see all output.",
      m: "Unscroll Selected Outputs",
      f: () =>
        actions.frame_actions?.setScrolled({
          all: false,
          scrolled: false,
        }),
    },
    "unset all cell output scrolled": {
      i: "sliders",
      t: "Set the output of all cells to NOT have a max height and scroll, so you do not have to scroll to see all output.",
      m: "Unscroll All Outputs",
      f: () =>
        actions.frame_actions?.setScrolled({
          all: true,
          scrolled: false,
        }),
    },

    "toggle header": {
      m: "Toggle header",
      f: () => actions.jupyter_actions?.toggle_header(),
      r: true,
    },

    /* "toggle rtl layout": {
      // TODO
      m: "Toggle RTL layout"
    }, */

    "toggle toolbar": {
      m: "Toggle toolbar",
      f: () => actions.jupyter_actions?.toggle_toolbar(),
      r: true,
    },

    "trust notebook": {
      m: "Trust notebook",
      f: () => actions.jupyter_actions?.trust_notebook(),
      r: true,
    },

    //     "undo cell deletion": {
    //       m: "Undo cell deletion",
    //       k: [{ mode: "escape", which: 90 }],
    //       f: () => actions.jupyter_actions?.undo(),
    //     },

    "zoom in": {
      m: labels.zoom_in,
      k: [{ ctrl: true, shift: true, which: 190 }],
      f: () => actions.frame_actions?.zoom(1),
      r: true,
    },

    "zoom out": {
      m: labels.zoom_out,
      k: [{ ctrl: true, shift: true, which: 188 }],
      f: () => actions.frame_actions?.zoom(-1),
      r: true,
    },

    "write protect": {
      i: "lock",
      m: defineMessage({
        id: "jupyter.commands.write_project.menu",
        defaultMessage: "Write Protect",
        description: "write protect a cell in a Jupyter Notebook",
      }),
      b: defineMessage({
        id: "jupyter.commands.write_project.button",
        defaultMessage: "Protect",
        description: "write protect a cell in a Jupyter Notebook",
      }),
      t: defineMessage({
        id: "jupyter.commands.write_project.tooltip",
        defaultMessage:
          "Make it so selected cells cannot be edited or deleted.",
        description: "write protect a cell in a Jupyter Notebook",
      }),
      f: () => actions.frame_actions?.write_protect_selected_cells(true),
    },

    "delete protect": {
      i: "ban",
      m: defineMessage({
        id: "jupyter.commands.delete_project.menu",
        defaultMessage: "Delete Protect",
        description: "delete protect a cell in a Jupyter Notebook",
      }),
      b: defineMessage({
        id: "jupyter.commands.delete_project.button",
        defaultMessage: "Protect",
        description: "delete protect a cell in a Jupyter Notebook",
      }),
      t: defineMessage({
        id: "jupyter.commands.delete_project.tooltip",
        defaultMessage: "Make it so selected cells cannot be deleted.",
        description: "delete protect a cell in a Jupyter Notebook",
      }),
      f: () => actions.frame_actions?.delete_protect_selected_cells(true),
    },

    "remove write protect": {
      i: "lock-open",
      m: defineMessage({
        id: "jupyter.commands.remove_write_project.menu",
        defaultMessage: "Remove Write Protect",
        description: "write protection of a cell in a Jupyter Notebook",
      }),
      t: defineMessage({
        id: "jupyter.commands.remove_write_project.tooltip",
        defaultMessage: "Remove write protection from selected cells.",
        description: "write protection of a cell in a Jupyter Notebook",
      }),
      f: () => actions.frame_actions?.write_protect_selected_cells(false),
    },

    "remove delete protect": {
      i: "check-circle",
      m: defineMessage({
        id: "jupyter.commands.remove_delete_project.menu",
        defaultMessage: "Remove Delete Protect",
        description: "delete protection of a cell in a Jupyter Notebook",
      }),
      t: defineMessage({
        id: "jupyter.commands.remove_delete_project.tooltip",
        defaultMessage: "Remove delete protection from selected cells.",
        description: "delete protection of a cell in a Jupyter Notebook",
      }),
      f: () => actions.frame_actions?.delete_protect_selected_cells(false),
    },

    /* NOTE:  JupyterLab sticks fricking 9 lines related to this
    functionality in the View menu.  I tried to implement this, but
    it is such bad UX, I couldn't bring myself to do it.  It's bad
    because: (1) the view menu should just show different ways of viewing
    the doc, not change it, (2) the edit menu is for editing, (3) having
    9 lines just for this means way more scrolling/searching in the menu.
    */
    "toggle hide input": {
      m: "Toggle Hide Input",
      t: "Toggle whether the input of the selected cells is hidden.",
      f: () => actions.frame_actions?.toggle_source_hidden(),
      k: [
        { alt: true, which: 72 },
        { meta: true, which: 72 },
      ],
    },

    "toggle hide output": {
      m: "Toggle Hide Output",
      t: "Toggle whether the output of the selected cells is hidden.",
      f: () => actions.frame_actions?.toggle_outputs_hidden(),
      k: [
        { alt: true, shift: true, which: 72 },
        { meta: true, shift: true, which: 72 },
      ],
    },

    "format cells": {
      b: "Format",
      i: FORMAT_SOURCE_ICON,
      m: "Format Selected Cells",
      f: () => actions.frame_actions?.format_selected_cells(),
    },

    "format all cells": {
      b: "Format",
      i: FORMAT_SOURCE_ICON,
      m: "Format All Cells",
      f: () => actions.frame_actions?.format_all_cells(),
    },

    "change kernel": {
      i: "jupyter",
      m: jupyter.commands.change_kernel,
      t: jupyter.commands.change_kernel_title,
      f: () => {
        actions.jupyter_actions?.show_select_kernel("user request");
      },
    },

    "help - jupyter in cocalc": {
      i: "external-link",
      m: "Jupyter in CoCalc",
      f: () => {
        open_new_tab("https://doc.cocalc.com/jupyter.html");
      },
      r: true,
    },

    "help - nbgrader in cocalc": {
      i: "external-link",
      m: "nbgrader in CoCalc",
      f: () => {
        open_new_tab("https://doc.cocalc.com/teaching-nbgrader.html");
      },
      r: true,
    },
    "help - markdown": {
      i: "external-link",
      m: "Markdown in CoCalc",
      f: () => {
        open_new_tab("https://doc.cocalc.com/markdown.html");
      },
      r: true,
    },
    "hide input": {
      i: "compress",
      m: "Collapse Selected Input",
      f: () => {
        actions.frame_actions?.setExpandCollapse({ target: "source" });
      },
    },
    "hide output": {
      i: "compress",
      m: "Collapse Selected Outputs",
      f: () => {
        actions.frame_actions?.setExpandCollapse({ target: "outputs" });
      },
    },
    "hide all input": {
      i: "compress",
      m: "Collapse All Input",
      f: () => {
        actions.frame_actions?.setExpandCollapse({
          target: "source",
          all: true,
        });
      },
    },
    "hide all output": {
      i: "compress",
      m: "Collapse All Output",
      f: () => {
        actions.frame_actions?.setExpandCollapse({
          target: "outputs",
          all: true,
        });
      },
    },
    "show input": {
      i: "expand-arrows",
      m: "Expand Selected Input",
      f: () => {
        actions.frame_actions?.setExpandCollapse({
          target: "source",
          expanded: true,
        });
      },
    },
    "show output": {
      i: "expand-arrows",
      m: "Expand Selected Output",
      f: () => {
        actions.frame_actions?.setExpandCollapse({
          target: "outputs",
          expanded: true,
        });
      },
    },
    "show all input": {
      i: "expand-arrows",
      m: "Expand All Input",
      f: () => {
        actions.frame_actions?.setExpandCollapse({
          target: "source",
          all: true,
          expanded: true,
        });
      },
    },
    "show all output": {
      i: "expand-arrows",
      m: "Expand All Output",
      f: () => {
        actions.frame_actions?.setExpandCollapse({
          target: "outputs",
          all: true,
          expanded: true,
        });
      },
    },
  };
}
