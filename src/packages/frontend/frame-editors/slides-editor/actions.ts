import { Actions as WhiteboardActions } from "../whiteboard-editor/actions";
import type { FrameTree } from "../frame-tree/types";

export class Actions extends WhiteboardActions {
  readonly mainFrameType = "slides";

  _raw_default_frame_tree(): FrameTree {
    return {
      direction: "col",
      type: "node",
      first: { type: "pages" },
      second: { type: "slides" },
      pos: 0.2,
    };
  }
}
