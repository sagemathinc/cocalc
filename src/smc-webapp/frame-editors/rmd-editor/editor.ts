/*
Top-level react component for editing R markdown documents
*/

const { RenderedMarkdown } = require("../markdown-editor/rendered-markdown");
const { set } = require("../code-editor/editor");
import { createEditor } from "../frame-tree/editor";
const { CodemirrorEditor } = require("../code-editor/codemirror-editor");

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
      "reload"
    ])
  },
  markdown: {
    short: "View",
    name: "Rendered View (Knitr)",
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
  }
};

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "RmdEditor"
});
