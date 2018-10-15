/*
X Window Editor Actions
*/

import { Map, fromJS } from "immutable";

import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";

import { FrameTree } from "../frame-tree/types";
import { XpraClient } from "./xpra-client";
import { Store } from "../../app-framework";

interface X11EditorState extends CodeEditorState {
  windows: Map<string, any>;
}

export class Actions extends BaseActions<X11EditorState> {
  // no need to open any syncstring for xwindow -- they don't use database sync.
  protected doctype: string = "none";
  protected client: XpraClient;
  public store: Store<X11EditorState>;

  _init2(): void {
    this.setState({ windows: Map() });
    this.init_client();
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: "x11" };
  }

  close(): void {
    console.log("Actions.close");
    if (this.client == null) {
      return;
    }
    this.client.close();
    delete this.client;
  }

  init_client(): void {
    this.client = new XpraClient({
      project_id: this.project_id,
      path: this.path
    });
    this.client.on("window:create", (id: string, info) => {
      let windows = this.store.get("windows").set(id, fromJS(info));
      this.setState({ windows });
    });
    this.client.on("window:icon", (id: string, icon: string) => {
      let windows = this.store.get("windows");
      let window = windows.get(id);
      if (window == null) {
        return;
      }
      window = window.set("icon", icon);
      windows = windows.set(id, window);
      this.setState({ windows });
    });
  }

  focus(id?: string): void {
    console.log("x11 -- focus", id);
    if (this.client == null) {
      return;
    }
    if (id === undefined) {
      id = this._get_active_id();
    }
    if (this._get_frame_type(id) === "x11") {
      this.client.focus();
    } else {
      super.focus(id);
    }
  }

  blur(): void {
    console.log("x11 -- blur");
    if (this.client == null) {
      return;
    }
    this.client.blur();
  }
}
