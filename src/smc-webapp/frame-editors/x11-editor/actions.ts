/*
X Window Editor Actions
*/

import { Map } from "immutable";

import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";

import { FrameTree } from "../frame-tree/types";
import { XpraClient } from "./xpra-client";

interface X11EditorState extends CodeEditorState {
  windows: Map<string, any>;
}

export class Actions extends BaseActions<X11EditorState> {
  // no need to open any syncstring for xwindow -- they don't use database sync.
  protected doctype: string = "none";
  protected client: XpraClient;

  _init2(): void {
    this.setState({ windows: Map() });
    this.connect();
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: "x11" };
  }

  close(): void {
    console.log("Actions.close");
    if (this.client == null) { return; }
    this.client.close();
    delete this.client;
  }

  connect(): void {
    this.client = new XpraClient({
      project_id: this.project_id,
      port: 2000
    });
  }

  focus(id?: string): void {
    console.log("x11 -- focus", id);
    if (id === undefined) {
      id = this._get_active_id();
    }
    if (this._get_frame_type(id) === "x11") {
      this.client.focus();
    } else {
      super.focus(id);
    }
  }

  blur() : void {
    console.log("x11 -- blur");
    this.client.blur();
  }
}
