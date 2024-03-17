/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for whiteboard frame tree editor.
*/

import { IconName } from "@cocalc/frontend/components/icon";
import { createEditor } from "@cocalc/frontend/frame-editors/frame-tree/editor";
import {
  EditorDescription,
  EditorSpec,
} from "@cocalc/frontend/frame-editors/frame-tree/types";
import { Introspect } from "@cocalc/frontend/frame-editors/jupyter-editor/introspect/introspect";
import { terminal } from "@cocalc/frontend/frame-editors/terminal-editor/editor";
import { time_travel } from "@cocalc/frontend/frame-editors/time-travel-editor/editor";
import { set } from "@cocalc/util/misc";
import { TableOfContents } from "../markdown-editor/table-of-contents";

import Overview from "./overview";
import Pages from "./pages";
import Search from "./search";
import Whiteboard from "./whiteboard";

export const whiteboardCommands = set([
  "decrease_font_size",
  "increase_font_size", // we do NOT include "set_zoom", since it's based on account font_size, but we base 100% on font size 14.
  "zoom_page_width",
  "save",
  "time_travel",
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "show_table_of_contents",
  "show_pages",
  "show_search",
  "show_overview",
  "help",
  "chatgpt",
]);

export const EDITOR_SPEC: EditorSpec = {
  whiteboard: {
    short: "Whiteboard",
    name: "Whiteboard",
    icon: "file-image",
    component: Whiteboard,
    commands: whiteboardCommands,
    buttons: set([
      "show_table_of_contents",
      "show_pages",
      "show_search",
      "show_overview",
    ]),
  } as EditorDescription,

  search: {
    short: "Search",
    name: "Search",
    icon: "search" as IconName,
    component: Search,
    commands: set(["decrease_font_size", "increase_font_size", "set_zoom"]),
    buttons: set(["decrease_font_size", "increase_font_size"]),
  },

  pages: {
    short: "Pages",
    name: "Pages",
    icon: "pic-centered" as IconName,
    component: Pages,
  },

  overview: {
    short: "Overview",
    name: "Overview",
    icon: "overview" as IconName,
    commands: set(["decrease_font_size", "increase_font_size", "set_zoom"]),
    buttons: set(["decrease_font_size", "increase_font_size"]),
    component: Overview,
  },

  terminal,

  time_travel,

  introspect: {
    short: "Introspect",
    name: "Introspection",
    icon: "info",
    component: Introspect,
    commands: set(["decrease_font_size", "increase_font_size", "set_zoom"]),
  } as EditorDescription,

  table_of_contents: {
    short: "Contents",
    name: "Table of Contents",
    icon: "align-right",
    component: TableOfContents,
    commands: set(["decrease_font_size", "increase_font_size"]),
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
} as const;

export const Editor = createEditor({
  editor_spec: EDITOR_SPEC,
  display_name: "Whiteboard",
});
