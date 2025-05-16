/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Spec for editing Jupyter notebooks via a frame tree.
*/

import { createElement } from "react";
import type { Command } from "@cocalc/frontend/frame-editors/frame-tree/commands";
import { addEditorMenus } from "@cocalc/frontend/frame-editors/frame-tree/commands";
import { FORMAT_SOURCE_ICON } from "@cocalc/frontend/frame-editors/frame-tree/config";
import { labels, menu } from "@cocalc/frontend/i18n";
import { editor, jupyter } from "@cocalc/frontend/i18n/common";
import { AllActions, commands } from "@cocalc/frontend/jupyter/commands";
import { shortcut_to_string } from "@cocalc/frontend/jupyter/keyboard-shortcuts";
import { capitalize, field_cmp, set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import { CellNotebook } from "./cell-notebook/cell-notebook";
import { Introspect } from "./introspect/introspect";
import JSONIPynb from "./json-ipynb";
import KernelMenuItem from "./kernel-menu-item";
import { RawIPynb } from "./raw-ipynb";
import { Slideshow } from "./slideshow-revealjs/slideshow";
import { JupyterSnippets } from "./snippets";
import { TableOfContents } from "./table-of-contents";
import { search } from "./search";

const SNIPPET_ICON_NAME = "magic";

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
  "settings",
  "show_search",
]);

const jupyter_cell_notebook: EditorDescription = {
  type: "jupyter",
  short: "Jupyter",
  name: "Jupyter Notebook",
  icon: "ipynb",
  component: CellNotebook,
  commands: jupyterCommands,
  buttons: set([
    "jupyter-insert-cell",
    "jupyter-run current cell and select next",
    "jupyter-interrupt kernel",
    "jupyter-restart",
    "jupyter-cell-type",
    "jupyter-cell-format",
    "jupyter-cell-toolbar",
    "jupyter-nbgrader validate",
    "halt_jupyter",
    "guide",
    "show_search",
  ]),
  customizeCommands: {
    guide: {
      label: labels.snippets,
      icon: SNIPPET_ICON_NAME,
      title: jupyter.editor.snippets_tooltip,
    },
    shell: {
      label: jupyter.editor.console_label,
      icon: "ipynb",
      title: jupyter.editor.console_title,
    },
  },
} as const;

const commands_guide: EditorDescription = {
  type: "snippets",
  short: labels.snippets,
  name: labels.snippets,
  icon: SNIPPET_ICON_NAME,
  component: JupyterSnippets,
  commands: set(["decrease_font_size", "increase_font_size"]),
} as const;

const jupyter_slideshow_revealjs: EditorDescription = {
  type: "slideshow-revealjs",
  short: "Slideshow",
  name: "Slideshow (Reveal.js)",
  icon: "slides",
  component: Slideshow as any, // TODO: rclass wrapper is incompatible with this type → rewrite Slideshow to be a React.FC
  commands: set(["build"]),
} as const;

const jupyter_table_of_contents: EditorDescription = {
  type: "jupyter-toc",
  short: editor.table_of_contents_short,
  name: editor.table_of_contents_name,
  icon: "align-right",
  component: TableOfContents,
  commands: set(["decrease_font_size", "increase_font_size"]),
  buttons: set(["decrease_font_size", "increase_font_size"]),
} as const;

const introspect: EditorDescription = {
  type: "jupyter-introspect",
  short: jupyter.editor.introspect_short,
  name: jupyter.editor.introspect_title,
  icon: "info",
  component: Introspect,
  commands: set(["decrease_font_size", "increase_font_size"]),
} as const;

const jupyter_json: EditorDescription = {
  type: "jupyter_json_view",
  short: jupyter.editor.raw_json_view_short,
  name: jupyter.editor.raw_json_view_title,
  icon: "js-square",
  component: JSONIPynb,
  commands: set(["decrease_font_size", "increase_font_size"]),
} as const;

const jupyter_raw: EditorDescription = {
  type: "jupyter_json_edit",
  short: jupyter.editor.raw_json_editor_short,
  name: jupyter.editor.raw_json_editor_title,
  icon: "markdown",
  component: RawIPynb,
  commands: set(["decrease_font_size", "increase_font_size"]),
} as const;

export const EDITOR_SPEC = {
  jupyter_cell_notebook,
  commands_guide,
  jupyter_slideshow_revealjs,
  jupyter_table_of_contents,
  introspect,
  terminal,
  time_travel,
  jupyter_json,
  jupyter_raw,
  search,
} as const;

