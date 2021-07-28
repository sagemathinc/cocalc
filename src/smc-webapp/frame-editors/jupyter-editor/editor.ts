/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for editing Jupyter notebooks via a frame tree.
*/

import { set } from "smc-util/misc";
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
const SNIPPET_ICON_NAME = require("smc-webapp/assistant/common").ICON_NAME;
import { JupyterSnippets } from "./snippets";

export const EDITOR_SPEC = {
  jupyter_cell_notebook: {
    short: "Notebook",
    name: "Notebook (default)",
    icon: "ipynb",
    component: CellNotebook,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "cut",
      "paste",
      "copy",
      "undo",
      "redo",
      "format",
      "show_table_of_contents",
      "guide",
      "shell",
    ]),
    guide_info: {
      title: "Snippets",
      icon: SNIPPET_ICON_NAME,
      descr: "Open a panel containing code snippets.",
    },
    customize_buttons: {
      shell: {
        text: "Console",
        title:
          "Open command line Jupyter console session attached to the same kernel as notebook",
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
    icon: "FundProjectionScreenOutlined",
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

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "JupyterNotebook",
});
