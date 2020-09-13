/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
X Window Editor Actions
*/

const HELP_URL = "https://doc.cocalc.com/x11.html";

// 15 minute idle timeout -- it's important to disconnect
// the websocket to the xpra server, to avoid a massive
// waste of bandwidth...
const CLIENT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

import { Channel } from "smc-webapp/project/websocket/types";

import { Map, Set as immutableSet, fromJS } from "immutable";

import { project_api } from "../generic/client";

import { set_buffer, get_buffer } from "../../copy-paste-buffer";

import { reuseInFlight } from "async-await-utils/hof";
import { callback, delay } from "awaiting";
import { assertDefined } from "smc-util/misc2";

import {
  X11Configuration,
  Capabilities,
  isMainConfiguration,
} from "../../project_configuration";

const WID_HISTORY_LENGTH = 40;

import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";

import { ConnectionStatus, FrameTree } from "../frame-tree/types";
import { XpraClient } from "./xpra-client";
import { Store } from "../../app-framework";

const { alert_message } = require("smc-webapp/alerts");

const { open_new_tab } = require("smc-webapp/misc_page");

interface X11EditorState extends CodeEditorState {
  windows: Map<number, any>;
  x11_is_idle: boolean;
  disabled?: boolean;
  config_unknown?: boolean;
  x11_apps: Readonly<Capabilities>;
}

export class Actions extends BaseActions<X11EditorState> {
  // no need to open any syncstring for xwindow -- they don't use database sync.
  private channel?: Channel;
  private wid_history: number[] = []; // array of wid that were active
  protected doctype: string = "none";
  public store: Store<X11EditorState>;
  client?: XpraClient;

  async _init2(): Promise<void> {
    await this.check_capabilities();
    this.launch = reuseInFlight(this.launch);
    this.setState({ windows: Map() });
    this.init_client();
    this.init_new_x11_frame();
    try {
      await this.init_channel();
    } catch (err) {
      this.set_error(
        // TODO: should retry instead (?)
        err +
          " -- you might need to refresh your browser or close and open this file."
      );
    }
  }

