import { createClient } from "cocalc-xpra";

const DPI: number = 96;

interface Options {
  project_id: string;
  port: number;
}

export class Client {
  private options: Options;
  private xpra_options: any;
  private client: any;
  private windows: any = {};
  private scale: number;

  constructor(options: Options) {
    this.scale = window.devicePixelRatio;
    this.options = options;
    this.init_client();
    this.init_window_events();
    this.init_xpra_events();
    this.connect();
  }

  connect(): void {
    this.client.connect(this.xpra_options);
  }

  private init_client(): void {
    // TODO
    const uri = `wss://cocalc.com/${this.options.project_id}/server/${
      this.options.port
    }/`;
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

  private init_window_events(): void {
    const names = [
      "keydown",
      "keyup",
      "keypress",
      "mousemove",
      "mousedown",
      "mouseup",
      "wheel",
      "mousewheel",
      "DOMMouseScroll"
    ];

    for (let name of names) {
      window.addEventListener(name, this.client.inject);
    }

    window.addEventListener("resize", () =>
      this.client.screen.resize(window.innerWidth, window.innerHeight)
    );
  }

  window_create(info): void {
    console.log("window_create", info);
    this.windows[info.wid] = info;
    $("#x11").empty();
    const canvas = $(info.canvas);
    canvas.width("100%").height("100%");
    $("#x11").append(canvas);
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

(window as any).xpra = Client;
