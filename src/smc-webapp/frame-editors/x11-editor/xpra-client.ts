// Use Xpra to provide X11 server.

import { delay } from "awaiting";

import { reuseInFlight } from "async-await-utils/hof";

import { ConnectionStatus } from "../frame-tree/types";

import { createClient } from "./xpra/client";

import { XpraServer } from "./xpra-server";

import { touch, touch_project } from "../generic/client";

import { throttle } from "underscore";

const BASE_DPI: number = 96;

const KEY_EVENTS = ["keydown", "keyup", "keypress"];

// Never resize beyond this (since it's the backend size)
export const MAX_WIDTH = 4000;
export const MAX_HEIGHT = 3000;

// Also, very bad things happen if a canvas ever has width or height 0.
export const MIN_WIDTH = 10;
export const MIN_HEIGHT = 10;

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

export class XpraClient extends EventEmitter {
  private options: Options;
  private xpra_options: any;
  private client: any;
  private windows: any = {};
  private server: XpraServer;
  public _ws_status: ConnectionStatus = "disconnected";
  private last_active: number = 0;
  private touch_interval: number;

  constructor(options: Options) {
    super();
    this.record_active = throttle(this.record_active.bind(this), 30000);
    this.connect = reuseInFlight(this.connect);
    this.options = options;
    this.server = new XpraServer({
      project_id: this.options.project_id
    });
    this.init_touch(); // so project is alive so long as x11 session is active in some sense.
    this.init();
  }

  get_display(): number {
    return this.server.get_display();
  }

  async init(): Promise<void> {
    await this.init_client();
    this.init_xpra_events();
    this.connect();
  }

  close(): void {
    if (this.client === undefined) {
      return;
    }
    this.blur();
    this.client.disconnect();
    this.removeAllListeners();
    clearInterval(this.touch_interval);
    delete this.windows;
    delete this.options;
    delete this.xpra_options;
    delete this.client;
  }

  async connect(): Promise<void> {
    await this.init_xpra_options();
    if (!this.options) return; // closed
    this.client.connect(this.xpra_options);
  }

  private async init_xpra_options(): Promise<void> {
    if (!this.options) return; // closed
    const port = await this.server.start();
    if (!this.options) return; // closed
    const uri = `wss://${window.location.hostname}${window.app_base_url}/${
      this.options.project_id
    }/server/${port}/`;
    const dpi = Math.round(BASE_DPI * window.devicePixelRatio);
    this.xpra_options = { uri, dpi, sound: false };
  }

  private async init_client(): Promise<void> {
    await this.init_xpra_options();
    if (!this.options) return; // closed
    this.client = createClient(this.xpra_options);
  }

  private init_xpra_events(): void {
    this.client.on("window:focus", this.window_focus.bind(this));
    this.client.on("window:create", this.window_create.bind(this));
    this.client.on("window:destroy", this.window_destroy.bind(this));
    this.client.on("window:icon", this.window_icon.bind(this));
    this.client.on("window:metadata", this.window_metadata.bind(this));
    this.client.on("overlay:create", this.overlay_create.bind(this));
    this.client.on("overlay:destroy", this.overlay_destroy.bind(this));
    this.client.on("ws:status", this.ws_status.bind(this));
    this.client.on("key", this.record_active);
    this.client.on("mouse", this.record_active);
    //this.client.on("ws:data", this.ws_data.bind(this));  // ridiculously low level.
  }

  focus(): void {
    this.enable_window_events();
  }

  async focus_window(wid: number): Promise<void> {
    if (wid && this.windows[wid] !== undefined) {
      this.client.surface.focus(wid);
      // sometimes it annoyingly fails without this,
      // so we use it for now...
      await delay(100);
      this.client.surface.focus(wid);
    }
  }

  close_window(wid: number): void {
    if (wid && this.windows[wid] !== undefined) {
      // Tells the backend xpra server that we want window to close.
      this.client.surface.kill(wid);
    }
  }

  blur(): void {
    this.disable_window_events();
  }

  private enable_window_events(): void {
    if (this.client === undefined) {
      return;
    }
    const doc = $(document);
    for (let name of KEY_EVENTS) {
      doc.on(name, this.client.key_inject);
    }
    for (let name of MOUSE_EVENTS) {
      doc.on(name, this.client.mouse_inject);
    }
  }

  private disable_window_events(): void {
    if (this.client === undefined) {
      return;
    }
    const doc = $(document);
    for (let name of KEY_EVENTS) {
      doc.off(name, this.client.key_inject);
    }
    for (let name of MOUSE_EVENTS) {
      doc.off(name, this.client.mouse_inject);
    }
  }

