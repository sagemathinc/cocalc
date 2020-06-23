/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for editing LaTeX documents.
*/

import { set } from "smc-util/misc2";

import { createEditor } from "../frame-tree/editor";

import { PDFJS } from "./pdfjs";
import { PDFEmbed } from "./pdf-embed";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { Build } from "./build";
import { ErrorsAndWarnings } from "./errors-and-warnings";
import { LatexWordCount } from "./latex-word-count";
import { SETTINGS_SPEC } from "../settings/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";

import { pdf_path } from "./util";

export const pdfjs_buttons = set([
  "print",
  "download",
  "decrease_font_size",
  "increase_font_size",
  "zoom_page_width",
  "zoom_page_height",
  "sync",
]);

const EDITOR_SPEC = {
  cm: {
    short: "Source",
    name: "LaTeX Source Code",
    icon: "code",
    component: CodemirrorEditor,
    buttons: set([
      "build",
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "replace",
      "find",
      "goto_line",
      "cut",
      "paste",
      "copy",
      "undo",
      "redo",
      "sync",
      "help",
      "format",
      "switch_to_file",
    ]),
    gutters: ["Codemirror-latex-errors"],
  },

  pdfjs_canvas: {
    short: "PDF (preview)",
    name: "PDF - Preview",
    icon: "file-pdf-o",
    component: PDFJS,
    buttons: pdfjs_buttons,
    path: pdf_path,
    style: { background: "#525659" },
    renderer: "canvas",
  },

  error: {
    short: "Errors",
    name: "Errors and Warnings",
    icon: "bug",
    component: ErrorsAndWarnings,
    buttons: set(["build"]),
  },

  build: {
    short: "Build",
    name: "Build Control and Log",
    icon: "terminal",
    component: Build,
    buttons: set(["build", "force_build", "clean"]),
  },

  pdf_embed: {
    short: "PDF (native)",
    name: "PDF - Native",
    icon: "file-pdf-o",
    buttons: set(["print", "save", "download"]),
    component: PDFEmbed,
    path: pdf_path,
  },

  word_count: {
    short: "Word Count",
    name: "Word Count",
    icon: "file-alt",
    buttons: set(["word_count"]),
    component: LatexWordCount,
  },

  terminal,

  settings: SETTINGS_SPEC,

  time_travel,

  /*

    latexjs: {
        short: "Preview 1",
        name: "Rough Preview  1 - LaTeX.js",
        icon: "file-pdf-o",
        component: LaTeXJS,
        buttons: set([
            "print",
            "save",
            "decrease_font_size",
            "increase_font_size"
        ])
    },

    peg: {
        short: "Preview 2",
        name: "Rough Preview 2 - PEG.js",
        icon: "file-pdf-o",
        component: PEG,
        buttons: set([
            "print",
            "save",
            "decrease_font_size",
            "increase_font_size"
        ])
    } */
};

export const Editor = createEditor({
  format_bar: true,
  format_bar_exclude: {
    strikethrough: true,
    SpecialChar: true,
    image: true,
    unformat: true,
  }, // disabled until we can properly implement them!
  editor_spec: EDITOR_SPEC,
  display_name: "LaTeXEditor",
});
