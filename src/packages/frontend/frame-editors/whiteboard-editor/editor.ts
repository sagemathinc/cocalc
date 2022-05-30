/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Spec for whiteboard frame tree editor.
*/

import { EditorDescription } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { createEditor } from "@cocalc/frontend/frame-editors/frame-tree/editor";
import { set } from "@cocalc/util/misc";
import { terminal } from "@cocalc/frontend/frame-editors/terminal-editor/editor";
import { time_travel } from "@cocalc/frontend/frame-editors/time-travel-editor/editor";
import { Introspect } from "@cocalc/frontend/frame-editors/jupyter-editor/introspect/introspect";
import { IconName } from "@cocalc/frontend/components/icon";

import Whiteboard from "./whiteboard";
import Search from "./search";
import Pages from "./pages";

const whiteboardButtons = set([
  "decrease_font_size",
  "increase_font_size",
  "zoom_page_width",
  "save",
  "time_travel",
  "undo",
  "redo",
  "copy",
  "paste",
]);

export const EDITOR_SPEC = {
  whiteboard: {
    short: "Whiteboard",
    name: "Whiteboard",
    icon: "file-image",
    component: Whiteboard,
    buttons: whiteboardButtons,
  } as EditorDescription,
  search: {
    short: "Search",
    name: "Search View",
    icon: "search" as IconName,
    component: Search,
  },
  pages: {
    short: "Pages",
    name: "Page View",
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
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "Whiteboard",
});
