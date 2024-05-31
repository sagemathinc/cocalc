/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Comprehensive list of Jupyter notebook (version 5) commands
we support and how they work.
*/

import { IconName } from "@cocalc/frontend/components";
import { FORMAT_SOURCE_ICON } from "@cocalc/frontend/frame-editors/frame-tree/config";
import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import { open_new_tab } from "@cocalc/frontend/misc";
import { JupyterActions } from "./browser-actions";
import { NotebookMode } from "@cocalc/jupyter/types";
import { RUN_ALL_CELLS_ABOVE_ICON, RUN_ALL_CELLS_BELOW_ICON } from "./consts";

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
  // "which" is deprecated and we should switch to using only key!
  // See https://github.com/sagemathinc/cocalc/issues/4020
}

export interface CommandDescription {
  m: string; // m=menu = fuller description for use in menus and commands
  f: Function; // function that implements command.
  b?: string; // very short label; use for a button
  i?: IconName;
  ir?: "90"; // rotate icon
  k?: KeyboardCommand[]; // keyboard commands
  t?: string; // t=title = much longer description for tooltip
  menu?: string; // alternative to m just for dropdown menu
  d?: string; // even more extensive description (e.g., for a tooltip).
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
      m: "No cell toolbar",
      menu: "None",
      f: () => actions.jupyter_actions?.cell_toolbar(),
    },

    "cell toolbar attachments": {
      m: "Attachments toolbar",
      i: "image",
      menu: "Attachments",
      f: () => actions.jupyter_actions?.cell_toolbar("attachments"),
    },

    "cell toolbar tags": {
      i: "tags-outlined",
      m: "Edit cell tags toolbar",
      menu: "Tags",
      f: () => actions.jupyter_actions?.cell_toolbar("tags"),
    },

    "cell toolbar metadata": {
      m: "Edit custom metadata toolbar",
      i: "tags-outlined",
      menu: "Metadata",
      f: () => actions.jupyter_actions?.cell_toolbar("metadata"),
    },

    "cell toolbar create_assignment": {
      i: "graduation-cap",
      m: "Create Assignment Using NBgrader",
      menu: "Create assignment (nbgrader)",
      f: () => actions.jupyter_actions?.cell_toolbar("create_assignment"),
    },

    "cell toolbar slideshow": {
      i: "slides",
      m: "Slideshow toolbar",
      menu: "Slideshow",
      f: () => actions.jupyter_actions?.cell_toolbar("slideshow"),
    },

    "change cell to code": {
      i: "code-outlined",
      m: "Change Cell to Code",
      k: [{ which: 89, mode: "escape" }],
      f: () => actions.frame_actions?.set_selected_cell_type("code"),
    },

    "change cell to heading 1": {
      i: "header",
      m: "Change Markdown to Heading 1",
      k: [{ which: 49, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 1),
    },
    "change cell to heading 2": {
      i: "header",
      m: "Change Markdown to Heading 2",
      k: [{ which: 50, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 2),
    },
    "change cell to heading 3": {
      i: "header",
      m: "Change Markdown to Heading 3",
      k: [{ which: 51, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 3),
    },
    "change cell to heading 4": {
      i: "header",
      m: "Change Markdown to Heading 4",
      k: [{ which: 52, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 4),
    },
    "change cell to heading 5": {
      i: "header",
      m: "Change Markdown to Heading 5",
      k: [{ which: 53, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 5),
    },
    "change cell to heading 6": {
      i: "header",
      m: "Change Markdown to Heading 6",
      k: [{ which: 54, mode: "escape" }],
      f: () => actions.frame_actions?.change_cell_to_heading(id(), 6),
    },

    "change cell to markdown": {
      m: "Change Cell to Markdown",
      k: [{ which: 77, mode: "escape" }],
      f: () => actions.frame_actions?.set_selected_cell_type("markdown"),
    },

    "change cell to raw": {
      m: "Change Cell to Raw",
      k: [{ which: 82, mode: "escape" }],
      f: () => actions.frame_actions?.set_selected_cell_type("raw"),
    },

    "clear all cells output": {
      m: "Clear All Cell Outputs",
      t: "Clear the output of all cells in the notebook",
      f: () => actions.jupyter_actions?.clear_all_outputs(),
    },

    "clear cell output": {
      i: "battery-empty",
      m: "Clear Output of Selected Cells",
      t: "Clear the output of the selected cells",
      f: () => actions.frame_actions?.clear_selected_outputs(),
    },

    "close and halt": {
      i: "PoweroffOutlined",
      m: "Close and halt",
      f: () => actions.jupyter_actions?.confirm_close_and_halt(),
    },

    "close pager": {
      m: "Close Pager",
      k: [{ which: 27, mode: "escape" }],
      f: () => {
        actions.editor_actions?.close_introspect();
      },
    },

    "confirm restart kernel": {
      m: "Restart Kernel...",
      b: "Kernel",
      i: "reload",
      k: [{ mode: "escape", which: 48, twice: true }],
      f: () => actions.jupyter_actions?.confirm_restart(),
    },

    "confirm halt kernel": {
      m: "Halt kernel...",
      i: "stop",
      f: () => actions.jupyter_actions?.confirm_halt_kernel(),
    },

    "confirm restart kernel and clear output": {
      i: "retweet",
      b: "Clear",
      m: "Restart Kernel and Clear All Outputs...",
      menu: "Clear output...",
      f: () => actions.jupyter_actions?.restart_clear_all_output(),
    },

    "confirm restart kernel and run all cells": {
      m: "Restart and Run All Cells...",
      b: "Run All",
      menu: "Run all...",
      i: "forward",
      f: () => {
        if (actions.frame_actions != null) {
          actions.jupyter_actions?.restart_and_run_all(actions.frame_actions);
        }
      },
    },

    "confirm restart kernel and run all cells without halting on error": {
      m: "Restart and Run All (do not stop on errors)...",
      menu: "Restart and run all (do not stop on errors)...",
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
      b: "Off",
      m: "Shutdown Kernel...",
      async f(): Promise<void> {
        const choice = await actions.jupyter_actions?.confirm_dialog({
          title: "Shutdown kernel?",
          body: "Do you want to shutdown the current kernel?  All variables will be lost.",
          choices: [
            { title: "Continue running" },
            { title: "Shutdown", style: "danger", default: true },
          ],
        });
        if (choice === "Shutdown") {
          actions.jupyter_actions?.shutdown();
        }
      },
    },

    "copy cell": {
      i: "files",
      m: "Copy Cells",
      k: [{ mode: "escape", which: 67 }],
      f: () => actions.frame_actions?.copy_selected_cells(),
    },

    //"copy cell attachments": undefined, // no clue what this means or is for... but I can guess...

    "cut cell": {
      i: "scissors",
      m: "Cut Cells",
      k: [{ mode: "escape", which: 88 }],
      f: () => actions.frame_actions?.cut_selected_cells(),
    },

    //"cut cell attachments": undefined, // no clue

    "delete cell": {
      // jupyter has this but with d,d as shortcut, since they have no undo.
      m: "Delete Cells",
      i: "trash",
      k: [
        { mode: "escape", which: 68, twice: true },
        { mode: "escape", which: 8 },
        { mode: "escape", which: 46 },
      ],
      f: () => actions.frame_actions?.delete_selected_cells(),
    },

    "delete all blank code cells": {
      // Requested by a user; not in upstream jupyter or any known extension
      // https://github.com/sagemathinc/cocalc/issues/6194
      i: "trash",
      m: "Delete All Blank Code Cells",
      f: () => actions.jupyter_actions?.delete_all_blank_code_cells(),
    },

    "duplicate notebook": {
      m: "Make a copy...",
      f: () => actions.jupyter_actions?.file_action("duplicate"),
    },

    "edit keyboard shortcuts": {
      i: "keyboard",
      b: "Commands",
      m: "All Keyboard Shortcuts and Commands...",
      f: () => actions.jupyter_actions?.show_keyboard_shortcuts(),
    },

    "enter command mode": {
      m: "Enter command mode",
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
    },

    "enter edit mode": {
      m: "Enter edit mode",
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
    },

    "extend selection below": {
      m: "Enter selection below cell",
      k: [
        { mode: "escape", shift: true, which: 74 },
        { mode: "escape", shift: true, which: 40 },
      ],
      f: () => actions.frame_actions?.extend_selection(1),
    },

    "find and replace": {
      i: "replace",
      m: "Find and Replace",
      k: [
        { mode: "escape", which: 70 },
        { alt: true, mode: "escape", which: 70 },
      ],
      f: () => actions.jupyter_actions?.show_find_and_replace(),
    },

    "global undo": {
      m: "Undo",
      i: "undo",
      d: "Global user-aware undo.  Undo the last change *you* made to the notebook.",
      k: [
        { alt: true, mode: "escape", which: 90 },
        { ctrl: true, mode: "escape", which: 90 },
      ],
      f: () => actions.jupyter_actions?.undo(),
    },

    "global redo": {
      m: "Redo",
      i: "repeat",
      d: "Global user-aware redo.  Redo the last change *you* made to the notebook.",
      k: [
        { alt: true, mode: "escape", which: 90, shift: true },
        { ctrl: true, mode: "escape", which: 90, shift: true },
        { alt: true, mode: "escape", which: 89 },
        { ctrl: true, mode: "escape", which: 89 },
      ],
      f: () => actions.jupyter_actions?.redo(),
    },

    "hide all line numbers": {
      i: "list-ol",
      m: "Hide Line Numbers for All Cells",
      f: () => actions.jupyter_actions?.set_line_numbers(false),
    },

    "hide header": {
      m: "Hide header",
      f: () => actions.jupyter_actions?.set_header_state(true),
    },

    "insert cell above": {
      m: "Insert Cell Above",
      i: "arrow-circle-up",
      k: [{ mode: "escape", which: 65 }],
      f: () => {
        actions.frame_actions?.insert_cell(-1);
      },
    },

    "insert cell below": {
      i: "arrow-circle-down",
      m: "Insert Cell Below",
      k: [{ mode: "escape", which: 66 }],
      f: () => {
        actions.frame_actions?.insert_cell(1);
      },
    },

    "insert image": {
      i: "image",
      b: "Image",
      m: "Insert Images in Markdown Cell",
      f: () => actions.frame_actions?.insert_image(),
    },

    "interrupt kernel": {
      i: "stop",
      b: "Stop",
      m: "Interrupt Kernel",
      k: [{ mode: "escape", which: 73, twice: true }],
      f: () => actions.jupyter_actions?.signal("SIGINT"),
    },

    "merge cell with next cell": {
      m: "Merge Cell Below",
      f: () => actions.frame_actions?.merge_cell_below(),
    },

    "merge cell with previous cell": {
      m: "Merge Cell Above",
      f: () => actions.frame_actions?.merge_cell_above(),
    },

    "merge cells": {
      m: "Merge Selected Cells",
      k: [{ mode: "escape", shift: true, which: 77 }],
      f: () => actions.frame_actions?.merge_selected_cells(),
    },

    "merge selected cells": {
      // why is this in jupyter; it's the same as the above?
      m: "Merge selected cells",
      f: () => actions.frame_actions?.merge_selected_cells(),
    },

    "move cell down": {
      i: "arrow-down",
      m: "Move Selected Cells Down",
      k: [{ alt: true, mode: "escape", which: 40 }],
      f: () => actions.frame_actions?.move_selected_cells(1),
    },

    "move cell up": {
      i: "arrow-up",
      m: "Move Selected Cells Up",
      k: [{ alt: true, mode: "escape", which: 38 }],
      f: () => actions.frame_actions?.move_selected_cells(-1),
    },

    "move cursor down": {
      m: "Move cursor down",
      f: () => actions.frame_actions?.move_edit_cursor(1),
    },

    "move cursor up": {
      m: "Move cursor up",
      f: () => actions.frame_actions?.move_edit_cursor(-1),
    },

    "new notebook": {
      m: "New...",
      f: () => actions.jupyter_actions?.file_new(),
    },

    "nbconvert ipynb": {
      i: "jupyter",
      m: "Notebook (.ipynb)",
      f() {
        actions.jupyter_actions?.save();
        actions.jupyter_actions?.file_action("download");
      },
    },

    "nbconvert asciidoc": {
      i: "file-code",
      m: "AsciiDoc (.asciidoc)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("asciidoc"),
    },

    "nbconvert python": {
      i: "python",
      m: "Python (.py)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("python"),
    },

    "nbconvert classic html": {
      i: "html5",
      m: "HTML via Classic nbconvert (.html)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("classic-html"),
    },

    "nbconvert classic pdf": {
      i: "file-pdf",
      m: "PDF via Classic nbconvert and Chrome (.pdf)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("classic-pdf"),
    },

    "nbconvert lab html": {
      i: "html5",
      m: "HTML via JupyterLab nbconvert (.html)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("lab-html"),
    },

    "nbconvert lab pdf": {
      i: "file-pdf",
      m: "PDF via JupyterLab nbconvert and Chrome (.pdf)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("lab-pdf"),
    },

    "nbconvert cocalc html": {
      i: "html5",
      m: "HTML (.html)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("cocalc-html"),
    },

    "nbconvert markdown": {
      i: "markdown",
      m: "Markdown (.md)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("markdown"),
    },

    "nbconvert rst": {
      i: "code",
      m: "reST (.rst)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("rst"),
    },

    "nbconvert slides": {
      i: "slides",
      m: "Slideshow server via nbconvert",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("slides"),
    },

    slideshow: {
      i: "slides",
      m: "Slideshow",
      f: () => actions.editor_actions?.show_revealjs_slideshow(),
    },

    "table of contents": {
      m: "Table of Contents",
      f: () => actions.editor_actions?.show_table_of_contents(),
    },

    "nbconvert tex": {
      i: "tex",
      m: "LaTeX (.tex)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("latex"),
    },

    "nbconvert cocalc pdf": {
      i: "file-pdf",
      m: "PDF (.pdf)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("cocalc-pdf"),
    },

    "nbconvert latex pdf": {
      i: "tex",
      m: "PDF via LaTeX (.pdf)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("pdf"),
    },

    "nbconvert script": {
      i: "code-outlined",
      m: "Executable Script",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("script"),
    },

    "nbconvert sagews": {
      i: "sagemath",
      m: "Sage Worksheet (.sagews)",
      f: () => actions.jupyter_actions?.show_nbconvert_dialog("sagews"),
    },

    "nbgrader validate": {
      i: "graduation-cap",
      t: "Restart notebook and run all cells to validate that it works.",
      m: "Validate",
      menu: "Validate",
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
      t: "Generate the student version of this document, which strips out the extra instructor tests and cells.",
      m: "Generate student version...",
      menu: "Generate student version...",
      b: "Generate",
      f: () => actions.jupyter_actions?.nbgrader_actions.confirm_assign(),
    },

    "open file": {
      m: "Open...",
      f: () => actions.jupyter_actions?.file_open(),
    },

    "paste cell above": {
      m: "Paste Cells Above",
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
      m: "Paste Cells Below",
      f: () => actions.frame_actions?.paste_cells(1),
    },

    "paste cell and replace": {
      // jupyter doesn't have this but it's normal paste behavior!
      i: "paste",
      m: "Paste Cells and Replace",
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
      m: "Set Kernel to None...",
      t: "Set the notebook so that it doesn't have any kernel set at all.",
      f: () => actions.jupyter_actions?.confirm_remove_kernel(),
    },

    "refresh kernels": {
      i: "refresh",
      m: "Refresh Kernel List",
      f: () => actions.jupyter_actions?.fetch_jupyter_kernels(),
    },

    "custom kernel": {
      i: "external-link",
      m: "How to Create a Custom Kernel...",
      t: "Show tutorial for how to create your own custom Jupyter kernel and use it here.",
      f: () => actions.jupyter_actions?.custom_jupyter_kernel_docs(),
    },

    "rename notebook": {
      m: "Rename...",
      f: () => actions.jupyter_actions?.file_action("rename"),
    },

    "restart kernel": {
      m: "Restart kernel",
      b: "Restart",
      f: () => actions.jupyter_actions?.restart(),
    },

    "restart kernel and clear output": {
      m: "Restart kernel and clear output",
      f() {
        actions.jupyter_actions?.restart();
        actions.jupyter_actions?.clear_all_outputs();
      },
    },

    "restart kernel and run all cells": {
      m: "Restart Kernel and Run All Cells",
      i: "forward",
      b: "Run All",
      async f() {
        actions.frame_actions?.set_all_md_cells_not_editing();
        await actions.jupyter_actions?.restart();
        actions.jupyter_actions?.run_all_cells();
      },
    },

    "run all cells": {
      m: "Run All Cells",
      i: "forward",
      f: () => {
        actions.frame_actions?.set_all_md_cells_not_editing();
        actions.jupyter_actions?.run_all_cells();
      },
    },

    "run all cells above": {
      i: RUN_ALL_CELLS_ABOVE_ICON,
      m: "Run All Above Selected Cell",
      f: () => actions.frame_actions?.run_all_above(),
    },

    "run all cells below": {
      i: RUN_ALL_CELLS_BELOW_ICON,
      ir: "90",
      m: "Run Selected Cell and All Below",
      f: () => actions.frame_actions?.run_all_below(),
    },

    "run cell and insert below": {
      i: "step-forward",
      m: "Run Selected Cells and Insert Below",
      b: "Run +",
      t: "Run all cells that are currently selected. Insert a new cell after the last one.",
      k: [{ which: 13, alt: true }],
      f: () =>
        actions.frame_actions?.run_selected_cells_and_insert_new_cell_below(),
    },

    // NOTE: This entry *must* be below "run cell and insert below", since
    // the meta has to take precedence over the alt (which is also meta automatically
    // on a mac). https://github.com/sagemathinc/cocalc/issues/7000
    "run cell": {
      i: "play",
      m: "Run Selected Cells and Do not Advance",
      b: "Stay",
      t: "Run all cells that are currently selected. Do not move the selection.",
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
      m: "Run Selected Cells",
      b: "Run",
      k: [{ which: 13, shift: true }],
      f() {
        actions.frame_actions?.shift_enter_run_selected_cells();
        actions.frame_actions?.scroll("cell visible");
      },
    },

    "run current cell and select next": {
      i: "step-forward",
      m: "Run Current Cell",
      b: "Run",
      f() {
        actions.frame_actions?.shift_enter_run_current_cell();
        actions.frame_actions?.scroll("cell visible");
      },
    },

    "save notebook": {
      m: "Save",
      k: [
        { which: 83, alt: true },
        { which: 83, ctrl: true },
      ],
      f: () => actions.jupyter_actions?.save(),
    },

    "scroll cell visible": {
      m: "Scroll Selected Cell Into View",
      f: () => actions.frame_actions?.scroll("cell visible"),
    },

    "scroll notebook down": {
      m: "Scroll Notebook Down",
      k: [{ mode: "escape", which: 32 }],
      f: () => actions.frame_actions?.scroll("list down"),
    },

    "scroll notebook up": {
      m: "Scroll Notebook Up",
      k: [{ mode: "escape", shift: true, which: 32 }],
      f: () => actions.frame_actions?.scroll("list up"),
    },

    "select all cells": {
      i: "menu-outlined",
      m: "Select All Cells",
      k: [
        { alt: true, mode: "escape", which: 65 },
        { ctrl: true, mode: "escape", which: 65 },
      ],
      f: () => actions.frame_actions?.select_all_cells(),
    },

    "deselect all cells": {
      i: "ban",
      m: "Deselect All Cells",
      f: () => actions.frame_actions?.unselect_all_cells(),
    },

    "select next cell": {
      m: "Select Next Cell",
      k: [
        { which: 40, mode: "escape" },
        { which: 74, mode: "escape" },
      ],
      f() {
        actions.frame_actions?.move_cursor(1);
        actions.frame_actions?.unselect_all_cells();
        actions.frame_actions?.scroll("cell visible");
      },
    },

    "select previous cell": {
      m: "Select Previous Cell",
      k: [
        { which: 38, mode: "escape" },
        { which: 75, mode: "escape" },
      ],
      f() {
        actions.frame_actions?.move_cursor(-1);
        actions.frame_actions?.unselect_all_cells();
        actions.frame_actions?.scroll("cell visible");
      },
    },

    "show all line numbers": {
      i: "list-ol",
      m: "Show Line Numbers for All Cells",
      f: () => actions.jupyter_actions?.set_line_numbers(true),
    },

    "show command palette": {
      m: "Show command palette...",
      k: [
        { alt: true, shift: true, which: 80 },
        { ctrl: true, shift: true, which: 80 },
      ],
      f: () => actions.jupyter_actions?.show_keyboard_shortcuts(),
    },

    "show header": {
      m: "Show header",
      f: () => actions.jupyter_actions?.set_header_state(false),
    },

    "show keyboard shortcuts": {
      i: "keyboard",
      m: "Show keyboard shortcuts...",
      k: [{ mode: "escape", which: 72 }],
      f: () => actions.jupyter_actions?.show_keyboard_shortcuts(),
    },

    "shutdown kernel": {
      i: "PoweroffOutlined",
      m: "Shutdown kernel",
      f: () => actions.jupyter_actions?.shutdown(),
    },

    "split cell at cursor": {
      i: "horizontal-split",
      m: "Split Cell",
      k: [
        { ctrl: true, shift: true, which: 189 },
        { ctrl: true, key: ";", which: 186 },
      ],
      f() {
        actions.frame_actions?.set_mode("escape");
        actions.frame_actions?.split_current_cell();
      },
    },

    "switch to classical notebook": {
      m: "Switch to classical notebook...",
      f: () => actions.jupyter_actions?.switch_to_classical_notebook(),
    },

    "tab key": {
      k: [{ mode: "escape", which: 9 }],
      m: "Tab Key (completion)",
      b: "Tab",
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
      m: "TimeTravel",
      f: () => actions.jupyter_actions?.show_history_viewer(),
    },

    "toggle all cells output collapsed": {
      m: "Toggle Collapsed Output of All Cells",
      f: () => actions.jupyter_actions?.toggle_all_outputs("collapsed"),
    },

    "toggle all line numbers": {
      i: "list-ol",
      m: "Toggle Line Numbers of All Cells",
      k: [{ mode: "escape", shift: true, which: 76 }],
      f: () => actions.jupyter_actions?.toggle_line_numbers(),
    },

    "toggle cell line numbers": {
      i: "list-ol",
      m: "Toggle Line Numbers of Selected Cells",
      k: [{ mode: "escape", which: 76 }],
      f: () => actions.jupyter_actions?.toggle_cell_line_numbers(id()),
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
    },

    /* "toggle rtl layout": {
      // TODO
      m: "Toggle RTL layout"
    }, */

    "toggle toolbar": {
      m: "Toggle toolbar",
      f: () => actions.jupyter_actions?.toggle_toolbar(),
    },

    "trust notebook": {
      m: "Trust notebook",
      f: () => actions.jupyter_actions?.trust_notebook(),
    },

    //     "undo cell deletion": {
    //       m: "Undo cell deletion",
    //       k: [{ mode: "escape", which: 90 }],
    //       f: () => actions.jupyter_actions?.undo(),
    //     },

    "zoom in": {
      m: "Zoom in",
      k: [{ ctrl: true, shift: true, which: 190 }],
      f: () => actions.frame_actions?.zoom(1),
    },

    "zoom out": {
      m: "Zoom out",
      k: [{ ctrl: true, shift: true, which: 188 }],
      f: () => actions.frame_actions?.zoom(-1),
    },

    "write protect": {
      i: "lock",
      m: "Write Protect",
      b: "Protect",
      t: "Make it so selected cells cannot be edited or deleted.",
      f: () => actions.frame_actions?.write_protect_selected_cells(true),
    },

    "delete protect": {
      i: "ban",
      m: "Delete Protect",
      b: "Protect",
      t: "Make it so selected cells cannot be deleted.",
      f: () => actions.frame_actions?.delete_protect_selected_cells(true),
    },

    "remove write protect": {
      i: "lock-open",
      m: "Remove Write Protect",
      t: "Remove write protection from selected cells.",
      f: () => actions.frame_actions?.write_protect_selected_cells(false),
    },

    "remove delete protect": {
      i: "check-circle",
      m: "Remove Delete Protect",
      t: "Remove delete protection from selected cells.",
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
      m: "Change Kernel...",
      t: "Select from any of the available kernels.",
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
    },

    "help - nbgrader in cocalc": {
      i: "external-link",
      m: "NBgrader in CoCalc",
      f: () => {
        open_new_tab("https://doc.cocalc.com/teaching-nbgrader.html");
      },
    },
    "help - markdown": {
      i: "external-link",
      m: "Markdown in CoCalc",
      f: () => {
        open_new_tab("https://doc.cocalc.com/markdown.html");
      },
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
