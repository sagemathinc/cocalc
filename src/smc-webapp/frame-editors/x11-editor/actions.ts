/*
X Window Editor Actions
*/

import { Map } from "immutable";

import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";

import { FrameTree } from "../frame-tree/types";
import "./xpra-client";

interface X11EditorState extends CodeEditorState {
  windows: Map<string, any>;
}

export class Actions extends BaseActions<X11EditorState> {
  // no need to open any syncstring for xwindow -- they don't use database sync.
  protected doctype: string = "none";

  _init2(): void {
    this.setState({ windows: Map() });
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: "x11" };
  }
}
