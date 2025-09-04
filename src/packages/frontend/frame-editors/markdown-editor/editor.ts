/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
import { editor } from "@cocalc/frontend/i18n";

const slate: EditorDescription = {
  type: "slate",
  placeholder: "Enter text...",
  short: "Text",
  name: "Editable Text",
  icon: "pencil",
  component: EditableMarkdown,
  commands: set([
    "format_action",
    "chatgpt",
    //"print",
    "decrease_font_size",
    "increase_font_size",
    "set_zoom",
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
    "help",
  ]),
  buttons: set([
    "format-ai_formula",
    "readonly_view",
    "decrease_font_size",
    "increase_font_size",
    "set_zoom",
    "sync",
    "show_table_of_contents",
  ]),
} as const;

const cm: EditorDescription = {
  type: "cm",
  placeholder: "Enter markdown...",
  short: "Markdown",
  name: "Markdown Code",
  icon: "markdown",
  component: CodemirrorEditor,
  commands: set([
    "format_action",
    "chatgpt",
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
    "settings",
    "terminal",
  ]),
  buttons: set([
    "decrease_font_size",
    "increase_font_size",
    "sync",
    "show_table_of_contents",
    "format-ai_formula",
    "format-header",
    "format-text",
    "format-font",
    "format-font-family",
    "format-font-size",
    "format-color",
  ]),
} as const;

const markdown: EditorDescription = {
  type: "markdown",
  short: "Locked",
  name: "Locked View",
  icon: "lock",
  component: RenderedMarkdown,
  commands: set([
    "chatgpt",
    "print",
    "decrease_font_size",
    "increase_font_size",
    "set_zoom",
    "show_table_of_contents",
    "time_travel",
    "undo", // need these because button bars at top let you do something even in rendered only view.
    "save",
    "redo",
    "edit", // change frame to editable slate
  ]),
  buttons: set(["edit", "decrease_font_size", "increase_font_size"]),
} as const;

const markdown_table_of_contents: EditorDescription = {
  type: "markdown-toc",
  short: editor.table_of_contents_short,
  name: editor.table_of_contents_name,
  icon: "align-right",
  component: TableOfContents,
  commands: set(["decrease_font_size", "increase_font_size"]),
  buttons: set(["decrease_font_size", "increase_font_size"]),
} as const;

const EDITOR_SPEC = {
  slate,
  cm,
  markdown,
  markdown_table_of_contents,
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
