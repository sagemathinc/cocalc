/*
Spec for editing PDF documents.
*/

import { set } from "../generic/misc";

import { createEditor } from "../frame-tree/editor";

import { PDFJS } from "../latex-editor/pdfjs";
import { PDFEmbed } from "../latex-editor/pdf-embed";

let pdfjs_buttons = set([
  "print",
  "download",
  "decrease_font_size",
  "increase_font_size",
  "zoom_page_width",
  "zoom_page_height"
]);

const EDITOR_SPEC = {
  pdfjs_canvas: {
    short: "PDF.js",
    name: "PDF.js - Canvas",
    icon: "file-pdf-o",
    component: PDFJS,
    buttons: pdfjs_buttons,
    style: { background: "#525659" },
    renderer: "canvas"
  },

  pdfjs_svg: {
    short: "PDF.js (svg)",
    name: "PDF.js - SVG",
    icon: "file-pdf-o",
    component: PDFJS,
    buttons: pdfjs_buttons,
    style: { background: "#525659" },
    renderer: "svg"
  },

  pdf_embed: {
    short: "PDF (native)",
    name: "PDF - Native",
    icon: "file-pdf-o",
    buttons: set(["print", "download"]),
    component: PDFEmbed,
  },

};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "PDFEditor"
});
