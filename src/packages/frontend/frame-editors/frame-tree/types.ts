/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IconName } from "@cocalc/frontend/components/icon";

import { Map, Set } from "immutable";
import { ReactNode } from "react";

import { AccountState } from "@cocalc/frontend/account/types";
import { IntlMessage } from "@cocalc/frontend/i18n";
import type { AvailableFeatures } from "@cocalc/frontend/project_configuration";

import type { Command } from "./commands";

export type FrameDirection = "row" | "col";

/* Interface for object that describes a binary tree. */
export interface FrameTree {
  direction?: FrameDirection;
  type: string;
  first?: FrameTree;
  second?: FrameTree;
  font_size?: number;
  pos?: number;
}

// Someday!
export type ImmutableFrameTree = Map<string, any>;

export type NodeDesc = Map<string, any>;

/* a hashmap from strings to boolean.  Basically useful as a set. */
export interface SetMap {
  [key: string]: boolean;
}

export type ErrorStyles = undefined | "monospace";

export type ConnectionStatus = "disconnected" | "connected" | "connecting";

// Each editor gets its own unique type. This is useful to check which editor it is.
// e.g. #7787 was caused by merely checking on the name, which had changed.
type EditorType =
  | "chat"
  | "chatroom"
  | "cm-lean"
  | "cm"
  | "course-assignments"
  | "course-actions"
  | "course-configuration"
  | "course-handouts"
  | "course-shared_project"
  | "course-students"
  | "crm-account"
  | "crm-tables"
  | "csv-grid"
  | "errors"
  | "iframe"
  | "jupyter_json_edit"
  | "jupyter_json_view"
  | "jupyter-introspect"
  | "jupyter-toc"
  | "jupyter"
  | "jupyter_single"
  | "latex-build"
  | "latex-output"
  | "latex-toc"
  | "latex-word_count"
  | "latex"
  | "lean-help"
  | "lean-info"
  | "lean-messages"
  | "markdown-rendered"
  | "markdown-toc"
  | "markdown"
  | "pdfjs-canvas"
  | "preview-html"
  | "preview-pdf-canvas"
  | "preview-pdf-native"
  | "qmd-log"
  | "rmd-build"
  | "rst-view"
  | "sagews-cells"
  | "sagews-document"
  | "search"
  | "settings"
  | "slate"
  | "slides-notes"
  | "slides-slideshow"
  | "slides"
  | "slideshow-revealjs"
  | "snippets"
  | "tasks"
  | "terminal-guide"
  | "terminal"
  | "timetravel"
  | "whiteboard-overview"
  | "whiteboard-pages"
  | "whiteboard-search"
  | "whiteboard"
  | "wiki"
  | "x11-apps"
  | "x11";

// Editor spec
export interface EditorDescription {
  type: EditorType;
  short: string | IntlMessage; // short description of the editor
  name: string | IntlMessage; // slightly longer description
  icon: IconName;
  component: (props: EditorComponentProps) => ReactNode | Promise<ReactNode>;

  // commands that will be displayed in the menu (if they exist)
  commands?: { [commandName: string]: boolean };
  // | ButtonFunction;
  // customizeCommands: use this to override label, tooltip, or anything
  // else about and command, specifically for this editor frame. This gets
  // merged in to the generic command, or added as a new command.
  customizeCommands?: { [commandName: string]: Partial<Command> };

  // which commands will also appear in the button bar (if available)
  // If a command is in a submenu, use '->' to link them together, i.e.,
  // 'format-font -> bold' means the item named "bold" in the submenu
  // named 'format-font'.
  buttons?: { [commandName: string]: boolean };

  hide_file_menu?: boolean; // If true, never show the File --> Dropdown menu.
  subframe_init?: Function;
  style?: object;
  path?: Function;
  fullscreen_style?: object;
  mode?: any; // I think it's a CM mode (?)
  reload_images?: boolean;
  gutters?: string[]; // I think it's cm gutters
  hide_public?: boolean; // if true, do not show this editor option (in title bar dropdown) when viewing file publicly.
  clear_info?: { text: string; confirm: string };
  placeholder?: string; // placeholder text to use when empty.
  renderer?: "canvas"; // TODO: is this used at all?
}

export interface EditorSpec {
  [editor_name: string]: EditorDescription;
}

export type EditorState = Map<string, any>; // TODO: use TypeMap and do this right.

export interface EditorComponentProps {
  id: string;
  actions;
  available_features: AvailableFeatures;
  complete;
  cursors?: Map<string, any>;
  derived_file_types: Set<string>;
  desc: NodeDesc;
  editor_actions;
  editor_settings: AccountState["editor_settings"];
  editor_state: Map<string, any>;
  font_size: number;
  fullscreen_style: EditorDescription["fullscreen_style"];
  gutter_markers?: Map<string, any>;
  gutters?: EditorDescription["gutters"];
  is_current: boolean;
  is_fullscreen: boolean;
  is_public: boolean;
  is_subframe: boolean;
  is_visible: boolean;
  local_view_state: Map<string, any>;
  misspelled_words?: Set<string> | string;
  mode: EditorDescription["mode"];
  name: string;
  onFocus: () => void;
  path: string;
  placeholder?: string;
  project_id: string;
  read_only: boolean;
  reload_images: boolean;
  reload?: number;
  resize: number;
  settings: Map<string, any>;
  status: string;
  tab_is_visible: boolean;
  terminal?: Map<string, any>;
  value?: string;
}
