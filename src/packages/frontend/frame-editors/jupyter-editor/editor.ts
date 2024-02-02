/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for editing Jupyter notebooks via a frame tree.
*/

import { createElement } from "react";
import { capitalize, field_cmp, set } from "@cocalc/util/misc";
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
import { addEditorMenus } from "@cocalc/frontend/frame-editors/frame-tree/commands";
import type { Command } from "@cocalc/frontend/frame-editors/frame-tree/commands";
import { commands, AllActions } from "@cocalc/frontend/jupyter/commands";
import { shortcut_to_string } from "@cocalc/frontend/jupyter/keyboard-shortcuts";
import KernelMenuItem from "./kernel-menu-item";
import { FORMAT_SOURCE_ICON } from "@cocalc/frontend/frame-editors/frame-tree/config";

const jupyterCommands = set([
  "about",
  "chatgpt",
  "print",
  "set_zoom",
  "decrease_font_size",
  "increase_font_size",
  "save",
  "time_travel",
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
    commands: jupyterCommands,
    buttons: set([
      "jupyter-insert-cell",
      "jupyter-run cell and select next",
      "jupyter-interrupt kernel",
      "jupyter-tab key",
      "jupyter-restart",
      "jupyter-cell-type",
      "jupyter-cell-format",
      "jupyter-cell-toolbar",
      "jupyter-nbgrader validate",
    ]),
    customizeCommands: {
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
    commands: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  jupyter_slideshow_revealjs: {
    short: "Slideshow",
    name: "Slideshow (Reveal.js)",
    icon: "slides",
    component: Slideshow,
    commands: set(["build"]),
  } as EditorDescription,
  jupyter_table_of_contents: {
    short: "Contents",
    name: "Table of Contents",
    icon: "align-right",
    component: TableOfContents,
    commands: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  introspect: {
    short: "Introspect",
    name: "Introspection",
    icon: "info",
    component: Introspect,
    commands: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  terminal,
  time_travel,
  jupyter_json: {
    short: "JSON view",
    name: "Raw JSON viewer",
    icon: "js-square",
    component: JSONIPynb,
    commands: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  jupyter_raw: {
    short: "JSON edit",
    name: "Raw JSON editor",
    icon: "markdown",
    component: RawIPynb,
    commands: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
};

const JUPYTER_MENUS = {
  file: {
    label: "File",
    pos: 0,
    download: [
      {
        icon: "file-export",
        label: "Save and Export As PDF",
        name: "save-and-download-as-pdf",
        children: [
          "nbconvert cocalc pdf",
          "nbconvert latex pdf",
          "nbconvert classic pdf",
          "nbconvert lab pdf",
        ],
      },
      {
        icon: "file-export",
        label: "Save and Export As HTML",
        name: "save-and-download-as-html",
        children: [
          "nbconvert cocalc html",
          "nbconvert classic html",
          "nbconvert lab html",
        ],
      },
      {
        icon: "file-export",
        label: "Save and Export...",
        name: "save-and-download-as-other",
        children: [
          "nbconvert script",
          "nbconvert markdown",
          "nbconvert rst",
          "nbconvert tex",
          "nbconvert sagews",
          "nbconvert asciidoc",
        ],
      },
    ],
    slideshow: ["slideshow", "nbconvert slides"],
    trusted: [
      {
        name: "trust notebook",
        disabled: ({ props }) => {
          return !!props.actions.jupyter_actions?.store?.get("trust");
        },
        label: ({ props }) => {
          if (props.actions.jupyter_actions?.store?.get("trust")) {
            return "Trusted Notebook";
          } else {
            return "Trust Notebook...";
          }
        },
      },
    ],
    classic: ["switch to classical notebook"],
  },
  edit: {
    label: "Edit",
    pos: 1,
    "cell-copy": [
      "cut cell",
      "copy cell",
      {
        icon: "paste",
        name: "paste-cells",
        label: "Paste Cells",
        children: [
          "paste cell and replace",
          "paste cell above",
          "paste cell below",
        ],
      },
    ],
    "insert-delete": [
      {
        label: "Insert Cell",
        button: "Insert",
        name: "insert-cell",
        icon: "plus",
        children: ["insert cell above", "insert cell below"],
      },
      {
        label: "Delete Cells",
        icon: "trash",
        name: "delete-cell",
        children: ["delete cell", "delete all blank code cells"],
      },
      {
        name: "move-cell",
        label: "Move Cells",
        icon: "arrow-up",
        children: ["move cell up", "move cell down"],
      },
      {
        name: "split-merge-cells",
        label: "Split and Merge",
        children: [
          "split cell at cursor",
          "merge cell with previous cell",
          "merge cell with next cell",
          "merge cells",
        ],
      },
    ],
    "cell-selection": [
      {
        label: "Select Cells",
        name: "select",
        children: ["select all cells", "deselect all cells"],
      },
    ],
    "cell-type": [
      {
        name: "cell-type",
        label: "Cell Type",
        icon: "code-outlined",
        children: [
          "change cell to code",
          "change cell to markdown",
          "change cell to raw",
        ],
      },
    ],
    outputs: [],
    "clear-cells": [
      {
        name: "clear",
        label: "Clear Output",
        children: [
          "clear cell output",
          "clear all cells output",
          "confirm restart kernel and clear output",
        ],
      },
    ],
    find: ["find and replace"],
    "collapse-and-expand": [
      {
        label: "Collapse",
        name: "cell-collapse",
        children: [
          "hide input",
          "hide output",
          "hide all input",
          "hide all output",
        ],
      },
      {
        label: "Expand",
        name: "cell-expand",
        children: [
          "show input",
          "show output",
          "show all input",
          "show all output",
        ],
      },
    ],
    "cell-toggle": [
      {
        label: "Toggle Selected Cells",
        name: "cell-toggle",
        children: [
          "toggle cell output collapsed",
          "toggle cell output scrolled",
          "toggle hide input",
          "toggle hide output",
          "write protect",
          "delete protect",
        ],
      },
      {
        label: "Toggle All Cells",
        name: "cell-toggle-all",
        children: [
          "toggle all cells output collapsed",
          "toggle all cells output scrolled",
        ],
      },
    ],
    "format-cells": [
      {
        icon: FORMAT_SOURCE_ICON,
        label: "Format Cells",
        button: "Format",
        name: "cell-format",
        children: ["format cells", "format all cells"],
      },
    ],
    "insert-image": ["insert image"],
  },
  view: {
    label: "View",
    pos: 2,
    components: [
      {
        icon: "tool",
        button: "Toolbars",
        label: "Cell Toolbar",
        name: "cell-toolbar",
        children: [
          "cell toolbar none",
          "cell toolbar create_assignment",
          "cell toolbar slideshow",
          "cell toolbar metadata",
          "cell toolbar attachments",
          "cell toolbar tags",
        ],
      },
      {
        label: "Line Numbers",
        name: "line-numbers",
        icon: "list-ol",
        children: [
          "show all line numbers",
          "hide all line numbers",
          "toggle cell line numbers",
        ],
      },
    ],
  },
  jupyter_run: {
    label: "Run",
    pos: 4,
    "run-cells": ["run cell and select next"],
    "run-cells-2": ["run cell and insert below", "run cell"],
    "run-cells-adjacent": ["run all cells above", "run all cells below"],
    "run-cells-all": [
      "run all cells",
      "confirm restart kernel and run all cells",
      "confirm restart kernel and run all cells without halting on error",
    ],
    keys: ["tab key", "shift+tab key"],
    nbgrader: ["nbgrader validate", "nbgrader assign"],
  },
  jupyter_kernel: {
    label: "Kernel",
    pos: 5,
    "kernel-control": ["interrupt kernel"],
    "restart-kernel": [
      {
        label: "Restart Kernel",
        name: "restart",
        icon: "reload",
        children: [
          "confirm restart kernel",
          "confirm restart kernel and clear output",
          "confirm restart kernel and run all cells",
        ],
      },
    ],
    "shutdown-kernel": ["confirm shutdown kernel"],
    kernels: [
      {
        icon: "dot-circle",
        label: ({ props }) => {
          const actions = props.actions.jupyter_actions;
          const store = actions.store;
          if (!store) {
            return "Kernels";
          }
          const kernels = store.get("kernels_by_name")?.toJS();
          const currentKernel = store.get("kernel");
          if (kernels == null || currentKernel == null) {
            actions.fetch_jupyter_kernels();
            return "Kernels";
          }
          if (!currentKernel) {
            return "No Kernel";
          }
          return createElement(KernelMenuItem, {
            ...kernels[currentKernel],
            currentKernel,
          });
        },
        name: "kernels",
        children: ({ props }) => {
          const actions = props.actions.jupyter_actions;
          const store = actions.store;
          if (!store) {
            return [];
          }
          const kernels = store.get("kernels_by_name")?.toJS();
          const currentKernel = store.get("kernel");
          if (kernels == null) {
            actions.fetch_jupyter_kernels();
            return [];
          }
          const languages: Partial<Command>[] = [];
          const addKernel = (kernelName: string) => {
            const { language = "language", metadata } = kernels[kernelName];
            const menuItem = {
              label: createElement(KernelMenuItem, {
                ...kernels[kernelName],
                currentKernel,
              }),
              onClick: () => {
                actions.set_kernel(kernelName);
                actions.set_default_kernel(kernelName);
              },
            };
            const Language = capitalize(language);
            let done = false;
            for (const z of languages) {
              if (z.label == Language) {
                // @ts-ignore
                z.children.push(menuItem);
                done = true;
                break;
              }
            }
            if (!done) {
              languages.push({
                pos: -(metadata?.cocalc?.priority ?? 0),
                icon: languageToIcon(language),
                // Explicitly don't use this, since it adds no value and gets in the way.
                // title: `Select the ${display_name} Jupyter kernel for writing code in ${Language}.`,
                label: Language,
                children: [menuItem],
              });
            }
          };
          for (const kernelName in kernels) {
            addKernel(kernelName);
          }
          languages.sort(field_cmp("pos"));
          return languages;
        },
      },
      //{ name: "refresh kernels", stayOpenOnClick: true },
      "refresh kernels",
      "change kernel",
    ],
    "no-kernel": ["no kernel"],
    "custom-kernel": ["custom kernel"],
  },
  help: {
    label: "Help",
    pos: 100,
    keyboard: ["edit keyboard shortcuts"],
    links: [
      "help - jupyter in cocalc",
      "help - nbgrader in cocalc",
      "custom kernel",
      "help - markdown",
    ],
  },
};

function initMenus() {
  const allActions: AllActions = {};
  const allCommands = commands(allActions);

  const names = addEditorMenus({
    prefix: "jupyter",
    editorMenus: JUPYTER_MENUS,
    getCommand: (name) => {
      const cmd = allCommands[name];
      if (cmd == null) {
        throw Error(`invalid Jupyter command name "${name}"`);
      }
      return {
        button: cmd.b,
        title: cmd.t,
        label: cmd.m,
        icon: cmd.i,
        keyboard: cmd.k ? cmd.k.map(shortcut_to_string).join(", ") : undefined,
        onClick: ({ props }) => {
          allActions.frame_actions = props.actions.frame_actions?.[props.id];
          allActions.jupyter_actions = props.actions.jupyter_actions;
          allActions.editor_actions = props.actions;
          cmd.f();
        },
      };
    },
  });
  for (const name of names) {
    jupyterCommands[name] = true;
  }
}
initMenus();

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "JupyterNotebook",
});

function languageToIcon(lang: string): string {
  if (
    lang == "python" ||
    lang == "octave" ||
    lang == "julia" ||
    lang == "r" ||
    lang == "sagemath"
  ) {
    return lang;
  } else if (lang == "javascript") {
    return "js-square";
  }
  return "terminal";
}
