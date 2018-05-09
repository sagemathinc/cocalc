import { Map } from "immutable";

/* Interface for object that describes a binary tree */
export interface FrameTree {
  direction?: string;
  type: string;
  first?: FrameTree;
  second?: FrameTree;
  font_size?: number;
}

// Someday!
export type ImmutableFrameTree = Map<string, any>;

/* a hashmap from strings to boolean.  Basically useful as a set. */
export interface SetMap {
  [key: string]: boolean;
}
