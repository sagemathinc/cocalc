/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";

import { IconName } from "@cocalc/frontend/components/icon";
import { IntlMessage } from "@cocalc/frontend/i18n";
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
  | "settings"
  | "maarkdown-toc"
  | "markdown"
  | "introspect"
  | "jupyter_json_view"
  | "jupyter_json_edit"
  | "jupyter-toc"
  | "timetravel"
  | "slate"
  | "jupyter"
  | "latex"
  | "wiki"
  | "cm"
  | "snippets"
  | "slideshow-revealjs";

// Editor spec
export interface EditorDescription {
  type: EditorType;
  short: string | IntlMessage; // short description of the editor
  name: string | IntlMessage; // slightly longer description
  icon: IconName;
  component: any; // React component

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
}

export interface EditorSpec {
  [editor_name: string]: EditorDescription;
}

export type EditorState = Map<string, any>; // TODO: use TypeMap and do this right.
