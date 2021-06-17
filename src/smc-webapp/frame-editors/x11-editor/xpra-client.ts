/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Use Xpra to provide X11 server.

import { join } from "path";
import { retry_until_success } from "smc-util/async-utils";
import { reuseInFlight } from "async-await-utils/hof";
import { ConnectionStatus } from "../frame-tree/types";
import { Client } from "./xpra/client";
import { Surface } from "./xpra/surface";
import { XpraServer, ExecOpts0 } from "./xpra-server";
import { ExecOutput } from "../generic/client";
import { touch, touch_project } from "../generic/client";
import { throttle } from "underscore";
import { open_new_tab } from "../../misc-page";
import { is_copy } from "./xpra/util";
import { alert_message } from "smc-webapp/alerts";
const sha1 = require("sha1");
import { close, hash_string } from "smc-util/misc";

const BASE_DPI: number = 96;

const KEY_EVENTS = ["keydown", "keyup", "keypress"];

const MOUSE_EVENTS = [
  "mousemove",
  "mousedown",
  "mouseup",
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "wheel",
  "mousewheel",
  "DOMMouseScroll",
];

interface Options {
  project_id: string;
  path: string;
  idle_timeout_ms: number;
}

import { EventEmitter } from "events";

let clipboard_error: boolean = false;

export class XpraClient extends EventEmitter {
  private options: Options;
  private client: Client;
  private server: XpraServer;
  public _ws_status: ConnectionStatus = "disconnected";
  private last_active: number = 0;
  private touch_interval: any; // TODO: really Timer
  private idle_interval: any; // TODO: really Timer
  private idle_timed_out: boolean = false; // true when disconnected due to idle timeout
  private display: number;

  constructor(options: Options) {
    super();
    this.record_active = throttle(this.record_active.bind(this), 30000);
    this.connect = reuseInFlight(this.connect);
    this.options = options;
    this.init_display();
    this.client = new Client();

    this.server = new XpraServer({
      project_id: this.options.project_id,
      display: this.display,
    });

    this.init_touch(); // so project is alive so long as x11 session is active in some sense.
    this.init_xpra_events();
    this.init_idle_timeout();
    this.connect();
    this.copy_from_xpra = throttle(this.copy_from_xpra.bind(this), 200, {
      trailing: false,
    });
  }

  // We make the display number the sha1 hash (made into a 31 bit number)
  // of the project_id and path.  This is so it is stable over sessions,
  // restarts, browsers, etc., but also different for differnet files.
  // If somebody opened a dozen x11 sessions, there's still only a one
  // in 1 in 3*10^(-8) chance of collision.    Coordinating with the backend
  // for the number would be annoying since the terminal session DISPLAY
  // might have to change, and it adds an extra async step (so more time)
  // to startup.
  init_display(): void {
    const s = `${this.options.project_id}${this.options.path}`;
    let h: number = hash_string(sha1(s));
    if (h < 0) {
      h = -h;
    }
    h = h % 2 ** 31;
    this.display = h;
  }

  get_display(): number {
    return this.display;
  }

  get_socket_path(): string {
    return this.server.get_socket_path();
  }

  close(): void {
    if (this.client === undefined) {
      return;
    }
    this.server.destroy();
    this.blur();
    this.client.destroy();
    this.removeAllListeners();
    clearInterval(this.touch_interval);
    clearInterval(this.idle_interval);
    close(this);
  }

  async close_and_halt(): Promise<void> {
    this.server.stop();
    this.close();
  }

  async _connect(): Promise<void> {
    const options = await this.get_xpra_options();
    if (this.client === undefined) {
      return; // closed during async operation
    }
    this.client.connect(options);
  }

  async connect(): Promise<void> {
    this.idle_timed_out = false;
    this.last_active = new Date().valueOf();
    this.emit("ws:idle", false);
    // use this is dumb, but will do **for now**.  It's
    // dumb since instead when we reconnect to the network,
    // it should trigger attempting, etc.  But this will do.
    await retry_until_success({
      f: this._connect.bind(this),
      start_delay: 1000,
      max_delay: 6000,
      factor: 1.4,
      desc: "xpra -- connect",
    });
  }

  private async get_xpra_options(): Promise<any> {
    if (!this.options) return; // closed
    const port = await this.server.start();
    if (!this.options) return; // closed

    // Get origin, but with http[s] stripped.
    // Do not use window.location.hostname, since that doesn't
    // include the port, if there is one.
    let origin = window.location.origin;
    const i = origin.indexOf(":");
    origin = origin.slice(i);

    const path = join(
      window.app_base_path,
      this.options.project_id,
      "server",
      `${port}`
    );
    const uri = `wss${origin}${path}`;
    const dpi = Math.round(BASE_DPI * window.devicePixelRatio);
    return { uri, dpi };
  }

