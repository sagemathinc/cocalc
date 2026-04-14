/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IconRef } from "@cocalc/frontend/components/icon";

import { Map, Set } from "immutable";
import { ReactNode } from "react";

import { AccountState } from "@cocalc/frontend/account/types";
import { IntlMessage } from "@cocalc/frontend/i18n";
import type { AvailableFeatures } from "@cocalc/frontend/project_configuration";

import type { Command } from "./commands";

export type FrameDirection = "row" | "col";

export interface FrameLeaf {
  type: string;
  font_size?: number;
  direction?: never;
  first?: never;
  second?: never;
  pos?: never;
  children?: never;
  sizes?: never;
  activeTab?: never;
}

export interface LegacyBinaryFrameNode {
  type: "node";
  direction?: FrameDirection;
  first: FrameTree;
  second: FrameTree;
  pos?: number;
  children?: never;
  sizes?: never;
  activeTab?: never;
  font_size?: never;
}

export interface NaryFrameNode {
  type: "node";
  direction?: FrameDirection;
  children: FrameTree[];
  sizes?: number[];
  first?: never;
  second?: never;
  pos?: never;
  activeTab?: never;
  font_size?: never;
}

export interface TabsFrameNode {
  type: "tabs";
  children: FrameTree[];
  activeTab?: number;
  direction?: never;
  first?: never;
  second?: never;
  pos?: never;
  sizes?: never;
  font_size?: never;
}

/* Shape for frame layout trees kept in local_view_state. */
export type FrameTree =
  | FrameLeaf
  | LegacyBinaryFrameNode
  | NaryFrameNode
  | TabsFrameNode;

// Someday!
export type ImmutableFrameTree = Map<string, any>;

export type NodeDesc = Map<string, any>;

/* a hashmap from strings to boolean.  Basically useful as a set. */
export interface SetMap {
  [key: string]: boolean;
}

export type ErrorStyles = undefined | "monospace";

export type ConnectionStatus = "disconnected" | "connected" | "connecting";

// Frame types are runtime-extensible. Built-in editors should still use stable,
// specific string ids, but the type system can no longer be a closed union.
export type EditorType = string;

// Editor spec
export interface EditorDescription {
  type: EditorType;
  short: string | IntlMessage; // short description of the editor
  name: string | IntlMessage; // slightly longer description
  icon: IconRef;
  component: (props: EditorComponentProps) => ReactNode | Promise<ReactNode>;

  // commands that will be displayed in the menu (if they exist)
  commands?: { [commandName: string]: boolean };
  // | ButtonFunction;
  // customizeCommands: use this to override label, tooltip, or anything
  // else about and command, specifically for this editor frame. This gets
  // merged in to the generic command, or added as a new command.
  customizeCommands?: { [commandName: string]: Partial<Command> };

  // which commands will also appear in the button bar (if available)
  // If a command is in a submenu, use '/' to link them together, i.e.,
  // 'format-font/bold' means the item named "bold" in the submenu
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

const LEGACY_FRAME_TYPE_ALIASES: Readonly<Record<string, string>> = {
  commands_guide: "snippets",
  course_actions: "course-actions",
  course_assignments: "course-assignments",
  course_configuration: "course-configuration",
  course_handouts: "course-handouts",
  course_shared_project: "course-shared_project",
  course_students: "course-students",
  grid: "csv-grid",
  introspect: "jupyter-introspect",
  jupyter_cell_notebook: "jupyter",
  jupyter_json: "jupyter_json_view",
  jupyter_minimal: "jupyter-minimal",
  jupyter_raw: "jupyter_json_edit",
  jupyter_slideshow_revealjs: "slideshow-revealjs",
  jupyter_table_of_contents: "jupyter-toc",
  latex_table_of_contents: "latex-toc",
  markdown_table_of_contents: "markdown-toc",
  overview: "whiteboard-overview",
  pages: "whiteboard-pages",
  pdf_embed: "preview-pdf-native",
  slideshow: "slides-slideshow",
  speaker_notes: "slides-notes",
  table_of_contents: "markdown-toc",
  time_travel: "timetravel",
  whiteboard_table_of_contents: "markdown-toc",
  word_count: "latex-word_count",
} as const;

export function canonicalFrameType(type: string): string {
  return LEGACY_FRAME_TYPE_ALIASES[type] ?? type;
}

export function getEditorDescription(
  editor_spec: EditorSpec,
  type: string,
): EditorDescription | undefined {
  const canonicalType = canonicalFrameType(type);
  for (const spec of Object.values(editor_spec)) {
    if (spec?.type === canonicalType) {
      return spec;
    }
  }
  return editor_spec[type];
}

export function getEditorDescriptions(
  editor_spec: EditorSpec,
): EditorDescription[] {
  const seen = new globalThis.Set<string>();
  const descriptions: EditorDescription[] = [];
  for (const spec of Object.values(editor_spec)) {
    if (spec == null || seen.has(spec.type)) continue;
    seen.add(spec.type);
    descriptions.push(spec);
  }
  return descriptions;
}

export function migrateLegacyFrameTreeTypes<T>(tree: T): T {
  if (tree == null || typeof tree !== "object") {
    return tree;
  }
  if (Array.isArray(tree)) {
    return tree.map((child) => migrateLegacyFrameTreeTypes(child)) as T;
  }
  const value = tree as Record<string, unknown>;
  const next: Record<string, unknown> = { ...value };
  if (typeof value.type === "string") {
    next.type = canonicalFrameType(value.type);
  }
  if (value.first != null) {
    next.first = migrateLegacyFrameTreeTypes(value.first);
  }
  if (value.second != null) {
    next.second = migrateLegacyFrameTreeTypes(value.second);
  }
  if (Array.isArray(value.children)) {
    next.children = value.children.map((child) =>
      migrateLegacyFrameTreeTypes(child),
    );
  }
  return next as T;
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
