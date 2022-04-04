/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level react component for editing markdown documents
*/

import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { RenderedMarkdown } from "./rendered-markdown";
import { EditableMarkdown } from "./slate";
import { TableOfContents } from "./table-of-contents";
import { set } from "@cocalc/util/misc";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { SETTINGS_SPEC } from "../settings/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";

const EDITOR_SPEC = {
  slate: {
    placeholder: "Enter text...",
    short: "Editable",
    name: "Editable View",
    icon: "pencil",
    component: EditableMarkdown,
    buttons: set([
      //"print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "show_table_of_contents",
      //"replace",
      //"find",
      //"goto_line",
      //"cut",
      //"paste",
      //"copy",
      "undo",
      "redo",
      "readonly_view", // change frame to readonly view (for now, at least).
      "sync",
    ]),
  } as EditorDescription,
  cm: {
    placeholder: "Enter markdown...",
    short: "Source",
    name: "Source Code",
    icon: "code",
    component: CodemirrorEditor,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "show_table_of_contents",
      "replace",
      "find",
      "goto_line",
      "cut",
      "paste",
      "copy",
      "undo",
      "redo",
      "format",
      "sync",
    ]),
  } as EditorDescription,
  markdown: {
    short: "Locked",
    name: "Locked View",
    icon: "lock",
    component: RenderedMarkdown,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "show_table_of_contents",
      "time_travel",
      "undo", // need these because button bars at top let you do something even in rendered only view.
      "save",
      "redo",
      "edit", // change frame to editable slate
    ]),
  } as EditorDescription,
  markdown_table_of_contents: {
    short: "Contents",
    name: "Table of Contents",
    icon: "align-right",
    component: TableOfContents,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  terminal,
  settings: SETTINGS_SPEC,
  time_travel,
};

export const Editor = createEditor({
  format_bar: true,
  format_bar_exclude: {
    format_buttons: true,
  },
  editor_spec: EDITOR_SPEC,
  display_name: "MarkdownEditor",
});
