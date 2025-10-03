/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Spec for editing LaTeX documents.
*/

import { IS_IOS, IS_IPAD } from "@cocalc/frontend/feature";
import { editor, labels } from "@cocalc/frontend/i18n";
import { set } from "@cocalc/util/misc";
import { WORD_COUNT_ICON } from "./constants";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { TableOfContents } from "../markdown-editor/table-of-contents";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import { Build } from "./build";
import { ErrorsAndWarnings } from "./errors-and-warnings";
import { LatexWordCount } from "./latex-word-count";
import { Output } from "./output";
import { PDFEmbed } from "./pdf-embed";
import { PDFJS } from "./pdfjs";

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

const cm: EditorDescription = {
  type: "cm",
  short: editor.latex_source_code_label_short,
  name: editor.latex_source_code_label_name,
  icon: "code",
  component: CodemirrorEditor,
  commands: set([
    "format_action",
    "build",
    "build_on_save",
    "force_build",
    "stop_build",
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
    "settings",
  ]),
  buttons: set([
    "format-ai_formula",
    "sync",
    "format-header",
    "format-text",
    "format-font",
    "format-color",
    "build",
    "build_on_save",
    "show_table_of_contents",
  ]),
  customizeCommands: {
    print: {
      label: editor.latex_command_print_label,
      title: editor.latex_command_print_tooltip,
    },
  },

  gutters: ["Codemirror-latex-errors"],
} as const;

const output: EditorDescription = {
  type: "latex-output",
  short: "Output",
  name: "Output",
  icon: "file-alt",
  component: Output,
  commands: set([
    "build",
    "build_on_save",
    "force_build",
    "stop_build",
    "print",
    "clean",
    "stop_build",
    "download",
    "download_pdf",
    "decrease_font_size",
    "increase_font_size",
  ]),
  buttons: set([
    "build",
    "force_build",
    "clean",
    "stop_build",
    "decrease_font_size",
    "increase_font_size",
    "zoom_page_width",
    "zoom_page_height",
    "set_zoom",
  ]),
} as const;

const pdfjs_canvas: EditorDescription = {
  type: "preview-pdf-canvas",
  short: editor.pdfjs_canvas_title_short,
  name: editor.pdfjs_canvas_title,
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
  renderer: "canvas",
} as const;

const error: EditorDescription = {
  type: "errors",
  short: editor.errors_and_warnings_title_short,
  name: editor.errors_and_warnings_title,
  icon: "bug",
  component: ErrorsAndWarnings,
  commands: set(["build", "force_build", "clean"]),
} as const;

const build: EditorDescription = {
  type: "latex-build",
  short: editor.build_control_and_log_title_short,
  name: editor.build_control_and_log_title,
  icon: "terminal",
  component: Build,
  commands: set([
    "build",
    "force_build",
    "stop_build",
    "clean",
    "decrease_font_size",
    "increase_font_size",
    "rescan_latex_directive",
    "word_count",
  ]),
  buttons: set([
    "build",
    "force_build",
    "build_on_save",
    "stop_build",
    "clean",
  ]),
} as const;

const latex_table_of_contents: EditorDescription = {
  type: "latex-toc",
  short: editor.table_of_contents_short,
  name: editor.table_of_contents_name,
  icon: "align-right",
  component: TableOfContents,
  commands: set(["decrease_font_size", "increase_font_size"]),
} as const;

const word_count: EditorDescription = {
  type: "latex-word_count",
  short: labels.word_count,
  name: labels.word_count,
  icon: WORD_COUNT_ICON,
  commands: set(["word_count"]),
  component: LatexWordCount,
} as const;

const pdf_embed: EditorDescription = {
  type: "preview-pdf-native",
  short: editor.pdf_embed_title_short,
  name: editor.pdf_embed_title,
  icon: "file-pdf",
  commands: set(["print", "save", "download"]),
  component: PDFEmbed,
} as const;

const EDITOR_SPEC = {
  cm,
  output,
  pdfjs_canvas,
  error,
  build,
  latex_table_of_contents,
  word_count,
  terminal,
  //settings: SETTINGS_SPEC,
  time_travel,
  // See https://github.com/sagemathinc/cocalc/issues/5114
  ...(!IS_IPAD && !IS_IOS ? { pdf_embed } : undefined),
} as const;

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
