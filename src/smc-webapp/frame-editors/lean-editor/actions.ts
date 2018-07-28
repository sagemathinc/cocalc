/*
Lean Editor Actions
*/

import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";

import { FrameTree } from "../frame-tree/types";

interface LeanEditorState extends CodeEditorState {
  server: any;
}

export class Actions extends BaseActions<LeanEditorState> {
  _init2(): void {
    if (!this.is_public) {
      // start server (?)
      this._init_state();
    } else {
      this._init_value();
    }
  }

  _init_state(): void {
    this._init_syncdb(["type", "n"]);
    this._syncdb.on("change", () => {
      this.setState({ server: this._syncdb.get() });
    });
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
