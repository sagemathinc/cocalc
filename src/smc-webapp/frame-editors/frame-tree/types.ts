/* Interface for object that describes a binary tree */

export interface FrameTree {
  direction?: string;
  type: string;
  first?: FrameTree;
  second?: FrameTree;
  font_size?: number;
}
