/*
Top-level react component for editing HTML documents
*/

import { createEditor } from "../frame-tree/editor";
import { set } from "../generic/misc";
import { QuickHTMLPreview } from "./rendered-html.tsx";
import { IFrameHTML } from "./iframe-html.tsx";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";

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
      "auto_indent"
    ])
  },
  iframe: {
    short: "HTML",
    name: "HTML IFrame",
    icon: "compass",
    component: IFrameHTML,
    buttons: set([
      "print",
      "save",
      "time_travel",
      "reload",
      "decrease_font_size",
      "increase_font_size"
    ])
  },

  preview: {
    short: "Preview",
    name: "Quick Preview",
    icon: "html5",
    component: QuickHTMLPreview,
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
  display_name: "HTMLEditor"
});
