/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for editing PDF documents.
*/

import { set } from "@cocalc/util/misc";
import { EditorDescription } from "../frame-tree/types";
import { createEditor } from "../frame-tree/editor";
import { PDFJS } from "../latex-editor/pdfjs";
import { PDFEmbed } from "../latex-editor/pdf-embed";
import { IS_IOS, IS_IPAD } from "../../feature";

const pdfjs_buttons = set([
  "reload",
  "print",
  "download",
  "decrease_font_size",
  "increase_font_size",
  "zoom_page_width",
  "zoom_page_height",
]);

export const EDITOR_SPEC = {
  pdfjs_canvas: {
    short: "PDF.js",
    name: "PDF.js",
    icon: "file-pdf",
    component: PDFJS,
    buttons: pdfjs_buttons,
    style: { background: "#525659" },
    renderer: "canvas",
  } as EditorDescription,
};

// NOTE: the native viewer is epically bad on ipad/ios:
//      https://github.com/sagemathinc/cocalc/issues/5114
if (!IS_IPAD && !IS_IOS) {
  (EDITOR_SPEC as any).pdf_embed = {
    short: "PDF (native)",
    name: "PDF - Native",
    icon: "file-pdf",
    buttons: set(["reload", "print", "download"]),
    component: PDFEmbed,
  } as EditorDescription;
}

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "PDFEditor",
});