const JUPYTER_MENUS = {
  file: {
    label: menu.file,
    pos: 0,
    entries: {
      download: [
        {
          icon: "file-export",
          label: jupyter.commands.download_as_pdf,
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
          label: jupyter.commands.download_as_html,
          name: "save-and-download-as-html",
          children: [
            "nbconvert cocalc html",
            "nbconvert classic html",
            "nbconvert lab html",
          ],
        },
        {
          icon: "file-export",
          label: jupyter.commands.export_menu,
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
    },
  },
  edit: {
    label: menu.edit,
    pos: 1,
    entries: {
      "cell-copy": [
        "cut cell",
        "copy cell",
        {
          icon: "paste",
          name: "paste-cells",
          label: jupyter.commands.paste_cells_menu,
          children: [
            "paste cell and replace",
            "paste cell above",
            "paste cell below",
          ],
        },
      ],
      "insert-delete": [
        {
          label: jupyter.commands.insert_cells_menu,
          button: labels.insert,
          name: "insert-cell",
          icon: "plus",
          children: ["insert cell above", "insert cell below"],
        },
        {
          label: jupyter.commands.delete_cells_menu,
          icon: "trash",
          name: "delete-cell",
          children: ["delete cell", "delete all blank code cells"],
        },
        {
          name: "move-cell",
          label: jupyter.commands.move_cells_menu,
          icon: "arrow-up",
          children: ["move cell up", "move cell down"],
        },
        {
          icon: "horizontal-split",
          name: "split-merge-cells",
          label: jupyter.commands.split_and_merge_menu,
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
          icon: "menu-outlined",
          label: jupyter.commands.select_cells_menu,
          name: "select",
          children: [
            "select all cells",
            "deselect all cells",
            "select all code cells",
            "select all markdown cells",
          ],
        },
      ],
      "cell-type": [
        {
          name: "cell-type",
          label: jupyter.commands.cell_type_menu,
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
          icon: "battery-empty",
          name: "clear",
          label: jupyter.commands.clear_output_menu,
          children: [
            "clear cell output",
            "clear all cells output",
            "confirm restart kernel and clear output",
          ],
        },
      ],
      find: ["find and replace"],
      "collapse-expand-protect": [
        {
          icon: "compress",
          label: jupyter.commands.cells_collapse_menu,
          name: "cell-collapse",
          children: [
            "hide input",
            "hide output",
            "set cell output scrolled",
            "hide all input",
            "hide all output",
            "set all cell output scrolled",
          ],
        },
        {
          icon: "expand-arrows",
          label: jupyter.commands.cells_expand_menu,
          name: "cell-expand",
          children: [
            "show input",
            "show output",
            "unset cell output scrolled",
            "show all input",
            "show all output",
            "unset all cell output scrolled",
          ],
        },
        {
          icon: "lock",
          label: jupyter.commands.cells_protect_menu,
          name: "cell-protect",
          children: ["write protect", "delete protect"],
        },
        {
          icon: "lock-open",
          label: jupyter.commands.cells_unlock_menu,
          button: jupyter.commands.cells_unlock_menu_button,
          name: "cell-remove-protect",
          children: ["remove write protect", "remove delete protect"],
        },
      ],
      "format-cells": [
        {
          icon: FORMAT_SOURCE_ICON,
          label: jupyter.commands.format_cells_menu,
          button: jupyter.commands.format_cells_menu_button,
          name: "cell-format",
          children: ["format cells", "format all cells"],
        },
      ],
    },
  },
  view: {
    label: menu.view,
    pos: 2,
    entries: {
      components: [
        {
          icon: "tool",
          button: jupyter.commands.view_toolbars_menu_button,
          label: jupyter.commands.view_toolbars_menu,
          name: "cell-toolbar",
          children: [
            "cell toolbar none",
            "cell toolbar create_assignment",
            "cell toolbar slideshow",
            "cell toolbar metadata",
            "cell toolbar attachments",
            "cell toolbar tags",
            "cell toolbar ids",
          ],
        },
        {
          label: labels.line_numbers,
          name: "line-numbers",
          icon: "list-ol",
          children: [
            "show all line numbers",
            "hide all line numbers",
            "toggle cell line numbers",
          ],
        },
        {
          label: labels.code_folding,
          name: "code-folding",
          icon: "angle-right",
          children: ["show code folding", "hide code folding"],
        },
      ],
    },
  },
  jupyter_run: {
    label: menu.run,
    pos: 4,
    entries: {
      "run-cells": [
        "run current cell and select next",
        {
          label: jupyter.editor.run_selected_cells,
          button: menu.run,
          name: "run-selected-cells",
          icon: "play-square",
          children: [
            "run cell and select next",
            "run cell and insert below",
            "run cell",
          ],
        },
        {
          label: jupyter.editor.run_all_cells,
          button: menu.run,
          name: "run-all-cells",
          icon: "forward",
          children: [
            "run all cells",
            "confirm restart kernel and run all cells",
            "confirm restart kernel and run all cells without halting on error",
          ],
        },
      ],
      "run-cells-adjacent": ["run all cells above", "run all cells below"],
      keys: ["tab key", "shift+tab key"],
      nbgrader: ["nbgrader validate", "nbgrader assign"],
    },
  },
  jupyter_kernel: {
    label: menu.kernel,
    pos: 5,
    entries: {
      "kernel-control": ["interrupt kernel"],
      "restart-kernel": [
        {
          label: jupyter.commands.restart_kernel_noconf_menu,
          button: menu.kernel,
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
                  disabled: ({ readOnly }) => readOnly,
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
  },
  help: {
    label: labels.help,
    pos: 100,
    entries: {
      keyboard: ["edit keyboard shortcuts"],
      links: [
        "help - jupyter in cocalc",
        "help - nbgrader in cocalc",
        "custom kernel",
        "help - markdown",
      ],
    },
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
        disabled: cmd.r ? undefined : ({ readOnly }) => readOnly,
        button: cmd.b,
        title: cmd.t,
        label: cmd.m,
        icon: cmd.i,
        iconRotate: cmd.ir,
        keyboard: cmd.k ? cmd.k.map(shortcut_to_string).join(", ") : undefined,
        onClick: ({ props }) => {
          allActions.frame_actions = props.actions.frame_actions?.[props.id];
          allActions.jupyter_actions = props.actions.jupyter_actions;
          allActions.editor_actions = props.actions; // TODO should this be props.editor_actions ?
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
