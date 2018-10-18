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
  /* protected */ client: XpraClient;
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

  _set_window(wid: number, obj: any): void {
    let windows = this.store.get("windows");
    const s = `${wid}`;
    let window = windows.get(s);
    if (window == null) {
      console.warn(`_set_window -- no window with id ${wid}`);
      return;
    }
    for (let key in obj) {
      window = window.set(key, obj[key]);
    }
    windows = windows.set(s, window);
    this.setState({ windows });
  }

  _get_window(wid: number, key: string, def?: any): any {
    return this.store.get("windows").getIn([`${wid}`, key], def);
  }

  init_client(): void {
    this.client = new XpraClient({
      project_id: this.project_id,
      path: this.path
    });

    this.client.on("window:create", (wid: number, info) => {
      let windows = this.store.get("windows").set(`${wid}`, fromJS(info));
      this.setState({ windows });
    });

    this.client.on("window:destroy", (wid: number) => {
      let windows = this.store.get("windows").delete(`${wid}`);
      this.setState({ windows });
    });

    this.client.on("window:icon", (wid: number, icon: string) => {
      this._set_window(wid, { icon });
    });
  }

  focus(id?: string): void {
    //console.log("x11 -- focus", id);
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
    //console.log("x11 -- blur");
    if (this.client == null) {
      return;
    }
    this.client.blur();
  }

  // Set things so that the X11 window wid is displayed in the frame
  // with given id.  This is a no-op if wid is already displayed
  // in another frame.
  set_window(id: string, wid: number): void {
    // todo: make it so wid can only be in one x11 leaf...
    this.set_frame_tree({ id, wid });
    this.client.focus_window(wid);
    // ensure no other tab has this wid selected.
    for (let leaf_id in this._get_leaf_ids()) {
      if (leaf_id === id) {
        continue;
      }
      const leaf = this._get_frame_node(leaf_id);
      if (
        leaf != null &&
        leaf.get("type") === "x11" &&
        leaf.get("wid") === wid
      ) {
        this.set_frame_tree({ id: leaf_id, wid: undefined });
      }
    }
  }

  close_window(id: string, wid: number): void {
    this.client.close_window(wid);
    for (let leaf_id in this._get_leaf_ids()) {
      const leaf = this._get_frame_node(leaf_id);
      if (
        leaf != null &&
        leaf.get("type") === "x11" &&
        leaf.get("wid") === wid
      ) {
        this.set_frame_tree({ id: leaf_id, wid: undefined });
      }
    }
    // select a different window, if possible.
    console.log(id);
  }
}