  private init_xpra_events(): void {
    this.client.on("window:focus", this.window_focus.bind(this));
    this.client.on("window:create", this.window_create.bind(this));
    this.client.on("window:destroy", this.window_destroy.bind(this));
    this.client.on("window:icon", this.window_icon.bind(this));
    this.client.on("window:metadata", this.window_metadata.bind(this));
    this.client.on("overlay:create", this.overlay_create.bind(this));
    this.client.on("overlay:destroy", this.overlay_destroy.bind(this));
    this.client.on(
      "notification:create",
      this.handle_notification_create.bind(this)
    );
    this.client.on(
      "notification:destroy",
      this.handle_notification_destroy.bind(this)
    );
    this.client.on("ws:status", this.ws_status.bind(this));
    this.client.on("key", this.record_active);
    this.client.on("mouse", this.record_active);
    this.client.on("system:url", this.open_url.bind(this));
    //this.client.on("ws:data", this.ws_data.bind(this));  // ridiculously low level.
  }

  focus(): void {
    this.enable_window_events();
  }

  focus_window(wid: number): void {
    if (wid && this.client.findSurface(wid) !== undefined) {
      this.client.focus(wid);
    }
  }

  close_window(wid: number): void {
    if (wid && this.client.findSurface(wid) !== undefined) {
      // Tells the backend xpra server that we want window to close
      // This may or may not actually close the window, e.g., the window
      // might pop up a modal asking about unsaved changes, and cancelling
      // that keeps the window opened.  It's just a request.
      this.client.kill(wid);
    } else {
      // Window is not known but user wants to close it.  Just
      // close it in our store immediately so it goes away.
      // This should only happen if things get weirdly out of state...
      this.emit("window:destroy", wid);
    }
  }

  blur(): void {
    this.disable_window_events();
  }

  async get_clipboard(): Promise<string> {
    return await this.server.get_clipboard();
  }

  async copy_from_xpra(): Promise<void> {
    const clipboard = (navigator as any).clipboard;
    if (clipboard == null) {
      if (clipboard_error) {
        return;
      }
      clipboard_error = true;
      alert_message({
        type: "info",
        title: "X11 Clipboard Copy.",
        message:
          "Currently copying from graphical Linux applications requires Chrome version 66 or higher.  Try using the copy button for internal copy.",
        timeout: 9999,
      });
    }
    const value = await this.get_clipboard();
    try {
      await clipboard.writeText(value);
    } catch (e) {
      throw Error(`Failed to copy to clipboard: ${e}`);
    }
  }

  event_keydown = (ev) => {
    // Annoying: typescript doesn't know ev is of type KeyboardEvent
    // todo -- second arg?
    const r = this.client.key_inject(ev as any, undefined);
    if (is_copy(ev as any)) {
      this.copy_from_xpra();
    }
    return r;
  };

  event_keyup = (ev) => {
    return this.client.key_inject(ev as any, undefined);
  };

  event_keypress = (ev) => {
    return this.client.key_inject(ev as any, undefined);
  };

  private enable_window_events(): void {
    if (this.client === undefined) {
      return;
    }
    const doc = $(document);
    for (const name of KEY_EVENTS) {
      doc.on(name, this[`event_${name}`]);
    }
    for (const name of MOUSE_EVENTS) {
      doc.on(name, (this.client as any).mouse_inject);
    }
  }

  private disable_window_events(): void {
    if (this.client === undefined) {
      return;
    }
    const doc = $(document);
    for (const name of KEY_EVENTS) {
      doc.off(name, this[`event_${name}`]);
    }
    for (const name of MOUSE_EVENTS) {
      doc.off(name, (this.client as any).mouse_inject);
    }
  }

  insert_window_in_dom(wid: number, elt: HTMLElement): void {
    const surface = this.client.findSurface(wid);
    if (surface === undefined) {
      throw Error(`missing surface ${wid}`);
    }
    const canvas = surface.jq_canvas;

    // margin:auto makes it centered.
    canvas.css("margin", "auto");

    const e: JQuery<HTMLElement> = $(elt);
    e.empty();
    e.append(canvas);
  }

  window_focus(wid: number): void {
    //console.log("window_focus ", wid);
    this.emit("window:focus", wid);
  }

  window_create(surface: Surface): void {
    if (surface.metadata["transient-for"] && surface.parent) {
      // modal window on top of existing (assumed!) root window
      this.client.rescale_children(surface.parent);
      this.emit("child:create", surface.parent.wid, surface.wid);
    } else {
      this.emit(
        "window:create",
        surface.wid,
        surface.metadata.title,
        !!surface.metadata["modal"]
      );
    }
  }

  // Any new top-level window gets moved to position 0,0 and
  // resized to fill the screen.
  resize_window(
    wid: number,
    width: number,
    height: number,
    frame_scale: number = 1
  ): void {
    //console.log("resize_window", wid, width, height, frame_scale);
    const surface: Surface | undefined = this.client.findSurface(wid);
    if (surface === undefined) {
      //console.warn("no window", wid);
      return; // no such window
    }

    const scale = window.devicePixelRatio / frame_scale;
    surface.x = 0;
    surface.y = 0;
    surface.rescale(scale, width, height);
    this.client.rescale_children(surface);
  }

