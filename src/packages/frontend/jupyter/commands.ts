/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Comprehensive list of Jupyter notebook (version 5) commands
we support and how they work.
*/

import { FORMAT_SOURCE_ICON } from "@cocalc/frontend/frame-editors/frame-tree/config";
import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";
import { JupyterEditorActions } from "../frame-editors/jupyter-editor/actions";
import { NotebookMode } from "./types";
import { IconName } from "@cocalc/frontend/components";

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
  i?: IconName;
  k?: KeyboardCommand[]; // keyboard commands
  m?: string; // fuller description for use in menus and commands
  menu?: string; // alternative to m just for dropdown menu
  d?: string; // even more extensive description (e.g., for a tooltip).
  f: Function; // function that implements command.
}

export function commands(
  jupyter_actions: JupyterActions,
  frameActions: { current?: NotebookFrameActions },
  editor_actions: JupyterEditorActions
): { [name: string]: CommandDescription } {
  if (jupyter_actions == null || editor_actions == null) {
    // Typescript should check this, but just in case
    throw Error("actions must be defined");
  }
  if (frameActions.current == null) {
    return {};
  }

  const frame_actions: NotebookFrameActions = frameActions.current;

  function id(): string {
    return frame_actions.store.get("cur_id");
  }

  return {
    "cell toolbar none": {
      m: "No cell toolbar",
      menu: "None",
      f: () => jupyter_actions.cell_toolbar(),
    },

    "cell toolbar attachments": {
      m: "Attachments toolbar",
      menu: "Attachments",
      f: () => jupyter_actions.cell_toolbar("attachments"),
    },

    "cell toolbar tags": {
      m: "Edit cell tags toolbar",
      menu: "Tags",
      f: () => jupyter_actions.cell_toolbar("tags"),
    },

    "cell toolbar metadata": {
      m: "Edit custom metadata toolbar",
      menu: "Metadata",
      f: () => jupyter_actions.cell_toolbar("metadata"),
    },

    "cell toolbar create_assignment": {
      m: "Create assignment (nbgrader) toolbar",
      menu: "Create assignment (nbgrader)",
      f: () => jupyter_actions.cell_toolbar("create_assignment"),
    },

    "cell toolbar slideshow": {
      m: "Slideshow toolbar",
      menu: "Slideshow",
      f: () => jupyter_actions.cell_toolbar("slideshow"),
    },

    "change cell to code": {
      m: "Change to code",
      k: [{ which: 89, mode: "escape" }],
      f: () => frame_actions.set_selected_cell_type("code"),
    },

    "change cell to heading 1": {
      m: "Heading 1",
      k: [{ which: 49, mode: "escape" }],
      f: () => frame_actions.change_cell_to_heading(id(), 1),
    },
    "change cell to heading 2": {
      m: "Heading 2",
      k: [{ which: 50, mode: "escape" }],
      f: () => frame_actions.change_cell_to_heading(id(), 2),
    },
    "change cell to heading 3": {
      m: "Heading 3",
      k: [{ which: 51, mode: "escape" }],
      f: () => frame_actions.change_cell_to_heading(id(), 3),
    },
    "change cell to heading 4": {
      m: "Heading 4",
      k: [{ which: 52, mode: "escape" }],
      f: () => frame_actions.change_cell_to_heading(id(), 4),
    },
    "change cell to heading 5": {
      m: "Heading 5",
      k: [{ which: 53, mode: "escape" }],
      f: () => frame_actions.change_cell_to_heading(id(), 5),
    },
    "change cell to heading 6": {
      m: "Heading 6",
      k: [{ which: 54, mode: "escape" }],
      f: () => frame_actions.change_cell_to_heading(id(), 6),
    },

    "change cell to markdown": {
      m: "Change to markdown",
      k: [{ which: 77, mode: "escape" }],
      f: () => frame_actions.set_selected_cell_type("markdown"),
    },

    "change cell to raw": {
      m: "Change to raw",
      k: [{ which: 82, mode: "escape" }],
      f: () => frame_actions.set_selected_cell_type("raw"),
    },

    "clear all cells output": {
      m: "Clear all output",
      f: () => jupyter_actions.clear_all_outputs(),
    },

    "clear cell output": {
      m: "Clear output",
      f: () => frame_actions.clear_selected_outputs(),
    },

    "close and halt": {
      i: "PoweroffOutlined",
      m: "Close and halt",
      f: () => jupyter_actions.confirm_close_and_halt(),
    },

    "close pager": {
      m: "Close pager",
      k: [{ which: 27, mode: "escape" }],
      f: () => {
        editor_actions.close_introspect();
      },
    },

    "confirm restart kernel": {
      m: "Restart kernel...",
      i: "refresh",
      k: [{ mode: "escape", which: 48, twice: true }],
      f: () => jupyter_actions.confirm_restart(),
    },

    "confirm halt kernel": {
      m: "Halt kernel...",
      i: "stop",
      f: () => jupyter_actions.confirm_halt_kernel(),
    },

    "confirm restart kernel and clear output": {
      m: "Restart and clear output...",
      menu: "Clear output...",
      f: () => jupyter_actions.restart_clear_all_output(),
    },

    "confirm restart kernel and run all cells": {
      m: "Restart and run all...",
      menu: "Run all...",
      i: "forward",
      f: () => jupyter_actions.restart_and_run_all(),
    },

    "confirm restart kernel and run all cells without halting on error": {
      m: "Run all (do not stop on errors)...",
      menu: "Restart and run all (do not stop on errors)...",
      i: "run",
      k: [{ which: 13, ctrl: true, shift: true }],
      f: () => jupyter_actions.restart_and_run_all_no_halt(),
    },

    "confirm shutdown kernel": {
      m: "Shutdown kernel...",
      async f(): Promise<void> {
        const choice = await jupyter_actions.confirm_dialog({
          title: "Shutdown kernel?",
          body: "Do you want to shutdown the current kernel?  All variables will be lost.",
          choices: [
            { title: "Continue running" },
            { title: "Shutdown", style: "danger", default: true },
          ],
        });
        if (choice === "Shutdown") {
          jupyter_actions.shutdown();
        }
      },
    },

    "copy cell": {
      i: "files",
      m: "Copy cells",
      k: [{ mode: "escape", which: 67 }],
      f: () => frame_actions.copy_selected_cells(),
    },

    //"copy cell attachments": undefined, // no clue what this means or is for... but I can guess...

    "cut cell": {
      i: "scissors",
      m: "Cut cells",
      k: [{ mode: "escape", which: 88 }],
      f: () => frame_actions.cut_selected_cells(),
    },

    //"cut cell attachments": undefined, // no clue

    "delete cell": {
      // jupyter has this but with d,d as shortcut, since they have no undo.
      m: "Delete cells",
      k: [{ mode: "escape", which: 68, twice: true }],
      f: () => frame_actions.delete_selected_cells(),
    },

    "duplicate notebook": {
      m: "Make a copy...",
      f: () => jupyter_actions.file_action("duplicate"),
    },

    "edit keyboard shortcuts": {
      m: "Keyboard shortcuts and commands...",
      f: () => jupyter_actions.show_keyboard_shortcuts(),
    },

    "enter command mode": {
      k: [
        { which: 27, mode: "edit" },
        { ctrl: true, mode: "edit", which: 77 },
        { alt: true, mode: "edit", which: 77 },
      ],
      f() {
        if (
          frame_actions.store.get("mode") === "escape" &&
          jupyter_actions.store.get("introspect") != null
        ) {
          jupyter_actions.clear_introspect();
        }

        if (
          jupyter_actions.store.getIn(["cm_options", "options", "keyMap"]) ===
          "vim"
        ) {
          // Vim mode is trickier...
          if (
            frame_actions.store.get("cur_cell_vim_mode", "escape") !== "escape"
          ) {
            return;
          }
        }
        frame_actions.set_mode("escape");
      },
    },

    "enter edit mode": {
      k: [{ which: 13, mode: "escape" }],
      f: () => {
        frame_actions.unhide_current_input();
        frame_actions.set_mode("edit");
      },
    },

    "extend selection above": {
      k: [
        { mode: "escape", shift: true, which: 75 },
        { mode: "escape", shift: true, which: 38 },
      ],
      f: () => frame_actions.extend_selection(-1),
    },

    "extend selection below": {
      k: [
        { mode: "escape", shift: true, which: 74 },
        { mode: "escape", shift: true, which: 40 },
      ],
      f: () => frame_actions.extend_selection(1),
    },

    "find and replace": {
      m: "Find and replace",
      k: [
        { mode: "escape", which: 70 },
        { alt: true, mode: "escape", which: 70 },
      ],
      f: () => jupyter_actions.show_find_and_replace(),
    },

    "global undo": {
      m: "Undo",
      i: "undo",
      d: "Global user-aware undo.  Undo the last change *you* made to the notebook.",
      k: [
        { alt: true, mode: "escape", which: 90 },
        { ctrl: true, mode: "escape", which: 90 },
      ],
      f: () => jupyter_actions.undo(),
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
      f: () => jupyter_actions.redo(),
    },

    "hide all line numbers": {
      m: "Hide all line numbers",
      f: () => jupyter_actions.set_line_numbers(false),
    },

    "hide header": {
      m: "Hide header",
      f: () => jupyter_actions.set_header_state(true),
    },

    "hide toolbar": {
      m: "Hide toolbar",
      f: () => jupyter_actions.set_toolbar_state(false),
    },

    //ignore: undefined, // no clue what this means

    "insert cell above": {
      m: "Insert cell above",
      k: [{ mode: "escape", which: 65 }],
      f: () => frame_actions.insert_cell(-1),
    },

    "insert cell below": {
      i: "plus",
      m: "Insert cell below",
      k: [{ mode: "escape", which: 66 }],
      f: () => frame_actions.insert_cell(1),
    },

    "insert image": {
      m: "Insert images in selected markdown cell...",
      f: () => frame_actions.insert_image(),
    },

    "interrupt kernel": {
      i: "stop",
      m: "Interrupt kernel",
      k: [{ mode: "escape", which: 73, twice: true }],
      f: () => jupyter_actions.signal("SIGINT"),
    },

    "merge cell with next cell": {
      m: "Merge cell below",
      f: () => frame_actions.merge_cell_below(),
    },

    "merge cell with previous cell": {
      m: "Merge cell above",
      f: () => frame_actions.merge_cell_above(),
    },

    "merge cells": {
      m: "Merge selected cells",
      k: [{ mode: "escape", shift: true, which: 77 }],
      f: () => frame_actions.merge_selected_cells(),
    },

    "merge selected cells": {
      // why is this in jupyter; it's the same as the above?
      m: "Merge selected cells",
      f: () => frame_actions.merge_selected_cells(),
    },

    "move cell down": {
      i: "arrow-down",
      m: "Move cells down",
      k: [{ alt: true, mode: "escape", which: 40 }],
      f: () => frame_actions.move_selected_cells(1),
    },

    "move cell up": {
      i: "arrow-up",
      m: "Move cells up",
      k: [{ alt: true, mode: "escape", which: 38 }],
      f: () => frame_actions.move_selected_cells(-1),
    },

    "move cursor down": {
      m: "Move cursor down",
      f: () => frame_actions.move_edit_cursor(1),
    },

    "move cursor up": {
      m: "Move cursor up",
      f: () => frame_actions.move_edit_cursor(-1),
    },

    "new notebook": {
      m: "New...",
      f: () => jupyter_actions.file_new(),
    },

    "nbconvert ipynb": {
      m: "Notebook (.ipynb)...",
      f() {
        jupyter_actions.save();
        jupyter_actions.file_action("download");
      },
    },

    "nbconvert asciidoc": {
      m: "AsciiDoc (.asciidoc)...",
      f: () => jupyter_actions.show_nbconvert_dialog("asciidoc"),
    },

    "nbconvert python": {
      m: "Python (.py)...",
      f: () => jupyter_actions.show_nbconvert_dialog("python"),
    },

    "nbconvert classic html": {
      m: "HTML via Classic nbconvert (.html)...",
      f: () => jupyter_actions.show_nbconvert_dialog("classic-html"),
    },

    "nbconvert classic pdf": {
      m: "PDF via Classic nbconvert and Chrome (.pdf)...",
      f: () => jupyter_actions.show_nbconvert_dialog("classic-pdf"),
    },

    "nbconvert lab html": {
      m: "HTML via JupyterLab nbconvert (.html)...",
      f: () => jupyter_actions.show_nbconvert_dialog("lab-html"),
    },

    "nbconvert lab pdf": {
      m: "PDF via JupyterLab nbconvert and Chrome (.pdf)...",
      f: () => jupyter_actions.show_nbconvert_dialog("lab-pdf"),
    },

    "nbconvert cocalc html": {
      m: "HTML (.html)...",
      f: () => jupyter_actions.show_nbconvert_dialog("cocalc-html"),
    },

    "nbconvert markdown": {
      m: "Markdown (.md)...",
      f: () => jupyter_actions.show_nbconvert_dialog("markdown"),
    },

    "nbconvert rst": {
      m: "reST (.rst)...",
      f: () => jupyter_actions.show_nbconvert_dialog("rst"),
    },

    "nbconvert slides": {
      m: "Slideshow server via nbconvert...",
      f: () => jupyter_actions.show_nbconvert_dialog("slides"),
    },

    slideshow: {
      m: "Slideshow",
      f: () => editor_actions.show_revealjs_slideshow(),
    },

    "table of contents": {
      m: "Table of Contents",
      f: () => editor_actions.show_table_of_contents(),
    },

    "nbconvert tex": {
      m: "LaTeX (.tex)...",
      f: () => jupyter_actions.show_nbconvert_dialog("latex"),
    },

    "nbconvert cocalc pdf": {
      m: "PDF (.pdf)...",
      f: () => jupyter_actions.show_nbconvert_dialog("cocalc-pdf"),
    },

    "nbconvert latex pdf": {
      m: "PDF via LaTeX (.pdf)...",
      f: () => jupyter_actions.show_nbconvert_dialog("pdf"),
    },

    "nbconvert script": {
      m: "Executable script...",
      f: () => jupyter_actions.show_nbconvert_dialog("script"),
    },

    "nbconvert sagews": {
      m: "Sage worksheet (.sagews)...",
      f: () => jupyter_actions.show_nbconvert_dialog("sagews"),
    },

    "nbgrader validate": {
      m: "Restart and validate...",
      menu: "Validate...",
      f: () => jupyter_actions.nbgrader_actions.confirm_validate(),
    },

    "nbgrader assign": {
      m: "Create student version...",
      menu: "Generate student version...",
      f: () => jupyter_actions.nbgrader_actions.confirm_assign(),
    },

    "open file": {
      m: "Open...",
      f: () => jupyter_actions.file_open(),
    },

    "paste cell above": {
      m: "Paste cells above",
      k: [
        { mode: "escape", shift: true, which: 86 },
        { mode: "escape", shift: true, ctrl: true, which: 86 },
        { mode: "escape", shift: true, alt: true, which: 86 },
      ],
      f: () => frame_actions.paste_cells(-1),
    },

    //"paste cell attachments": undefined, // TODO ? not sure what the motivation is...

    "paste cell below": {
      // jupyter has this with the keyboard shortcut for paste; clearly because they have no undo
      m: "Paste cells below",
      f: () => frame_actions.paste_cells(1),
    },

    "paste cell and replace": {
      // jupyter doesn't have this but it's supposed to be normal paste behavior
      i: "clipboard",
      m: "Paste cells & replace",
      k: [
        { mode: "escape", alt: true, which: 86 },
        { mode: "escape", which: 86 },
        { mode: "escape", ctrl: true, which: 86 },
      ],
      f() {
        if (frame_actions.store.get("sel_ids", { size: 0 }).size > 0) {
          frame_actions.paste_cells(0);
        } else {
          frame_actions.paste_cells(1);
        }
      },
    },

    "print preview": {
      m: "Print preview...",
      f: () => jupyter_actions.show_nbconvert_dialog("html"),
    },

    "refresh kernels": {
      m: "Refresh kernel list",
      f: () => jupyter_actions.fetch_jupyter_kernels(),
    },

    "custom kernel": {
      m: "How to create a custom kernel...",
      f: () => jupyter_actions.custom_jupyter_kernel_docs(),
    },

    "rename notebook": {
      m: "Rename...",
      f: () => jupyter_actions.file_action("rename"),
    },

    "restart kernel": {
      m: "Restart kernel",
      f: () => jupyter_actions.restart(),
    },

    "restart kernel and clear output": {
      m: "Restart kernel and clear output",
      f() {
        jupyter_actions.restart();
        jupyter_actions.clear_all_outputs();
      },
    },

    "restart kernel and run all cells": {
      m: "Restart and run all",
      async f() {
        await jupyter_actions.restart();
        jupyter_actions.run_all_cells();
      },
    },

    "run all cells": {
      m: "Run all",
      f: () => jupyter_actions.run_all_cells(),
    },

    "run all cells above": {
      m: "Run all above",
      f: () => frame_actions.run_all_above(),
    },

    "run all cells below": {
      m: "Run all below",
      f: () => frame_actions.run_all_below(),
    },

    "run cell": {
      m: "Run cells",
      k: [{ which: 13, ctrl: true }],
      f() {
        frame_actions.run_selected_cells();
        frame_actions.set_mode("escape");
        frame_actions.scroll("cell visible");
      },
    },

    "run cell and insert below": {
      m: "Run cells and insert cell below",
      k: [{ which: 13, alt: true }],
      f: () => frame_actions.run_selected_cells_and_insert_new_cell_below(),
    },

    "run cell and select next": {
      i: "step-forward",
      m: "Run cells and select below",
      k: [{ which: 13, shift: true }],
      f() {
        frame_actions.shift_enter_run_selected_cells();
        frame_actions.scroll("cell visible");
      },
    },

    "save notebook": {
      m: "Save",
      k: [
        { which: 83, alt: true },
        { which: 83, ctrl: true },
      ],
      f: () => jupyter_actions.save(),
    },

    "scroll cell visible": {
      f: () => frame_actions.scroll("cell visible"),
    },

    "scroll notebook down": {
      k: [{ mode: "escape", which: 32 }],
        f: () => frame_actions.scroll("list down"),
    },

    "scroll notebook up": {
      k: [{ mode: "escape", shift: true, which: 32 }],
      f: () => frame_actions.scroll("list up"),
    },

    "select all cells": {
      m: "Select all cells",
      k: [
        { alt: true, mode: "escape", which: 65 },
        { ctrl: true, mode: "escape", which: 65 },
      ],
      f: () => frame_actions.select_all_cells(),
    },

    "select next cell": {
      k: [
        { which: 40, mode: "escape" },
        { which: 74, mode: "escape" },
      ],
      f() {
        frame_actions.move_cursor(1);
        frame_actions.unselect_all_cells();
        frame_actions.scroll("cell visible");
      },
    },

    "select previous cell": {
      k: [
        { which: 38, mode: "escape" },
        { which: 75, mode: "escape" },
      ],
      f() {
        frame_actions.move_cursor(-1);
        frame_actions.unselect_all_cells();
        frame_actions.scroll("cell visible");
      },
    },

    "show all line numbers": {
      m: "Show all line numbers",
      f: () => jupyter_actions.set_line_numbers(true),
    },

    "show command palette": {
      m: "Show command palette...",
      k: [
        { alt: true, shift: true, which: 80 },
        { ctrl: true, shift: true, which: 80 },
      ],
      f: () => jupyter_actions.show_keyboard_shortcuts(),
    },

    "show header": {
      m: "Show header",
      f: () => jupyter_actions.set_header_state(false),
    },

    "show keyboard shortcuts": {
      i: "keyboard",
      m: "Show keyboard shortcuts...",
      k: [{ mode: "escape", which: 72 }],
      f: () => jupyter_actions.show_keyboard_shortcuts(),
    },

    "show toolbar": {
      m: "Show toolbar",
      f: () => jupyter_actions.set_toolbar_state(true),
    },

    "shutdown kernel": {
      m: "Shutdown kernel",
      f: () => jupyter_actions.shutdown(),
    },

    "split cell at cursor": {
      m: "Split cell",
      k: [
        { ctrl: true, shift: true, which: 189 },
        { ctrl: true, key: ";", which: 186 },
      ],
      f() {
        frame_actions.set_mode("escape");
        frame_actions.split_current_cell();
      },
    },

    "switch to classical notebook": {
      m: "Switch to classical notebook...",
      f: () => jupyter_actions.switch_to_classical_notebook(),
    },

    "tab key": {
      k: [{ mode: "escape", which: 9 }],
      m: "Tab key (completion)",
      i: "tab",
      f: () => frame_actions.tab_key(),
    },

    "shift+tab key": {
      k: [{ mode: "escape", shift: true, which: 9 }],
      m: "Shift+Tab introspection (show function docstring)",
      f: () => frame_actions.shift_tab_key(),
    },

    "time travel": {
      m: "TimeTravel",
      f: () => jupyter_actions.show_history_viewer(),
    },

    "toggle all cells output collapsed": {
      m: "Toggle all collapsed",
      f: () => jupyter_actions.toggle_all_outputs("collapsed"),
    },

    "toggle all cells output scrolled": {
      m: "Toggle all scrolled",
      f: () => jupyter_actions.toggle_all_outputs("scrolled"),
    },

    "toggle all line numbers": {
      m: "Toggle all line numbers",
      k: [{ mode: "escape", shift: true, which: 76 }],
      f: () => jupyter_actions.toggle_line_numbers(),
    },

    "toggle cell line numbers": {
      m: "Toggle cell line numbers",
      k: [{ mode: "escape", which: 76 }],
      f: () => jupyter_actions.toggle_cell_line_numbers(id()),
    },

    "toggle cell output collapsed": {
      m: "Toggle collapsed",
      k: [{ mode: "escape", which: 79 }],
      f: () => frame_actions.toggle_selected_outputs("collapsed"),
    },

    "toggle cell output scrolled": {
      m: "Toggle scrolled",
      k: [{ mode: "escape", which: 79, shift: true }],
      f: () => frame_actions.toggle_selected_outputs("scrolled"),
    },

    "toggle header": {
      m: "Toggle header",
      f: () => jupyter_actions.toggle_header(),
    },

    /* "toggle rtl layout": {
      // TODO
      m: "Toggle RTL layout"
    }, */

    "toggle toolbar": {
      m: "Toggle toolbar",
      f: () => jupyter_actions.toggle_toolbar(),
    },

    "trust notebook": {
      m: "Trust notebook",
      f: () => jupyter_actions.trust_notebook(),
    },

    "undo cell deletion": {
      m: "Undo cell deletion",
      k: [{ mode: "escape", which: 90 }],
      f: () => jupyter_actions.undo(),
    },

    "zoom in": {
      m: "Zoom in",
      k: [{ ctrl: true, shift: true, which: 190 }],
      f: () => frame_actions.zoom(1),
    },

    "zoom out": {
      m: "Zoom out",
      k: [{ ctrl: true, shift: true, which: 188 }],
      f: () => frame_actions.zoom(-1),
    },

    "write protect": {
      m: "Edit protect -- toggle whether cells are editable",
      f: () => frame_actions.toggle_write_protection_on_selected_cells(),
    },

    "delete protect": {
      m: "Delete protection -- toggle whether cells are deletable",
      f: () => frame_actions.toggle_delete_protection_on_selected_cells(),
    },

    protect: {
      m: "Protection -- toggle whether cells are editable and deletable",
      k: [
        { alt: true, which: 80 },
        { meta: true, which: 80 },
      ],
      f: () => {
        frame_actions.toggle_write_protection_on_selected_cells();
        frame_actions.toggle_delete_protection_on_selected_cells();
      },
    },

    /* NOTE:  JupyterLab sticks fricking 9 lines related to this
    functionality in the View menu.  I tried to implement this, but
    it is such bad UX, I couldn't bring myself to do it.  It's bad
    because: (1) the view menu should just show different ways of viewing
    the doc, not change it, (2) the edit menu is for editing, (3) having
    9 lines just for this means way more scrolling/searching in the menu.
    */
    "toggle hide input": {
      m: "Toggle hide input of cells",
      f: () => frame_actions.toggle_source_hidden(),
      k: [
        { alt: true, which: 72 },
        { meta: true, which: 72 },
      ],
    },

    "toggle hide output": {
      m: "Toggle hide output of cells",
      f: () => frame_actions.toggle_outputs_hidden(),
      k: [
        { alt: true, shift: true, which: 72 },
        { meta: true, shift: true, which: 72 },
      ],
    },

    "format cells": {
      i: FORMAT_SOURCE_ICON,
      m: "Format selected cells",
      f: () => frame_actions.format_selected_cells(),
    },

    "format all cells": {
      i: FORMAT_SOURCE_ICON,
      m: "Format all cells",
      f: () => frame_actions.format_all_cells(),
    },
  };
}
