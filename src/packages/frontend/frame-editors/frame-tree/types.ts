/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";

import { IconName } from "@cocalc/frontend/components/icon";

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

// Editor spec

interface ButtonCustomize {
  text?: string; // overrides text content of the button
  title?: string; // overrides tooltip that pops up on hover.
}

type ButtonFunction = (path: string) => { [button_name: string]: true };

export interface EditorDescription {
  short: string; // short description of the editor
  name: string; // slightly longer description
  icon: IconName;
  component: any; // React component
  buttons?: { [button_name: string]: true } | ButtonFunction;
  // NOTE: customize is only implemented for shell button right now!
  customize_buttons?: { [button_name: string]: ButtonCustomize };
  hide_file_menu?: boolean; // If true, never show the File --> Dropdown menu.
  subframe_init?: Function;
  style?: object;
  path?: Function;
  fullscreen_style?: object;
  mode?: any; // I think it's a CM mode (?)
  reload_images?: boolean;
  gutters?: string[]; // I think it's cm gutters
  renderer?: string; // e.g., "canvas" or "svg"
  hide_public?: boolean; // if true, do not show this editor option (in title bar dropdown) when viewing file publicly.
  clear_info?: { text: string; confirm: string };
  guide_info?: { title?: string; descr?: string; icon?: IconName };
  placeholder?: string; // placeholder text to use when empty.
}

export interface EditorSpec {
  [editor_name: string]: EditorDescription;
}

export type EditorState = Map<string, any>; // TODO: use TypeMap and do this right.
