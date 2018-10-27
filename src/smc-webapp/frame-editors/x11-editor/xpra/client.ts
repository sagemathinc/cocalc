/**
 * CoCalc Xpra Client
 */

import { Surface, MAX_WIDTH, MAX_HEIGHT } from "./surface";
import { getCapabilities } from "./capabilities";
import { Keyboard } from "./keyboard";
import { Mouse } from "./mouse";
import { Connection } from "./connection";
import { PING_FREQUENCY } from "./constants";
import { arraybufferBase64, hexUUID, calculateDPI, timestamp } from "./util";

import { EventEmitter } from "events";

function createConfiguration(defaults = {}, append = {}) {
  return Object.assign(
    {
      uuid: hexUUID(),
      uri: "ws://localhost:10000",
      audio_framework: null,
      audio_codec_blacklist: [],
      audio_codecs: [],
      image_codecs: [],
      screen: [MAX_WIDTH, MAX_HEIGHT],
      dpi: calculateDPI(),
      compression_level: 1, // TODO: experiment with this.
      reconnect: true,
      notifications: true,
      clipboard: false,
      sound: false,
      bell: false,
      printing: false, // TODO: implement?
      transfer: false, // TODO: implement?
      keyboard: true,
      share: true,
      steal: true, // what does this mean?
      language: null, // auto
      username: "",
      password: "",
      zlib: true,
      lz4: false // TODO: need to implement this!
    },
    defaults,
    append
  );
}

export class Client {
  private bus: EventEmitter = new EventEmitter();
  private connection: Connection;
  private keyboard: Keyboard;
  private mouse: Mouse;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnecting: boolean = false;
  private surfaces: { [wid: string]: Surface } = {};
  private surfaces_before_disconnect?: { [wid: string]: Surface };
  private config: any;
  private clientCapabilities: any;
  private serverCapabilities: any;
  private activeWindow: number = 0;
  private lastActiveWindow: number = 0;
  private audioCodecs = { codecs: [] };
  private ping_interval: number = 0;

  public send: Function;
  public console: {
    error: Function;
    warn: Function;
    log: Function;
    info: Function;
    debug: Function;
  };

  constructor() {
    this.render = this.render.bind(this);
    this.findSurface = this.findSurface.bind(this);
    this.key_inject = this.key_inject.bind(this);
    this.mouse_inject = this.mouse_inject.bind(this);

    this.connection = new Connection(this.bus);
    this.send = this.connection.send;
    this.keyboard = new Keyboard(this.send);
    this.init_bus();
    this.init_ping_interval();
    this.mouse = new Mouse(this.send, this.keyboard, this.findSurface);
    this.console = {
      error: this.log("error", 40),
      warn: this.log("warn", 30),
      log: this.log("log", 20),
      info: this.log("info", 20),
      debug: this.log("debug", 10)
    };
  }

  window_ids(): number[] {
    const v: number[] = [];
    for (let wid in this.surfaces) {
      v.push(parseInt(wid));
    }
    return v;
  }

  destroy(): void {
    if (this.ping_interval) {
      clearInterval(this.ping_interval);
      delete this.ping_interval;
    }
    this.bus.removeAllListeners();
    delete this.surfaces;
    delete this.surfaces_before_disconnect;
  }

  // ping server if we are connected.
  ping(): void {
    if (this.connected) {
      this.send("ping", timestamp());
    }
  }

  getState(): string {
    if (this.reconnecting) {
      return "reconnecting";
    } else if (this.connecting) {
      return "connecting";
    } else if (this.connected) {
      return "connected";
    } else {
      return "disconnected";
    }
  }

  private emitState(): void {
    this.bus.emit("ws:status", this.getState());
  }

  public findSurface(wid: number): Surface | undefined {
    return this.surfaces[wid];
  }

  public focus(wid: number): void {
    const found = this.findSurface(wid);
    if (found !== undefined) {
      if (this.activeWindow !== wid) {
        this.send("focus", wid);
      }
      this.activeWindow = wid;
      this.bus.emit("window:focus", wid);
    } else {
      this.activeWindow = 0;
    }
  }

  // Closes connection
  public disconnect(closing: boolean = false): void {
    this.connected = false;
    this.connecting = false;

    if (!closing) {
      this.connection.close();
    }

    this.emitState();

    this.surfaces = {};
    this.connection.flush();
  }

  // Opens connection
  public connect(cfg = {}): void {
    this.config = createConfiguration({}, cfg);
    this.disconnect();
    this.connecting = true;
    this.emitState();
    this.connection.open(this.config);
  }

  // Injects a keyboard browser event
  public key_inject(ev: KeyboardEvent, wid: number | undefined): boolean {
    if (!this.connected) {
      return false;
    }

    if (wid === undefined) {
      wid = this.activeWindow;
    }

    const surface = this.findSurface(wid);
    if (!surface) {
      return false;
    }

    this.keyboard.process(ev, surface);
    this.bus.emit("key", ev, surface);
    return false;
  }

