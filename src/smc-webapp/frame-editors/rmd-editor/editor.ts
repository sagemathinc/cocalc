/*
Top-level react component for editing R markdown documents
*/

import { RenderedMarkdown } from "../markdown-editor/rendered-markdown";
import { set, change_filename_extension } from "../generic/misc";
// import { aux_file } from "../frame-tree/util";
import { createEditor } from "../frame-tree/editor";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { SETTINGS_SPEC } from "../settings/editor";
import { IFrameHTML } from "../html-editor/iframe-html";
import { PDFJS } from "../latex-editor/pdfjs";
import { pdfjs_buttons } from "../latex-editor/editor";

const EDITOR_SPEC = {
  cm: {
    short: "Code",
    name: "Source Code",
    icon: "code",
    component: CodemirrorEditor,
    buttons: set([
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
      "reload",
      "format"
    ])
  },

  iframe: {
    short: "HTML",
    name: "Converted HTML",
    icon: "compass",
    component: IFrameHTML,
    path(path) {
      return change_filename_extension(path, "html");
    },
    buttons: set([
      "print",
      "save",
      "time_travel",
      "reload",
      "decrease_font_size",
      "increase_font_size"
    ])
  },

  // By default, only html is generated. This viewer is still there in case the user explicitly tells RMarkdown to generate a PDF

  pdfjs_canvas: {
    short: "PDF",
    name: "Converted PDF (if available)",
    icon: "file-pdf-o",
    component: PDFJS,
    buttons: pdfjs_buttons,
    style: { background: "#525659" },
    renderer: "canvas",
    path(path) {
      return change_filename_extension(path, "pdf");
    }
  },

  markdown: {
    short: "Markdown",
    name: "Rendered Markdown",
    icon: "eye",
    component: RenderedMarkdown,
    reload_images: true,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "reload"
    ])
  },

  settings: SETTINGS_SPEC
};

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "RmdEditor"
});
