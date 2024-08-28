/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level react component for editing MediaWiki documents
*/

import { aux_file, set } from "@cocalc/util/misc";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { IFrameHTML } from "../html-editor/iframe-html";
import { SETTINGS_SPEC } from "../settings/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";

const cm: EditorDescription = {
  type: "cm",
  short: "Code",
  name: "Source Code",
  icon: "code",
  component: CodemirrorEditor,
  commands: set([
    "format_action",
    "chtgpt",
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
  ]),
} as const;

const html: EditorDescription = {
  type: "wiki",
  short: "HTML",
  name: "Rendered HTML (pandoc)",
  icon: "html5",
  component: IFrameHTML,
  commands: set([
    "print",
    "decrease_font_size",
    "increase_font_size",
    "save",
    "time_travel",
    "reload",
  ]),
  path(path) {
    return aux_file(path, "html");
  },
  fullscreen_style: {
    // set via jquery
    "max-width": "900px",
    margin: "auto",
  },
} as const;

const EDITOR_SPEC = {
  cm,
  html,
  terminal,
  settings: SETTINGS_SPEC,
  time_travel,
} as const;

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "WikiEditor",
});