  // Injects a mouse browser event
  public mouse_inject(ev: MouseEvent): boolean | undefined {
    if (!this.connected) {
      return;
    }
    const surface = this.mouse.process(ev);
    if (surface !== undefined) {
      this.bus.emit("mouse", ev, surface);
      return false; // no further mouse propagation if actually over a window.
    }
  }

  // Kills a window/surface
  public kill(wid: number): void {
    if (this.findSurface(wid)) {
      this.send("close-window", wid);
    }
  }

  // Sends a draw event to surface
  public render(
    wid,
    x,
    y,
    w,
    h,
    coding,
    data,
    sequence,
    rowstride,
    options = {}
  ): void {
    const found = this.findSurface(wid);
    if (found) {
      found.draw(x, y, w, h, coding, data, sequence, rowstride, options);
    }
  }

  log(name: string, level: number): Function {
    return (...args) => {
      if (
        this.connected &&
        this.serverCapabilities &&
        this.serverCapabilities["remote-logging.multi-line"]
      ) {
        this.send(
          "logging",
          level,
          args.map(str => {
            return unescape(encodeURIComponent(String(str)));
          })
        );
      } else {
        const f = console[name];
        if (f !== undefined) {
          f(...args);
        }
      }
    };
  }

  /*public resize(w: number, h: number): void {
    const sizes = calculateScreens(w, h, this.config.dpi);
    this.send("desktop_size", w, h, sizes);
  }*/

  public rescale_children(parent: Surface, scale: number): void {
    for (let wid in this.surfaces) {
      const surface = this.surfaces[wid];
      if (surface.parent !== undefined && surface.parent.wid === parent.wid) {
        surface.rescale(scale);
        this.rescale_children(surface, scale); // and also any children of this.
      }
    }
  }

  private process_server_capabilities(cap) : void {
    this.serverCapabilities = cap;
    if (cap['modifier_keycodes']) {
      this.keyboard.process_modifier_keycodes(cap['modifier_keycodes']);
    }
  }

