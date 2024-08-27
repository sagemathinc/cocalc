/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
import { TableOfContents } from "../markdown-editor/table-of-contents";

import SpeakerNotes from "./speaker-notes";
import Slides from "./slides";
import Search from "../whiteboard-editor/search";
import Pages from "../whiteboard-editor/pages";
import Overview from "../whiteboard-editor/overview";
import Slideshow from "./slideshow";
import { editor } from "@cocalc/frontend/i18n";

export const slidesCommands = set([
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
  "show_slideshow",
  "show_speaker_notes",
  "help",
  "chatgpt",
]);

export const EDITOR_SPEC = {
  slides: {
    short: "Slides",
    name: "Slides",
    icon: "slides",
    component: Slides,
    commands: slidesCommands,
    buttons: set([
      "show_table_of_contents",
      "show_pages",
      "show_search",
      "show_overview",
      "show_slideshow",
    ]),
  } as EditorDescription,
  speaker_notes: {
    short: "Notes",
    name: "Speaker Notes",
    icon: "pencil",
    component: SpeakerNotes,
    commands: set([
      "decrease_font_size",
      "increase_font_size",
      "set_zoom",
      "show_slideshow",
    ]),
  },
  search: {
    short: "Search",
    name: "Search",
    icon: "search",
    component: Search,
    commands: set([
      "decrease_font_size",
      "increase_font_size",
      "set_zoom",
      "show_slideshow",
    ]),
    buttons: set(["decrease_font_size", "increase_font_size"]),
  },
  pages: {
    short: "Pages",
    name: "Pages",
    icon: "pic-centered",
    component: Pages,
    commands: set(["show_slideshow", "help"]),
  },
  overview: {
    short: "Overview",
    name: "Overview",
    icon: "overview",
    component: Overview,
    commands: set([
      "show_slideshow",
      "decrease_font_size",
      "increase_font_size",
      "set_zoom",
      "help",
    ]),
    buttons: set(["decrease_font_size", "increase_font_size"]),
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
    // name = "table_of_contents" must be same name as for whiteboard, since otherwise show_table_of_contents action in whiteboard breaks.
    short: editor.table_of_contents_short,
    name: editor.table_of_contents_name,
    icon: "align-right",
    component: TableOfContents,
    commands: set([
      "decrease_font_size",
      "increase_font_size",
      "show_slideshow",
    ]),
    buttons: set(["decrease_font_size", "increase_font_size"]),
  } as EditorDescription,
  slideshow: {
    short: "Slideshow",
    name: "Slideshow Presentation",
    icon: "play-square",
    component: Slideshow,
  },
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "Slides",
});
