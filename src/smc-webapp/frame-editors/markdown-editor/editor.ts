/*
Top-level react component for editing markdown documents
*/

import { createEditor } from "../frame-tree/editor";
import { RenderedMarkdown } from "./rendered-markdown";
import { set } from "../generic/misc";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { SETTINGS_SPEC } from "../settings/editor";
import { terminal } from "../terminal-editor/editor";

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
      "format"
    ])
  },
  markdown: {
    short: "View",
    name: "Rendered View",
    icon: "eye",
    component: RenderedMarkdown,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel"
    ])
  },
  terminal,
  settings: SETTINGS_SPEC
};

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "MarkdownEditor"
});

/*
    prosemirror :
        short     : 'Editable'
        name      : 'Editable view'
        icon      : 'compass'
        component : ProseMirror
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel'])
    content_editable :
        short     : 'Content'
        name      : 'ContentEditable (test)'
        icon      : 'crosshairs'
        component : ContentEditable
        buttons   : set(['print', 'decrease_font_size', 'increase_font_size', 'save', 'time_travel'])
*/
