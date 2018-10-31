// Use Xpra to provide X11 server.

import { retry_until_success } from "../generic/async-utils";

import { delay } from "awaiting";

import { reuseInFlight } from "async-await-utils/hof";

import { ConnectionStatus } from "../frame-tree/types";

import { Client } from "./xpra/client";

import { Surface } from "./xpra/surface";

import { XpraServer } from "./xpra-server";

import { touch, touch_project } from "../generic/client";

import { throttle } from "underscore";

const { open_new_tab } = require("smc-webapp/misc_page");

import { is_copy } from "./xpra/util";

const { alert_message } = require("smc-webapp/alerts");

const BASE_DPI: number = 96;

const KEY_EVENTS = ["keydown", "keyup", "keypress"];

const MOUSE_EVENTS = [
  "mousemove",
  "mousedown",
  "mouseup",
  "wheel",
  "mousewheel",
  "DOMMouseScroll"
];

interface Options {
  project_id: string;
  path: string;
}

import { EventEmitter } from "events";

let clipboard_error: boolean = false;

export class XpraClient extends EventEmitter {
  private options: Options;
  private client: Client;
  private server: XpraServer;
  public _ws_status: ConnectionStatus = "disconnected";
  private last_active: number = 0;
  private touch_interval: number;

  constructor(options: Options) {
    super();
    this.record_active = throttle(this.record_active.bind(this), 30000);
    this.connect = reuseInFlight(this.connect);
    this.options = options;
    this.client = new Client();
    this.server = new XpraServer({
      project_id: this.options.project_id
    });
    this.init_touch(); // so project is alive so long as x11 session is active in some sense.
    this.init_xpra_events();
    this.connect();
    this.copy_from_xpra = throttle(this.copy_from_xpra.bind(this), 200, {
      trailing: false
    });
  }

  get_display(): number {
    return this.server.get_display();
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
    this.client.disconnect();
    this.removeAllListeners();
    clearInterval(this.touch_interval);
    delete this.options;
    delete this.client;
  }

  async _connect(): Promise<void> {
    const options = await this.get_xpra_options();
    if (this.client === undefined) {
      return; // closed during async operation
    }
    this.client.connect(options);
  }

  async connect(): Promise<void> {
    // use this is dumb, but will do **for now**.  It's
    // dumb since instead when we reconnect to the network,
    // it should trigger attempting, etc.  But this will do.
    await retry_until_success({
      f: this._connect.bind(this),
      start_delay: 1000,
      max_delay: 6000,
      factor: 1.4
    });
  }

  private async get_xpra_options(): Promise<any> {
    if (!this.options) return; // closed
    const port = await this.server.start();
    if (!this.options) return; // closed
    const uri = `wss://${window.location.hostname}${window.app_base_url}/${
      this.options.project_id
    }/server/${port}/`;
    const dpi = Math.round(BASE_DPI * window.devicePixelRatio);
    return { uri, dpi, sound: false };
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

  async focus_window(wid: number): Promise<void> {
    if (wid && this.client.findSurface(wid) !== undefined) {
      this.client.focus(wid);
      // sometimes it annoyingly fails without this,
      // so we use it for now...
      await delay(100);
      this.client.focus(wid);
    }
  }

  close_window(wid: number): void {
    if (wid && this.client.findSurface(wid) !== undefined) {
      // Tells the backend xpra server that we want window to close.
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
        timeout: 9999
      });
    }
    const value = await this.get_clipboard();
    try {
      await clipboard.writeText(value);
    } catch (e) {
      throw Error(`Failed to copy to clipboard: ${e}`);
    }
  }

  event_keydown = ev => {
    // Annoying: typescript doesn't know ev is of type KeyboardEvent
    // todo -- second arg?
    const r = this.client.key_inject(ev as any, undefined);
    if (is_copy(ev as any)) {
      this.copy_from_xpra();
    }
    return r;
  };

  event_keyup = ev => {
    return this.client.key_inject(ev as any, undefined);
  };

  event_keypress = ev => {
    return this.client.key_inject(ev as any, undefined);
  };

  private enable_window_events(): void {
    if (this.client === undefined) {
      return;
    }
    const doc = $(document);
    for (let name of KEY_EVENTS) {
      doc.on(name, this[`event_${name}`]);
    }
    for (let name of MOUSE_EVENTS) {
      doc.on(name, (this.client as any).mouse_inject);
    }
  }

  private disable_window_events(): void {
    if (this.client === undefined) {
      return;
    }
    const doc = $(document);
    for (let name of KEY_EVENTS) {
      doc.off(name, this[`event_${name}`]);
    }
    for (let name of MOUSE_EVENTS) {
      doc.off(name, (this.client as any).mouse_inject);
    }
  }

  render_window(wid: number, elt: HTMLElement): void {
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

    // Also append any already known overlays.
    for (let id of this.client.window_ids()) {
      const w = this.client.findSurface(id);
      if (w && w.parent !== undefined && w.parent.wid === wid) {
        this.place_overlay_in_dom(w);
      }
    }
  }

  window_focus(wid: number): void {
    //console.log("window_focus ", wid);
    this.emit("window:focus", wid);
  }

  window_create(surface: Surface): void {
    //console.log("window_create", window);
    this.emit("window:create", surface.wid, {
      wid: surface.wid,
      width: surface.w,
      height: surface.h,
      title: surface.metadata.title
    });
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

    surface.rescale(scale, width, height);
    this.client.rescale_children(surface, scale);
    surface.x = 0;
    surface.y = 0;

    this.client.send(
      "configure-window",
      wid,
      surface.x,
      surface.y,
      surface.w,
      surface.h,
      surface.properties
    );
  }

  window_destroy(surface: Surface): void {
    //console.log("window_destroy", window);
    surface.destroy();
    this.emit("window:destroy", surface.wid);
  }

  window_icon({ wid, src, w, h }): void {
    //console.log("window_icon", wid, src);
    this.emit("window:icon", wid, src, w, h);
  }

  window_metadata(_): void {
    //console.log("window_metadata", info);
  }

  place_overlay_in_dom(overlay: Surface): void {
    const e = $(overlay.canvas);
    e.css("position", "absolute");
    if (overlay.parent === undefined) {
      throw Error("overlay must defined a parent");
    }
    const scale = overlay.parent.scale ? overlay.parent.scale : 1;
    const width = `${overlay.canvas.width / scale}px`,
      height = `${overlay.canvas.height / scale}px`,
      left = `${overlay.x / scale}px`,
      top = `${overlay.y / scale}px`;
    e.css({
      width,
      height,
      left,
      top,
      border: "1px solid rgba(0,0,0,.15)",
      borderRadius: "4px",
      boxShadow: "0 6px 12px rgba(0,0,0,.175)"
    });

    // if parent not in DOM yet, the following is no-op.
    $(overlay.parent.canvas)
      .parent()
      .append(e);
  }

  overlay_create(overlay: Surface): void {
    this.place_overlay_in_dom(overlay);
  }

  overlay_destroy(overlay: Surface): void {
    $(overlay.canvas).remove();
  }

  ws_status(status: ConnectionStatus): void {
    this.emit("ws:status", status);
    if (
      status === "disconnected" &&
      this._ws_status !== "disconnected" &&
      this.client !== undefined
    ) {
      this._ws_status = status;
      this.connect();
    } else {
      this._ws_status = status;
    }
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
}
