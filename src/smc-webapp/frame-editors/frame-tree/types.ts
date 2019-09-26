import { Map } from "immutable";

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

interface EditorDescription {
  short: string; // short description of the editor
  name: string; // slightly longer description
  icon: string;
  component: any; // React component
  buttons?: { [button_name: string]: true } | ButtonFunction;
  // NOTE: customize is only implemented for shell button right now!
  customize_buttons?: { [button_name: string]: ButtonCustomize };
  hide_file_menu?: boolean; // If true, never show the File --> Dropdown menu.
  subframe_init?: Function;
}

export interface EditorSpec {
  [editor_name: string]: EditorDescription;
}