  // WebSocket actions
  private init_bus(): void {
    const bus = this.bus;
    bus.on("ws:open", () => {
      this.clientCapabilities = getCapabilities(
        this.config,
        this.audioCodecs.codecs
      );

      this.send("hello", this.clientCapabilities);
    });

    bus.on("ws:close", () => this.disconnect(true));

    // Xpra actions
    bus.on("disconnect", () => {
      this.surfaces_before_disconnect = this.surfaces;
      this.disconnect(true);
    });

    bus.on("hello", this.process_server_capabilities.bind(this));

    bus.on("ping", (time: number) => this.send("ping_echo", time, 0, 0, 0, 0));

    bus.on("window-metadata", (wid: number, metadata = {}) => {
      const surface = this.findSurface(wid);
      if (surface === undefined) {
        return;
      }
      surface.updateMetadata(metadata);
      bus.emit("window:metadata", surface);
    });

    bus.on("window-resized", (wid: number, w: number, h: number) => {
      const surface = this.findSurface(wid);
      if (surface === undefined) {
        return;
      }
      // Blank the part of the canvas no longer used, since otherwise it
      // looks all corrupted when somebody else shrinks the size.
      const scale = surface.scale ? surface.scale : 1;
      const canvases = [surface.renderer.canvas, surface.renderer.drawCanvas];
      const rects = [
        [w / scale, 0, canvases[0].width, canvases[0].height],
        [0, h / scale, canvases[0].width, canvases[0].height]
      ];
      for (let rect of rects) {
        for (let canvas of canvases) {
          const context = canvas.getContext("2d");
          if (context != null) {
            context.clearRect(rect[0], rect[1], rect[2], rect[3]);
          }
        }
      }

      // Save new size (so we know to resize when it changes from this).
      surface.w = w;
      surface.h = h;

      // Do NOT change geometry, or it looks squished and overlays are wrong.
      //surface.updateGeometry(w, h);

      bus.emit("window:resized", surface);
    });

    bus.on(
      "new-window",
      (
        wid: number,
        x: number,
        y: number,
        w: number,
        h: number,
        metadata,
        properties
      ) => {
        this.lastActiveWindow = 0;

        const props = Object.assign({}, properties || {}, {
          "encodings.rgb_formats": this.clientCapabilities[
            "encodings.rgb_formats"
          ]
        });

        this.send("map-window", wid, x, y, w, h, props);
        this.send("focus", wid);

        const surface = new Surface({
          parent: undefined,
          wid,
          x,
          y,
          w,
          h,
          metadata,
          properties,
          send: this.send
        });
        this.surfaces[wid] = surface;

        bus.emit("window:create", surface);
        this.focus(wid);
      }
    );

    bus.on(
      "new-override-redirect",
      (
        wid: number,
        x: number,
        y: number,
        w: number,
        h: number,
        metadata,
        properties
      ) => {
        let parentWid: number | undefined = metadata["transient-for"];
        if (parentWid === undefined) {
          // Sometimes transient-for isn't set, e.g., tooltips in emacs-x11.
          // In such cases, we use the heuristic that
          // this menu is probably for the active window
          // seems sufficient.
          // We take the activeWindow, then traverse the tree
          // up to the root application window below.
          parentWid = this.activeWindow;
        }

        let parent: Surface | undefined = parentWid
          ? this.findSurface(parentWid)
          : undefined;
        if (parent === undefined) {
          // Hmm -- nothing?  Maybe window was closed
          // right as the overlay was being created.
          // So let's not show the overlay (it's just
          // going to be removed).
          return;
        }

        // Go up to the root; I don't know if this is actually
        // necessary in practice....
        while (parent.parent !== undefined) {
          parent = parent.parent;
          parentWid = parent.wid;
        }

        const surface = new Surface({
          parent,
          wid,
          x,
          y,
          w,
          h,
          metadata,
          properties,
          send: this.send
        });

        bus.emit("overlay:create", surface);

        this.surfaces[wid] = surface;
        this.lastActiveWindow = parentWid;
      }
    );

    bus.on("lost-window", (wid: number) => {
      const surface = this.findSurface(wid);

      if (surface) {
        // get rid of it...
        if (surface.overlay) {
          bus.emit("overlay:destroy", surface);
        } else {
          if (this.activeWindow === wid) {
            bus.emit("window:blur", { wid });
          }
          bus.emit("window:destroy", surface);
        }

        surface.destroy();
        delete this.surfaces[wid];
      }

      if (this.surfaces[this.activeWindow] === undefined) {
        // TODO: need a stack instead...? Or maybe our
        // client does a good enough job with its own stack...
        if (this.surfaces[this.lastActiveWindow] !== undefined) {
          this.activeWindow = this.lastActiveWindow;
        } else {
          this.activeWindow = 0;
          for (let id in this.surfaces) {
            this.focus(parseInt(id));
            return;
          }
        }
      }
    });

    bus.on(
      "window-icon",
      (wid: number, w: number, h: number, coding: string, data) => {
        let src;
        if (coding === "png") {
          src = `data:image/${coding};base64,` + arraybufferBase64(data);
        }

        if (src) {
          bus.emit("window:icon", { wid, src, w, h });
        } else {
          console.log("x11: only png icons currently supported");
          // TODO!
        }
      }
    );

    bus.on(
      "window-move-resize",
      (wid: number, x: number, y: number, w: number, h: number) => {
        // TODO: seems super important, since isn't this what happens
        // when a different user views it.  Obviously the move doesn't matter, but
        // the resize does.
        this.console.log("x11: TODO -- window-move-resize", wid, x, y, w, h);
      }
    );

    bus.on("startup-complete", () => {
      bus.emit("system:started");

      this.connected = true;
      this.connecting = false;

      this.console.info("Xpra Client connected");
      this.emitState();

      if (this.surfaces_before_disconnect !== undefined) {
        // We just reconnected after being disconnected.
        // have to tell local browser about any wid's that
        // are gone, but were there before.
        for (let wid in this.surfaces_before_disconnect) {
          if (this.surfaces[wid] === undefined) {
            this.bus.emit(
              "window:destroy",
              this.surfaces_before_disconnect[wid]
            );
          }
        }
        delete this.surfaces_before_disconnect;
      }
    });

    /*
    bus.on("sound-data", (codec, buffer, options, metadata) => {
      // this.console.log("x11: ignoring sound data");
    });
    */

    bus.on(
      "notify_show",
      (
        busId,
        notificationId,
        replacesId,
        summary,
        body,
        timeout,
        icon,
        actions,
        hints
      ) => {
        bus.emit("notification:create", notificationId, {
          busId,
          replacesId,
          summary,
          body,
          timeout,
          icon,
          actions,
          hints
        });
      }
    );

    bus.on("notify_show", notificationId => {
      bus.emit("notification:destroy", notificationId);
    });

    bus.on(
      "send-file",
      (
        filename: string,
        mime: string,
        print: boolean,
        size: number,
        data: string
      ) => {
        if (data.length !== size) {
          console.warn("Invalid file", filename, mime, size);
          return;
        }

        if (print) {
          bus.emit("system:print", { filename, mime, size }, data);
        } else {
          bus.emit("system:upload", { filename, mime, size }, data);
        }
      }
    );

    // TODO: figure out args, etc.
    bus.on("open-url", url => bus.emit("system:url", url));

    bus.on("bell", () => bus.emit("system:bell"));

    bus.on("eos", this.render);

    bus.on("draw", this.render);
  }

  init_ping_interval(): void {
    // Make sure to ping the server
    this.ping_interval = setInterval(this.ping.bind(this), PING_FREQUENCY);
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.bus.on(event, handler);
  }
}
