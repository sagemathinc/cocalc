/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for editing LaTeX documents.
*/

import { set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
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
import { IS_IOS, IS_IPAD } from "../../feature";
import { TableOfContents } from "../markdown-editor/table-of-contents";

export const pdfjsCommands = set([
  "print",
  "download",
  "decrease_font_size",
  "increase_font_size",
  "set_zoom",
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
    commands: set([
      "format_action",
      "build",
      "force_build",
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "replace",
      "find",
      "goto_line",
      "chatgpt",
      "cut",
      "paste",
      "copy",
      "undo",
      "redo",
      "sync",
      "help",
      "format",
      "switch_to_file",
      "show_table_of_contents",
      "word_count",
      "-format-SpecialChar", // disable this since not properly implemented for latex.  It could be though!
      "download_pdf",
    ]),
    buttons: set([
      "sync",
      "format-header",
      "format-text",
      "format-font",
      "format-color",
      "build",
      "show_table_of_contents",
    ]),
    customizeCommands: {
      print: {
        label: "Print LaTeX Source",
        title:
          "Print the source code of this document.  Use Print from the PDF Preview frame to print the rendered document.",
      },
    },

    gutters: ["Codemirror-latex-errors"],
  } as EditorDescription,

  pdfjs_canvas: {
    short: "PDF (preview)",
    name: "PDF - Preview",
    icon: "file-pdf",
    component: PDFJS,
    commands: {
      ...pdfjsCommands,
      download: false,
      download_pdf: true,
      build: true,
    },
    buttons: set([
      "sync",
      "decrease_font_size",
      "increase_font_size",
      "zoom_page_width",
      "zoom_page_height",
      "set_zoom",
      "build",
      "print",
      "download_pdf",
    ]),
    path: pdf_path,
    renderer: "canvas",
  } as EditorDescription,

  error: {
    short: "Errors",
    name: "Errors and Warnings",
    icon: "bug",
    component: ErrorsAndWarnings,
    commands: set(["build", "force_build", "clean"]),
  } as EditorDescription,

  build: {
    short: "Build",
    name: "Build Control and Log",
    icon: "terminal",
    component: Build,
    commands: set([
      "build",
      "force_build",
      "clean",
      "decrease_font_size",
      "increase_font_size",
      "rescan_latex_directive",
      "word_count",
    ]),
    buttons: set(["build", "force_build", "clean"]),
  } as EditorDescription,

  latex_table_of_contents: {
    short: "Contents",
    name: "Table of Contents",
    icon: "align-right",
    component: TableOfContents,
    commands: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,

  word_count: {
    short: "Word Count",
    name: "Word Count",
    icon: "file-alt",
    commands: set(["word_count"]),
    component: LatexWordCount,
  } as EditorDescription,

  terminal,

  settings: SETTINGS_SPEC,

  time_travel,
};

// See https://github.com/sagemathinc/cocalc/issues/5114
if (!IS_IPAD && !IS_IOS) {
  (EDITOR_SPEC as any).pdf_embed = {
    short: "PDF (native)",
    name: "PDF - Native",
    icon: "file-pdf",
    commands: set(["print", "save", "download"]),
    component: PDFEmbed,
    path: pdf_path,
  } as EditorDescription;
}

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
