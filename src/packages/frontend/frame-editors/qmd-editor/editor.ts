/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level react component for editing quarto documents
*/

import { set } from "@cocalc/util/misc";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { IFrameHTML } from "../html-editor/iframe-html";
import { pdfjsCommands } from "../latex-editor/editor";
import { PDFJS } from "../latex-editor/pdfjs";
import { RenderedMarkdown } from "../markdown-editor/rendered-markdown";
import { derive_rmd_output_filename } from "../rmd-editor/utils";
import { SETTINGS_SPEC } from "../settings/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import { BuildLog } from "./build-log";

const EDITOR_SPEC = {
  cm: {
    short: "Code",
    name: "Source Code",
    icon: "code",
    component: CodemirrorEditor,
    commands: set([
      "format_action",
      "chatgpt",
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
      "format",
      "build",
    ]),
    buttons: set([
      "format-ai_formula",
      "decrease_font_size",
      "increase_font_size",
      "build",
    ]),
  } as EditorDescription,

  iframe: {
    short: "HTML",
    name: "HTML (Converted)",
    icon: "compass",
    component: IFrameHTML,
    mode: "rmd",
    path(path) {
      return derive_rmd_output_filename(path, "html");
    },
    commands: set([
      "print",
      "save",
      "time_travel",
      "reload",
      "decrease_font_size",
      "increase_font_size",
      "build",
    ]),
    buttons: set(["decrease_font_size", "increase_font_size", "build"]),
  } as EditorDescription,

  // By default, only html is generated. This viewer is still there in case the user explicitly tells Quarto to generate a PDF

  pdfjs_canvas: {
    short: "PDF",
    name: "PDF (Converted)",
    icon: "file-pdf",
    component: PDFJS,
    mode: "rmd",
    commands: pdfjsCommands,
    buttons: set([
      "decrease_font_size",
      "increase_font_size",
      "zoom_page_width",
      "zoom_page_height",
      "set_zoom",
      "build",
    ]),
    renderer: "canvas",
    path(path) {
      return derive_rmd_output_filename(path, "pdf");
    },
  } as EditorDescription,

  markdown: {
    short: "Markdown",
    name: "Markdown (only rendered)",
    icon: "eye",
    component: RenderedMarkdown,
    reload_images: true,
    commands: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "reload",
    ]),
  } as EditorDescription,

  build: {
    short: "Build Log",
    name: "Build Log",
    icon: "gears",
    component: BuildLog,
    commands: set(["build", "decrease_font_size", "increase_font_size"]),
    buttons: set(["build"]),
  } as EditorDescription,

  terminal,

  time_travel,

  settings: SETTINGS_SPEC,
};

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "QuartoEditor",
});
