/*
Terminal Editor Actions
*/
import { Actions as CodeEditorActions } from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";

export class Actions extends CodeEditorActions {
  _init2(): void {}

  _raw_default_frame_tree(): FrameTree {
    return { type: "terminal" };
  }
  
  

}
