/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for editing Jupyter notebooks via a frame tree.
*/

import { set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import { CellNotebook } from "./cell-notebook/cell-notebook";
import { RawIPynb } from "./raw-ipynb";
import JSONIPynb from "./json-ipynb";
import { Slideshow } from "./slideshow-revealjs/slideshow";
import { TableOfContents } from "./table-of-contents";
import { Introspect } from "./introspect/introspect";
const SNIPPET_ICON_NAME =
  require("@cocalc/frontend/assistant/common").ICON_NAME;
import { JupyterSnippets } from "./snippets";
import {
  addCommands,
  addMenus,
  Command,
} from "@cocalc/frontend/frame-editors/frame-tree/commands";
import { commands, AllActions } from "@cocalc/frontend/jupyter/commands";
import { shortcut_to_string } from "@cocalc/frontend/jupyter/keyboard-shortcuts";

const jupyterCommands = set([
  "chatgpt",
  "print",
  "set_zoom",
  "decrease_font_size",
  "increase_font_size",
  "save",
  "time_travel",
  "cut",
  "paste",
  "copy",
  "undo",
  "redo",
  "halt_jupyter",
  "show_table_of_contents",
  "guide",
  "shell",
  "terminal",
  "help",
  "compute_server",
]);

export const EDITOR_SPEC = {
  jupyter_cell_notebook: {
    short: "Jupyter",
    name: "Jupyter Notebook",
    icon: "ipynb",
    component: CellNotebook,
    buttons: jupyterCommands,
    customize_buttons: {
      guide: {
        label: "Snippets",
        icon: SNIPPET_ICON_NAME,
        title: "Open a panel containing code snippets.",
      },
      shell: {
        label: "Jupyter Console",
        icon: "ipynb",
        title:
          "Open the Jupyter command line console connected to the running kernel.",
      },
    },
  } as EditorDescription,
  commands_guide: {
    short: "Snippets",
    name: "Snippets",
    icon: SNIPPET_ICON_NAME,
    component: JupyterSnippets,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  jupyter_slideshow_revealjs: {
    short: "Slideshow",
    name: "Slideshow (Reveal.js)",
    icon: "slides",
    component: Slideshow,
    buttons: set(["build"]),
  } as EditorDescription,
  jupyter_table_of_contents: {
    short: "Contents",
    name: "Table of Contents",
    icon: "align-right",
    component: TableOfContents,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  introspect: {
    short: "Introspect",
    name: "Introspection",
    icon: "info",
    component: Introspect,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  terminal,
  time_travel,
  jupyter_json: {
    short: "JSON view",
    name: "Raw JSON viewer",
    icon: "js-square",
    component: JSONIPynb,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  jupyter_raw: {
    short: "JSON edit",
    name: "Raw JSON editor",
    icon: "markdown",
    component: RawIPynb,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
};

const MENUS = {
  run: {
    label: "Run",
    pos: 4,
    groups: [
      "jupyter-run-cells",
      "jupyter-run-cells-2",
      "jupyter-run-cells-adjacent",
      "jupyter-render-markdown-cells",
      "jupyter-run-cells-all",
    ],
  },
  kernel: {
    label: "Kernel",
    pos: 5,
    groups: ["jupyter-kernel-control"],
  },
};

const COMMANDS = {
  "run cell and select next": "jupyter-run-cells",
  "run cell and insert below": "jupyter-run-cells-2",
  "run cell": "jupyter-run-cells-2",
  "run all cells above": "jupyter-run-cells-adjacent",
  "run all cells below": "jupyter-run-cells-adjacent",
  "run all cells": "jupyter-run-cells-all",
  "confirm restart kernel and run all cells": "jupyter-run-cells-all",
};

function initMenus() {
  // organization of the commands into groups
  addMenus(MENUS);

  // the commands
  const allActions: AllActions = {};
  const allCommands = commands(allActions);
  const C: { [name: string]: Command } = {};
  for (const name in COMMANDS) {
    const cmd = allCommands[name];
    const cmdName = `jupyter-${name}`;
    C[cmdName] = {
      title: cmd.t,
      label: cmd.m,
      group: COMMANDS[name],
      icon: cmd.i,
      keyboard: cmd.k ? cmd.k.map(shortcut_to_string).join(", ") : undefined,
      onClick: ({ props }) => {
        allActions.frame_actions = props.actions.frame_actions?.[props.id];
        allActions.jupyter_actions = props.actions.jupyter_actions;
        allActions.editor_actions = props.actions;
        cmd.f();
      },
    };
    jupyterCommands[cmdName] = true;
  }
  console.log("adding commands", C);
  addCommands(C);
}

initMenus();

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "JupyterNotebook",
});

/*
addCommands({
  "jupyter-run-cell": {
    title: "Run all cells that are currently selected",
    label: "Run Selected Cells",
    group: "jupyter-cell-run",
    icon: "step-forward",
    keyboard: `ctrl + enter, ${IS_MACOS ? "⌘ + enter" : ""} `,
    onClick: ({ props }) => {
      const frame_actions = props.actions.frame_actions?.[props.id];
      frame_actions.run_selected_cells();
      frame_actions.set_mode("escape");
      frame_actions.scroll("cell visible");
    },
  },
  "jupyter-cell-type": {
    label: "Cell Type",
    group: "jupyter-cell-type",
    icon: "code-outlined",
    children: [
      {
        keyboard: "Y",
        label: "Code",
        icon: "code-outlined",
        onClick: ({ props }) => {
          const frame_actions = props.actions.frame_actions?.[props.id];
          frame_actions?.set_selected_cell_type("code");
        },
      },
      {
        keyboard: "M",
        label: "Markdown",
        icon: "markdown",
        onClick: ({ props }) => {
          const frame_actions = props.actions.frame_actions?.[props.id];
          frame_actions?.set_selected_cell_type("markdown");
        },
      },
      {
        keyboard: "R",
        label: "Raw NBConvert",
        icon: "file-archive",
        onClick: ({ props }) => {
          const frame_actions = props.actions.frame_actions?.[props.id];
          frame_actions?.set_selected_cell_type("raw");
        },
      },
    ],
  },
  "jupyter-kernel-restart": {
    keyboard: "0, 0",
    label: "Restart",
    title:
      "Restart the current Jupyter kernel.  There is a kernel pool, so restarting is fast, but you may need to restart twice if you installed a new package.",
    group: "jupyter-kernel-control",
    icon: "refresh",
    onClick: ({ props }) => {
      const jupyter_actions = props.actions.jupyter_actions;
      jupyter_actions?.confirm_restart();
    },
  },
});
*/
