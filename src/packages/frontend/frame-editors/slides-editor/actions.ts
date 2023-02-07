import { Actions as WhiteboardActions } from "../whiteboard-editor/actions";
import type { FrameTree } from "../frame-tree/types";
import fixedElements from "./fixed-elements";

export class Actions extends WhiteboardActions {
  readonly mainFrameType = "slides";
  readonly fixedElements = fixedElements;

  _raw_default_frame_tree(): FrameTree {
    return {
      direction: "col",
      type: "node",
      first: { type: "pages" },
      second: {
        direction: "row",
        type: "node",
        first: { type: "slides" },
        second: {
          direction: "col",
          type: "node",
          first: { type: "speaker_notes" },
          second: { type: "table_of_contents" },
          pos: 0.8,
        },
        pos: 0.8,
      },
      pos: 0.15,
    };
  }
}
