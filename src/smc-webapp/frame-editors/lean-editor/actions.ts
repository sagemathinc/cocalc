/*
Lean Editor Actions
*/

import { Actions as CodeEditorActions } from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";

export class Actions extends CodeEditorActions {
  _init2(): void {
    if (!this.is_public) {
      // start server (?)
    } else {
      this._init_value();
    }
  }

  _raw_default_frame_tree(): FrameTree {
    if (this.is_public) {
      return { type: "cm" };
    } else {
      return {
        direction: "col",
        type: "node",
        first: {
          type: "lean-cm"
        },
        second: {
          type: "lean-info"
        }
      };
    }
  }
}
