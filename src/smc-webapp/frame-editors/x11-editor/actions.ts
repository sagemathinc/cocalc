/*
X Window Editor Actions
*/

import { Map, fromJS } from "immutable";

import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";

import { ConnectionStatus, FrameTree } from "../frame-tree/types";
import { XpraClient } from "./xpra-client";
import { Store } from "../../app-framework";

interface X11EditorState extends CodeEditorState {
  windows: Map<string, any>;
}

export class Actions extends BaseActions<X11EditorState> {
  // no need to open any syncstring for xwindow -- they don't use database sync.
  protected doctype: string = "none";
  public store: Store<X11EditorState>;
  client: XpraClient;

  _init2(): void {
    this.setState({ windows: Map() });
    this.init_client();
    this.init_new_x11_frame();
  }

  /*
  _raw_default_frame_tree(): FrameTree {
    return { type: "x11" };
  }
  */
  _raw_default_frame_tree(): FrameTree {
    return {
      direction: "col",
      type: "node",
      first: {
        type: "terminal"
      },
      second: {
        type: "x11"
      },
      pos: 0.25
    };
  }

  init_new_x11_frame(): void {
    this.store.on("new-frame", desc => {
      if (desc.type !== "x11") {
        return;
      }
      // Just update this for all x11 frames for now.
      this.set_x11_connection_status(this.client._ws_status);
    });
  }

  get_term_env(): any {
    const DISPLAY = `:${this.client.get_display()}`;
    return { DISPLAY };
  }

  close(): void {
    if (this.client == null) {
      return;
    }
    this.client.close();
    delete this.client;
    super.close();
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

    this.client.on("window:focus", (wid: number) => {
      //console.log("window:focus", wid);
      // if it is a full root level window, switch to show it.
      if (!this.client.is_root_window(wid)) {
        return;
      }
      const active_id = this._get_active_id();
      const leaf = this._get_frame_node(active_id);
      let id;
      if (leaf && leaf.get("type") === "x11") {
        id = active_id;
      } else {
        id = this._get_most_recent_active_frame_id_of_type("x11");
      }
      if (id != null) {
        const title = this.store.get("windows").getIn([`${wid}`, "title"]);
        this.set_frame_tree({ id, wid, title });
        this._ensure_only_one_tab_has_wid(id, wid);
      }
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

    this.client.on("ws:status", (status: string) => {
      // Right now all x11 frames are connected to the same remote session,
      // so we set desc on all of them.  Later we may have multiple sessions,
      // like with the terminal.
      if (
        status === "disconnected" ||
        status === "connecting" ||
        status === "connected"
      ) {
        // make typescript happy with checking status is an allowed value.
        this.set_x11_connection_status(status);
      }
    });
  }

  set_x11_connection_status(status: ConnectionStatus): void {
    for (let leaf_id in this._get_leaf_ids()) {
      const leaf = this._get_frame_node(leaf_id);
      if (
        leaf != null &&
        leaf.get("type") === "x11" &&
        leaf.get("connection_status") != status
      ) {
        this.set_frame_tree({ id: leaf_id, connection_status: status });
      }
    }
  }

  focus(id?: string): void {
    // console.log("x11 -- focus", id);
    if (this.client == null) {
      return;
    }
    if (id === undefined) {
      id = this._get_active_id();
    }
    const leaf = this._get_frame_node(id);
    if (leaf == null) {
      return;
    }
    if (leaf.get("type") === "x11") {
      const wid = leaf.get("wid");
      if (wid) {
        this.client.focus_window(leaf.get("wid"));
        this.client.focus();
      } else {
        this.client.blur();
      }
    } else {
      this.client.blur();
      super.focus(id);
    }
  }

  blur(): void {
    // console.log("x11 -- blur");
    if (this.client == null) {
      return;
    }
    this.client.blur();
  }

  // Set things so that the X11 window wid is displayed in the frame
  // with given id.
  set_focused_window_in_frame(id: string, wid: number): void {
    const leaf = this._get_frame_node(id);
    if (leaf == null || leaf.get("type") != "x11") {
      return;
    }
    // todo: make it so wid can only be in one x11 leaf...
    const title = this.store.get("windows").getIn([`${wid}`, "title"]);
    this.set_frame_tree({ id, wid, title });
    this.client.focus_window(wid);
    this._ensure_only_one_tab_has_wid(id, wid);
  }

  _ensure_only_one_tab_has_wid(id: string, wid: number): void {
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
        //console.log("clearing", id, wid, leaf.toJS());
        this.set_frame_tree({ id: leaf_id, wid: undefined, title: "" });
      }
    }
  }

  close_window(id: string, wid: number): void {
    console.log("close_window ", id);
    // Determine the previous available window.
    const used_wids = {};
    for (let leaf_id in this._get_leaf_ids()) {
      const leaf = this._get_frame_node(leaf_id);
      if (leaf != null && leaf.get("wid")) {
        used_wids[leaf.get("wid")] = true;
      }
    }
    console.log("used_wids = ", used_wids);
    let wid1 = 0;
    this.store.get("windows").forEach(function(_, wid0) {
      if (parseInt(wid0) === wid) {
        return false;
      }
      if (!used_wids[wid0]) {
        wid1 = parseInt(wid0);
      }
    });
    if (wid1) {
      this.set_focused_window_in_frame(id, wid1);
    } else {
      // nothing available -- at least clear the title.
      this.set_title(id, "");
    }
    this.client.close_window(wid);
  }

  // Start a program running.
  // I do NOT know how to do this yet
  // Maybe need to add an option to exec to spawn a subprocess
  // and detach or something.
  /*
  async exec_command(command: string, args: string[] = []): Promise<> {
    const env = get_term_env();
    exec({command, args, env});
  }
  */
}