  // sets disabled to true or false, if x11 is available
  async check_capabilities(): Promise<void> {
    const proj_actions = this.redux.getProjectActions(this.project_id);

    let x11_apps: Readonly<Capabilities> = {};
    let config_unknown = true;
    const ok = await (async () => {
      // we should already know that:
      const main_conf = await proj_actions.init_configuration("main");
      if (main_conf == null) return false;
      if (!isMainConfiguration(main_conf)) return false;
      if (main_conf.capabilities.x11 === false) {
        // we learned there is no xpra
        return false;
      }

      // next, we check for specific apps
      const x11_conf = (await proj_actions.init_configuration(
        "x11"
      )) as X11Configuration;
      if (x11_conf == null) return false;
      // from here, we know that we have x11 status information
      config_unknown = false;
      x11_apps = Object.freeze(x11_conf.capabilities);
      if (x11_apps == null) return false;
      return true;
    })();
    this.setState({ disabled: !ok, config_unknown, x11_apps });
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
        direction: "row",
        type: "node",
        first: {
          type: "terminal",
        },
        second: {
          type: "launcher",
        },
      },
      second: {
        type: "x11",
      },
      pos: 0.25,
    };
  }

  init_new_x11_frame(): void {
    this.store.on("new-frame", ({ id, type }) => {
      if (type !== "x11") {
        return;
      }
      this.set_frame_tree({ id, wid: undefined, title: "" });
      // Just update this for all x11 frames for now.
      if (this.client != null) {
        this.set_x11_connection_status(this.client._ws_status);
      }
      this.update_x11_tabs();
    });
  }

  // overrides parent class method
  get_term_env() {
    assertDefined(this.client);
    const DISPLAY = `:${this.client.get_display()}`;
    // This supports url forwarding via xdg-open wrapper:
    const XPRA_XDG_OPEN_SERVER_SOCKET = this.client.get_socket_path();
    // https://github.com/sagemathinc/cocalc/issues/4120
    const MPLBACKEND = "WxAgg"; // a more conservative (b/c old) choice is TkAgg
    return { DISPLAY, XPRA_XDG_OPEN_SERVER_SOCKET, MPLBACKEND };
  }

  close(): void {
    if (this.client == null) {
      return;
    }
    this.client.close();
    delete this.client;
    if (this.channel != null) {
      try {
        this.channel.end();
      } catch (_) {
        // this can throw an error, but we don't care.
      }
      delete this.channel;
    }
    super.close();
  }

  _set_window(wid: number, obj: any): void {
    let windows = this.store.get("windows");
    let window = windows.get(wid);
    if (window == null) {
      console.warn(`_set_window -- no window with id ${wid}`);
      return;
    }
    for (const key in obj) {
      window = window.set(key, obj[key]);
    }
    windows = windows.set(wid, window);
    this.setState({ windows });
  }

  _get_window(wid: number, key: string, def?: any): any {
    return this.store.get("windows").getIn([wid, key], def);
  }

  delete_window(wid: number): void {
    const windows = this.store.get("windows").delete(wid);
    this.setState({ windows });
  }

  init_client(): void {
    this.client = new XpraClient({
      project_id: this.project_id,
      path: this.path,
      idle_timeout_ms: CLIENT_IDLE_TIMEOUT_MS,
    });

    this.client.on(
      "window:create",
      (wid: number, title: string, is_modal: boolean) => {
        this.push_to_wid_history(wid);
        const windows = this.store
          .get("windows")
          .set(wid, fromJS({ wid, title, is_modal }));
        this.setState({ windows });
        this.update_x11_tabs();
      }
    );

    this.client.on("window:destroy", (wid: number) => {
      this.delete_window(wid);
      this.switch_to_window_after_this_closes(wid);
    });

    this.client.on("child:create", (parent_wid: number, child_wid: number) => {
      this.children_op(parent_wid, child_wid, "add");
    });

    this.client.on("child:destroy", (parent_wid: number, child_wid: number) => {
      this.children_op(parent_wid, child_wid, "delete");
    });

    this.client.on("window:icon", (wid: number, icon: string) => {
      this._set_window(wid, { icon });
    });

    this.client.on("ws:status", (status: string) => {
      // Right now all x11 frames for a given path
      ///are connected to
      // the same remote session,
      // so we set desc on all of them.  Later we
      // may have multiple sessions,
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

    this.client.on("ws:idle", (x11_is_idle: boolean) => {
      this.setState({ x11_is_idle });
    });

    this.client.on("notification:create", (nid: number, desc) => {
      this.create_notification(nid, desc);
    });

    this.client.on("notification:destroy", (nid: number) => {
      this.delete_notification(nid);
    });
  }

  private children_op(parent_wid: number, child_wid: number, op: string) {
    let windows = this.store.get("windows");
    let parent = windows.get(parent_wid);
    if (!parent) {
      return;
    }
    const children = parent.get("children", immutableSet())[op](child_wid);
    parent = parent.set("children", children);
    windows = windows.set(parent_wid, parent);
    this.setState({ windows });
  }

  set_x11_connection_status(status: ConnectionStatus): void {
    for (const leaf_id in this._get_leaf_ids()) {
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
    } else {
      this.set_active_id(id);
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

  reload(id: string): void {
    const leaf = this._get_frame_node(id);
    if (leaf == null || leaf.get("type") != "x11") {
      super.reload(id);
      return;
    }
    this.set_reload("x11", new Date().valueOf());
  }

  blur(): void {
    if (this.client == null) {
      return;
    }
    this.client.blur();
  }

  // Set things so that the X11 window wid is displayed in
  // the frame with given id.
  set_focused_window_in_frame(
    id: string,
    wid: number,
    do_not_ensure = false
  ): void {
    const modal_wids = this.get_modal_wids();
    if (modal_wids.size > 0 && !modal_wids.has(wid)) {
      this.set_error(
        "Close any modal tabs before switching to a non-modal tab."
      );
      return;
    }
    this.push_to_wid_history(wid);
    const leaf = this._get_frame_node(id);
    if (leaf == null || leaf.get("type") !== "x11") {
      return;
    }
    const window = this.store.get("windows").get(wid);
    if (window == null) {
      // wid does not exist.
      return;
    }
    const title = window.get("title");
    this.set_frame_tree({ id, wid, title });
    this.client?.focus_window(wid);
    if (!do_not_ensure) {
      this._ensure_only_one_tab_has_wid(id, wid);
    }
  }

  _ensure_only_one_tab_has_wid(id: string, wid: number): void {
    // ensure no other tab has this wid selected.
    for (const leaf_id in this._get_leaf_ids()) {
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
        this.update_x11_tabs();
        return; // only possibly clear once.
      }
    }
  }

  close_window(id: string, wid: number): void {
    const leaf = this._get_frame_node(id);
    if (leaf != null && leaf.get("type") === "x11") {
      this.client?.close_window(wid);
    }
  }

  switch_to_window_after_this_closes(wid: number, id?: string): void {
    if (id === undefined) {
      for (const leaf_id in this._get_leaf_ids()) {
        const leaf = this._get_frame_node(leaf_id);
        if (
          leaf != null &&
          leaf.get("type") === "x11" &&
          leaf.get("wid") === wid
        ) {
          this.switch_to_window_after_this_closes(wid, leaf_id);
        }
      }
      return;
    }

    const parent_wid = this.client?.get_parent(wid);
    if (parent_wid) {
      this.set_focused_window_in_frame(id, parent_wid);
      return;
    }

    // Focus a recent available tab.
    this.update_x11_tabs();
  }

  create_notification(_: number, desc: any): void {
    // use something like this in a terminal to cause a notification:
    //    xpra control --socket-dir=/tmp/xpra :0 send-notification 0 "foo" "hello" "*"
    //console.log("create_notification", nid, desc);
    if (desc.summary.indexOf("Network Performance") !== -1) {
      // ignore these -- network gets slow frequently due to
      // browser background throttling... and we haven't implemented
      // any way for user to "ignore".
      return;
    }
    alert_message({
      type: "info",
      title: `X11: ${desc.summary}`,
      message: desc.body,
      timeout: 9999,
    });
  }

  delete_notification(_: number): void {
    // NO-OP
    // console.log("delete_notification", nid);
  }

  async paste(id: string, value?: string | true): Promise<void> {
    const leaf = this._get_frame_node(id);
    if (leaf == null) {
      return;
    }
    if (leaf.get("type") === "x11") {
      if (value === undefined || value === true) {
        value = get_buffer();
      }
      if (value === undefined) {
        // nothing to paste
        return;
      }
      this.channel?.write({ cmd: "paste", value });
    } else {
      super.paste(id, value);
    }
  }

  async copy(id: string): Promise<void> {
    const leaf = this._get_frame_node(id);
    if (leaf == null) {
      return;
    }
    if (leaf.get("type") === "x11") {
      if (this.client) {
        const value = await this.client.get_clipboard();
        set_buffer(value);
      }
    } else {
      super.copy(id);
    }
  }

  private async init_channel(): Promise<void> {
    if (this._state === "closed" || this.client == null) return;
    const api = await project_api(this.project_id);
    this.channel = await api.x11_channel(this.path, this.client.get_display());
    const channel: any = this.channel;
    channel.on("close", () => {
      channel.removeAllListeners();
      channel.conn.once("open", async () => {
        await this.init_channel();
      });
    });
    channel.on("data", (x) => {
      if (typeof x === "object") {
        this.handle_data_from_channel(x);
      }
    });
  }

  private handle_data_from_channel(x: any): void {
    if (x == null) {
      return;
    }
    //console.log("handle_data_from_channel", x);
    if (x.error != null) {
      if (x.error.indexOf("unknown command") !== -1) {
        x.error = "You probably need to restart your project.  " + x.error;
      }
      this.set_error(x.error);
    }
  }

  // Update x11 tabs to get as close as we can to having
  // a tab selected in each x11 frame.
  private update_x11_tabs(): void {
    const modal_wids: Set<number> = this.get_modal_wids();
    const used_wids = this._get_used_wids();

    const windows = this.store.get("windows");

    if (modal_wids.size > 0) {
      // there is a modal window -- in this case we just consider
      // all non-modal windows as used, so they can't get seleted below.
      for (const id of new Set(windows.keys())) {
        if (!modal_wids.has(id)) {
          used_wids[id] = true;
        }
      }
    }

    for (const leaf_id in this._get_leaf_ids()) {
      const leaf = this._get_frame_node(leaf_id);
      if (leaf == null || leaf.get("type") !== "x11") {
        continue;
      }
      if (windows.has(leaf.get("wid"))) {
        // tab already set
        if (modal_wids.size > 0) {
          // modal case -- only continue if this one is modal
          if (modal_wids.has(leaf.get("wid"))) {
            continue;
          }
        } else {
          // non-modal -- always continue.
          continue;
        }
      }
      // Set this leaf to something not already used,
      // preferring most recently created or focused windows.
      let success: boolean = false;
      for (let i = this.wid_history.length - 1; i >= 0; i--) {
        const wid: number = this.wid_history[i];
        if (!used_wids[wid] && windows.has(wid)) {
          // bingo -- it's not used and exists.
          this.set_focused_window_in_frame(leaf_id, wid, true);
          used_wids[wid] = true;
          success = true;
          break;
        }
      }
      if (!success) {
        // nothing found; make final attempt by just
        // go through all available window ids'
        windows.forEach((_, wid) => {
          if (!used_wids[wid]) {
            used_wids[wid] = true;
            this.set_focused_window_in_frame(leaf_id, wid, true);
            success = true;
            return false; // stop iteration
          }
        });
      }
      if (!success) {
        // still nothing -- at least clear the title
        this.set_title(leaf_id, "");
      }
    }
  }

  private push_to_wid_history(wid: number): void {
    this.wid_history.push(wid);
    if (this.wid_history.length > WID_HISTORY_LENGTH) {
      this.wid_history.shift();
    }
  }

  private _get_used_wids(): { [id: string]: boolean } {
    const used_wids = {};
    for (const leaf_id in this._get_leaf_ids()) {
      const leaf = this._get_frame_node(leaf_id);
      if (leaf != null && leaf.get("type") === "x11" && leaf.get("wid")) {
        used_wids[leaf.get("wid")] = true;
      }
    }
    return used_wids;
  }

  // if the x11 connection is idle timed out, call
  // this to reconnect.  This is a NO-OP if client
  // is not idle.
  x11_not_idle(): void {
    if (this.client == null) return;
    if (this.store.get("x11_is_idle")) {
      this.setState({ windows: Map() });
      this.client.connect();
    }
  }

  public async close_and_halt(_: string): Promise<void> {
    if (this.client == null) return;
    await this.client.close_and_halt();
    // and close this window
    const project_actions = this._get_project_actions();
    project_actions.close_tab(this.path);
  }

  async launch(command: string, args?: string[]): Promise<void> {
    if (this.client == null) return;
    if (this.client._ws_status !== "connected") {
      // Wait until connected
      this.set_status(`Waiting until connected before launching ${command}...`);
      const wait = (cb) => {
        const f = (status) => {
          if (status === "connected") {
            this.client?.removeListener("ws:status", f);
            cb();
          }
        };
        this.client?.addListener("ws:status", f);
      };
      await callback(wait);
      this.set_status("");
    }
    // Launch the command
    this.channel?.write({ cmd: "launch", command, args });
    // TODO: wait for a status message back...

    const project_actions = this._get_project_actions();
    project_actions.log({
      event: "x11",
      action: "launch",
      path: this.path,
      command,
    });
  }

  set_physical_keyboard(layout: string, variant: string): void {
    if (this.client == null) {
      // better to ignore if client isn't configured yet.
      // I saw this once when testing. (TODO: could be more careful.)
      return;
    }
    this.client.set_physical_keyboard(layout, variant);
  }

  private get_modal_wids(): Set<number> {
    const wids: Set<number> = new Set();
    this.store.get("windows").forEach((window, wid) => {
      if (window.get("is_modal")) {
        wids.add(wid);
      }
    });
    return wids;
  }

  // for X11, we just want to communicate the %-value
  set_status_font_size(font_size: number, default_font_size) {
    const percent = Math.round((font_size * 100) / default_font_size);
    this.set_status(`Set zoom to ${percent}%`, 1500);
  }

  help(): void {
    open_new_tab(HELP_URL);
  }

  public hide(): void {
    // This is called when the X11 editor tab is hidden.
    // In this case, we disable the keyboard handler.
    this.blur();
    super.hide(); // Critical to also call parent hide.
  }

  public async show(): Promise<void> {
    // Called when x11 editor tab is made active.
    await delay(0);
    this.focus();
    super.show();
  }
}