  render_window(wid: number, elt: HTMLElement): void {
    const info = this.windows[wid];
    if (info === undefined) {
      throw Error("no such window");
    }
    const canvas = $(info.canvas);

    // margin:auto makes it centered.
    canvas.css("margin", "auto");

    const e: JQuery<HTMLElement> = $(elt);
    e.empty();
    e.append(canvas);

    // Also append any already known overlays.
    for (let id in this.windows) {
      const w = this.windows[id];
      if (w.parent.wid === wid) {
        this.place_overlay_in_dom(w);
      }
    }
  }

  window_focus(info: { wid: number }): void {
    //console.log("window_focus ", info.wid);
    this.emit("window:focus", info.wid);
  }

  window_create(window): void {
    //console.log("window_create", window);
    this.windows[window.wid] = window;
    this.emit("window:create", window.wid, {
      wid: window.wid,
      width: window.w,
      height: window.h,
      title: window.metadata.title
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
    const info = this.windows[wid];
    if (info == null) {
      //console.warn("no window", wid);
      return; // no such window
    }

    const scale = window.devicePixelRatio / frame_scale;
    const surface = this.client.findSurface(wid);
    if (!surface) {
      // just removed?
      return;
    }
    let swidth0, sheight0;
    let swidth = (swidth0 = Math.round(width * scale));
    let sheight = (sheight0 = Math.round(height * scale));

    // In some cases, we will only potentially SHRINK (so buttons can be seen!),
    // but not enlarge, which is usually really annoying.
    if (
      info.metadata != null &&
      info.metadata["window-type"] != null &&
      info.metadata["window-type"][0] === "DIALOG"
    ) {
      if (swidth >= info.w) {
        swidth = info.w;
      }
      if (sheight >= info.h) {
        sheight = info.h;
      }
    }

    // Honor any size constraints
    const size_constraints = info.metadata["size-constraints"];
    if (size_constraints != null) {
      const mn = size_constraints["minimum-size"],
        mx = size_constraints["maximum-size"];
      if (mn != null) {
        if (swidth < mn[0]) {
          swidth = mn[0];
        }
        if (sheight < mn[1]) {
          sheight = mn[1];
        }
      }
      if (mx != null) {
        if (swidth > mx[0]) {
          swidth = mx[0];
        }
        if (sheight > mx[1]) {
          sheight = mx[1];
        }
      }
    }

    // Never resize beyond the backend compositor size, since bad
    // things happen when window is slightly off screen. Very frustrating
    // for users.
    if (sheight > MAX_HEIGHT) {
      sheight = MAX_HEIGHT;
    }
    if (swidth > MAX_WIDTH) {
      swidth = MAX_WIDTH;
    }
    if (sheight < MIN_HEIGHT) {
      sheight = MIN_HEIGHT;
    }
    if (swidth < MIN_WIDTH) {
      swidth = MIN_WIDTH;
    }

    //console.log("resize_window ", wid, width, height, swidth, sheight);
    surface.updateGeometry(
      swidth,
      sheight,
      swidth0 === swidth,
      sheight0 === sheight
    );

    if (swidth === info.w && sheight === info.h) {
      // make no change... BUT still important to
      // update the CSS above.
      return;
    }

    // w and h are critically used for scaling/mouse position computation,
    // so MUST be updated.
    info.w = swidth;
    info.h = sheight;

    this.client.send(
      "configure-window",
      wid,
      0,
      0,
      swidth,
      sheight,
      info.properties
    );
  }

  window_destroy(window): void {
    //console.log("window_destroy", window);
    window.destroy();
    window.canvas.remove();
    delete this.windows[window.wid];
    this.emit("window:destroy", window.wid);
  }

  window_icon(icon): void {
    //console.log("window_icon", icon);
    this.emit("window:icon", icon.wid, icon.src);
  }

  window_metadata(_): void {
    //console.log("window_metadata", info);
  }

  place_overlay_in_dom(overlay): void {
    const e = $(overlay.canvas);
    e.css("position", "absolute");
    const scale = window.devicePixelRatio;
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

  overlay_create(overlay): void {
    this.windows[overlay.wid] = overlay;
    this.place_overlay_in_dom(overlay);
  }

  overlay_destroy(overlay): void {
    delete this.windows[overlay.wid];
    $(overlay.canvas).remove();
  }

  ws_status(status): void {
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

  ws_data(_, packet): void {
    console.log("ws_data", packet);
  }

  is_root_window(wid: number): boolean {
    const w = this.windows[wid];
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
}
