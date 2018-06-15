/*
Sage Worksheet Editor Actions
*/

import { Actions as CodeEditorActions } from "../code-editor/actions";
//import { print_html } from "../frame-tree/print";
import { FrameTree } from "../frame-tree/types";

export class Actions extends CodeEditorActions {
  _init2(): void {
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: "cells" }
  }

  print(id: string): void {
    console.warn('TODO -- print', id);
  }
}