  window_destroy(surface: Surface): void {
    if (surface.parent != null) {
      this.emit("child:destroy", surface.parent.wid, surface.wid);
      surface.destroy();
      return;
    }
    // NOTE: surface.destroy() below deletes surface.wid -- https://github.com/sagemathinc/cocalc/issues/4904
    // Hence we emit window:destroy first, so that the tab is removed.
    this.emit("window:destroy", surface.wid);
    surface.destroy();
  }

  window_icon({ wid, src, w, h }): void {
    //console.log("window_icon", wid, src);
    const surface = this.client.findSurface(wid);
    if (!surface) {
      return;
    }
    if (surface.metadata && surface.metadata["transient-for"]) {
      // do not track icons for modals.
      return;
    }
    this.emit("window:icon", wid, src, w, h);
  }

  window_metadata(_): void {
    //console.log("window_metadata", info);
  }

  insert_child_in_dom(wid: number): void {
    const surface = this.client.findSurface(wid);
    if (surface == null) {
      // gone -- nothing to do.
      return;
    }
    if (surface.parent == null) {
      throw Error(`insert_child_in_dom: ${wid} must be a child`);
    }

    const e = $(surface.canvas);
    e.css("position", "absolute");
    const scale = surface.parent.scale ? surface.parent.scale : 1;
    const width = `${surface.canvas.width / scale}px`,
      height = `${surface.canvas.height / scale}px`,
      left = `${surface.x / scale}px`,
      top = `${surface.y / scale}px`;

    let border, boxShadow;
    if (surface.metadata["transient-for"]) {
      border = "1px solid lightgrey";
      boxShadow = "grey 0 0 20px";
    } else {
      border = "";
      boxShadow = "rgba(0, 0, 0, 0.25) 0px 6px 24px";
    }
    e.css({
      width,
      height,
      left,
      top,
      border,
      borderRadius: "4px",
      boxShadow,
      backgroundColor: "white",
    });

    // if parent not in DOM yet, the following is a no-op.
    $(surface.parent.canvas).parent().append(e);
  }

  overlay_create(overlay: Surface): void {
    if (overlay.parent == null) {
      return; // make typescript happy
    }
    this.emit("child:create", overlay.parent.wid, overlay.wid);
  }

  overlay_destroy(overlay: Surface): void {
    if (overlay.parent == null) {
      return; // make typescript happy
    }
    this.emit("child:destroy", overlay.parent.wid, overlay.wid);
    $(overlay.canvas).remove();
  }

  ws_status(status: ConnectionStatus): void {
    this.emit("ws:status", status);
    if (
      status === "disconnected" &&
      this._ws_status !== "disconnected" &&
      this.client !== undefined &&
      !this.idle_timed_out
    ) {
      this.connect();
    }
    this._ws_status = status;
  }

  ws_data(_, packet: any[]): void {
    console.log("ws_data", packet);
  }

  is_root_window(wid: number): boolean {
    const w = this.client.findSurface(wid);
    return w != null && !w.parent;
  }

  // call this when stuff is happening
  record_active(): void {
    this.last_active = new Date().valueOf();
  }

  async touch_if_active(): Promise<void> {
    if (new Date().valueOf() - this.last_active < 70000) {
      try {
        await touch_project(this.options.project_id);
        await touch(this.options.project_id, this.options.path);
      } catch (err) {
        console.warn("x11: issue touching ", err);
      }
    }
  }

  init_touch(): void {
    this.touch_interval = setInterval(this.touch_if_active.bind(this), 60000);
  }

  open_url(url): void {
    open_new_tab(url);
  }

  handle_notification_create(nid: number, desc): void {
    this.emit("notification:create", nid, desc);
  }

  handle_notification_destroy(nid: number): void {
    this.emit("notification:destroy", nid);
  }

  // Returns 0 if no parent.
  // Returns wid of the parent if there is one.
  get_parent(wid: number): number {
    const surface = this.client.findSurface(wid);
    return surface && surface.parent != null ? surface.parent.wid : 0;
  }

  public is_idle(): boolean {
    return this.idle_timed_out;
  }

  private init_idle_timeout(): void {
    const idle_timeout: number = this.options.idle_timeout_ms;
    if (!idle_timeout) {
      return;
    }
    this.idle_interval = setInterval(
      this.idle_timeout_if_inactive.bind(this),
      idle_timeout / 2
    );
  }

  private idle_timeout_if_inactive(): void {
    if (this.idle_timed_out) {
      return;
    }
    if (
      new Date().valueOf() - this.last_active >=
      this.options.idle_timeout_ms
    ) {
      // inactive
      this.idle_timed_out = true;
      this.emit("ws:idle", true);
      this.client.disconnect();
    }
  }

  public async exec(opts: ExecOpts0): Promise<ExecOutput> {
    return await this.server.exec(opts);
  }

  public set_physical_keyboard(layout: string, variant: string): void {
    this.client.set_physical_keyboard(layout, variant);
  }
}
