/*
Terminal Editor Actions
*/
import { Actions as CodeEditorActions } from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";

import { connect_to_server } from "./connect-to-server";

export class Actions extends CodeEditorActions {
  private terminals: any = {};

  _init2(): void {}

  _raw_default_frame_tree(): FrameTree {
    return { type: "terminal" };
  }

  set_terminal(id: string, terminal: any): void {
    this.terminals[id] = terminal;
    connect_to_server(this.project_id, this.path, terminal);
  }
}
