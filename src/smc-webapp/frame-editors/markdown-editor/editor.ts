/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level react component for editing markdown documents
*/

import { createEditor } from "../frame-tree/editor";
import { RenderedMarkdown } from "./rendered-markdown";
import { set } from "smc-util/misc2";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { SETTINGS_SPEC } from "../settings/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";

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
      "format",
    ]),
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
      "time_travel",
      "undo", // need these because button bars at top let you do something even in rendered only view.
      "redo",
    ]),
  },
  terminal,
  settings: SETTINGS_SPEC,
  time_travel,
};

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "MarkdownEditor",
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
