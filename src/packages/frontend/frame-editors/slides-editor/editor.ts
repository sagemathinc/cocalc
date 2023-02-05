/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for slate frame tree editor.
*/

import { EditorDescription } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { createEditor } from "@cocalc/frontend/frame-editors/frame-tree/editor";
import { set } from "@cocalc/util/misc";
import { terminal } from "@cocalc/frontend/frame-editors/terminal-editor/editor";
import { time_travel } from "@cocalc/frontend/frame-editors/time-travel-editor/editor";
import { Introspect } from "@cocalc/frontend/frame-editors/jupyter-editor/introspect/introspect";
import { IconName } from "@cocalc/frontend/components/icon";
import { TableOfContents } from "../markdown-editor/table-of-contents";

import Slides from "./slides";
import Search from "../whiteboard-editor/search";
import Pages from "../whiteboard-editor/pages";

export const slidesButtons = set([
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
  /* "help", */ // be sure to change actions to have a proper link for this once some help is written.
]);

export const EDITOR_SPEC = {
  slides: {
    short: "Slides",
    name: "Slides",
    icon: "slides",
    component: Slides,
    buttons: slidesButtons,
  } as EditorDescription,
  search: {
    short: "Search",
    name: "Search",
    icon: "search" as IconName,
    component: Search,
    buttons: set(["decrease_font_size", "increase_font_size", "set_zoom"]),
  },
  pages: {
    short: "Pages",
    name: "Pages",
    icon: "files" as IconName,
    component: Pages,
  },
  terminal,
  time_travel,
  introspect: {
    short: "Introspect",
    name: "Introspection",
    icon: "info",
    component: Introspect,
    buttons: set(["decrease_font_size", "increase_font_size", "set_zoom"]),
  } as EditorDescription,
  slides_table_of_contents: {
    short: "Contents",
    name: "Table of Contents",
    icon: "align-right",
    component: TableOfContents,
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "Slides",
});
