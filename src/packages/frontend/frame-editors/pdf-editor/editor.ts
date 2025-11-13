/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Spec for editing PDF documents.
*/

import { IS_IOS, IS_IPAD } from "@cocalc/frontend/feature";
import { set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { PDFEmbed } from "../latex-editor/pdf-embed";
import { PDFJS } from "../latex-editor/pdfjs";

const pdfjsCommands = set([
  "reload",
  "print",
  "download",
  "decrease_font_size",
  "increase_font_size",
  "zoom_page_width",
  "zoom_page_height",
  "set_zoom",
  "toggle_pdf_dark_mode",
]);

const pdfjs_canvas: EditorDescription = {
  type: "pdfjs-canvas",
  short: "PDF.js",
  name: "PDF Viewer",
  icon: "file-pdf",
  component: PDFJS,
  commands: pdfjsCommands,
  buttons: set([
    "reload",
    "decrease_font_size",
    "increase_font_size",
    "zoom_page_width",
    "zoom_page_height",
    "set_zoom",
    "toggle_pdf_dark_mode",
  ]),
  renderer: "canvas",
} as const;

const pdf_embed: EditorDescription = {
  type: "preview-pdf-native",
  short: "PDF (native)",
  name: "PDF Viewer - Native",
  icon: "file-pdf",
  commands: set(["reload", "print", "download"]),
  component: PDFEmbed,
} as const;

export const EDITOR_SPEC = {
  pdfjs_canvas,
  // NOTE: the native viewer is epically bad on ipad/ios:
  //      https://github.com/sagemathinc/cocalc/issues/5114
  ...(!IS_IPAD && !IS_IOS ? { pdf_embed } : undefined),
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "PDFEditor",
});
