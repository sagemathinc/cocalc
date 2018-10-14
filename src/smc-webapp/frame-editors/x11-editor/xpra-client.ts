import { createClient } from "cocalc-xpra";

const DPI: number = 96;

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
  port: number;
}

export class XpraClient {
  private options: Options;
  private xpra_options: any;
  private client: any;
  private windows: any = {};
  private scale: number;

  constructor(options: Options) {
    this.scale = window.devicePixelRatio;
    this.options = options;
    this.init_client();
    this.init_xpra_events();
    this.connect();
  }

  close(): void {
    if (this.client === undefined) {
      return;
    }
    this.blur();
    this.client.disconnect();
    delete this.windows;
    delete this.options;
    delete this.xpra_options;
    delete this.client;
  }

  connect(): void {
    this.client.connect(this.xpra_options);
  }

  private init_client(): void {
    // TODO
    const uri = `wss://cocalc.com${window.app_base_url}/${
      this.options.project_id
    }/server/${this.options.port}/`;
    const dpi = Math.round(DPI * this.scale);
    this.xpra_options = { uri, dpi, sound: false };
    this.client = createClient(this.xpra_options);
  }

  private init_xpra_events(): void {
    this.client.on("window:create", this.window_create.bind(this));
    this.client.on("window:destroy", this.window_destroy.bind(this));
    this.client.on("window:icon", this.window_icon.bind(this));
    this.client.on("window:metadata", this.window_metadata.bind(this));
    this.client.on("overlay:create", this.overlay_create.bind(this));
    this.client.on("overlay:destroy", this.overlay_destroy.bind(this));
    this.client.on("ws:status", this.ws_status.bind(this));
    //this.client.on("ws:data", this.ws_data.bind(this));
  }

  focus(): void {
    this.enable_window_events();
  }

  blur(): void {
    this.disable_window_events();
  }

  private enable_window_events(): void {
    const doc = $(document);
    for (let name of KEY_EVENTS) {
      doc.on(name, this.client.key_inject);
    }
    for (let name of MOUSE_EVENTS) {
      doc.on(name, this.client.mouse_inject);
    }
  }

  private disable_window_events(): void {
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
      return;
    }
    const canvas = $(info.canvas);
    canvas.width("100%").height("100%");
    const e: JQuery<HTMLElement> = $(elt);
    e.empty();
    e.append(canvas);
  }

  window_create(info): void {
    console.log("window_create", info);
    this.windows[info.wid] = info;
  }

  resize_window(wid: number): void {
    const info = this.windows[wid];
    if (info === undefined) {
      console.warn("no window", wid);
      return; // no such window
    }
    const canvas = $(info.canvas);
    const scale = this.scale;
    const width = canvas.width(),
      height = canvas.height();
    if (!width || !height) {
      return;
    }
    this.client.send(
      "configure-window",
      wid,
      0,
      0,
      Math.round(width * scale),
      Math.round(height * scale)
    );
  }

  window_destroy(info): void {
    console.log("window_destroy", info);
    delete this.windows[info.wid];
  }

  window_icon(info): void {
    console.log("window_icon", info);
    if (this.windows[info.wid] !== undefined) {
      this.windows[info.wid].icon = info.src;
    }
  }
  window_metadata(info): void {
    console.log("window_metadata", info);
  }
  overlay_create(info): void {
    console.log("overlay_create", info);
  }
  overlay_destroy(info): void {
    console.log("overlay_destroy", info);
  }
  ws_status(info): void {
    console.log("ws_status", info);
  }
  ws_data(_, packet): void {
    console.log("ws_data", packet);
  }
}
