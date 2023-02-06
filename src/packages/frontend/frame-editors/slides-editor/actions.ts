import { Actions as WhiteboardActions } from "../whiteboard-editor/actions";
import type { FrameTree } from "../frame-tree/types";
import type { Element } from "../whiteboard-editor/types";

// TODO: obviously hard coding this is very much a #v0 thing to do!
const SLIDE = {
  data: { aspectRatio: "16:9", radius: 0.5, noSelect: true },
  h: 3 * 197,
  w: 3 * 350,
  type: "slide",
  id: "the-slide",
  x: (-3 * 197) / 2,
  y: (-3 * 350) / 2,
  z: -9999,
} as Element;

export class Actions extends WhiteboardActions {
  readonly mainFrameType = "slides";
  readonly fixedElements: { [id: string]: Element } = {
    [SLIDE.id]: SLIDE,
  };

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
          second: { type: "slides_table_of_contents" },
          pos: 0.8,
        },
        pos: 0.8,
      },
      pos: 0.15,
    };
  }
}
