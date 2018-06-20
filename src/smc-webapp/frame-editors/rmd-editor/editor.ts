/*
Top-level react component for editing R markdown documents
*/

import { RenderedMarkdown } from "../markdown-editor/rendered-markdown";
import { set } from "../generic/misc";
import { createEditor } from "../frame-tree/editor";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { SETTINGS_SPEC } from "../settings/editor";

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
  },
  settings : SETTINGS_SPEC
};

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "RmdEditor"
});
