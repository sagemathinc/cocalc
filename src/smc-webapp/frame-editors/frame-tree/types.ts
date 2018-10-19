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
