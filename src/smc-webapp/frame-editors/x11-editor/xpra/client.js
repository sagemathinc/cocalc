/**
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */

import { EventHandler } from "./eventhandler.js";
import { getCapabilities } from "./capabilities.js";
import { createRenderer } from "./renderer.js";
import { createKeyboard } from "./keyboard.js";
import { createMouse } from "./mouse.js";
//import {createSound, enumSoundCodecs} from './sound.js';
import { createConnection } from "./connection/null.js";
import { iconRenderer } from "./renderer/icon.js";
import { PING_FREQUENCY } from "./constants.js";
import {
  hexUUID,
  calculateDPI,
  calculateScreens,
  timestamp,
  generateSalt,
  generateDigest
} from "./util.js";

/**
 * Creates a configuration
 */
const createConfiguration = (defaults = {}, append = {}) =>
  Object.assign(
    {
      uuid: hexUUID(),
      uri: "ws://localhost:10000",
      /* audio_framework: null, */
      audio_codec_blacklist: [],
      audio_codecs: [],
      image_codecs: [],
      screen: [window.innerWidth, window.innerHeight],
      dpi: calculateDPI(),
      compression_level: 1,
      reconnect: true,
      notifications: true,
      clipboard: false,
      //sound: true,
      bell: true,
      printing: false, // FIXME
      transfer: false, // FIXME
      keyboard: true,
      share: true,
      steal: true,
      language: null, // auto
      username: "",
      password: "",
      zlib: true,
      lz4: true
    },
    defaults,
    append
  );

/**
 * Creates a render surface
 */
const createSurface = (parent, wid, x, y, w, h, metadata, properties, send) => {
  const overlay = !!parent;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const context = canvas.getContext("2d");
  const renderer = createRenderer({ wid, canvas, context }, send);
  const draw = (...args) => renderer.push(...args);
  const updateMetadata = meta => Object.assign(metadata, meta);
  const destroy = () => renderer.stop();
  const updateCSSGeometry = (w, h) => {
    // The main canvas itself has its size updated *only* when
    // the render itself happens, so there is no flicker.
    if (renderer.surface.drawCanvas.width != w) {
      renderer.surface.drawCanvas.width = w;
    }
    if (renderer.surface.drawCanvas.height != h) {
      renderer.surface.drawCanvas.height = h;
    }
  };

  return {
    wid,
    x,
    y,
    w,
    h,
    parent,
    overlay,
    canvas,
    context,
    metadata,
    properties,
    draw,
    updateMetadata,
    updateCSSGeometry,
    destroy
  };
};

const createConnectionGate = (bus, env) => {
  if (window.Worker) {
    const worker = new Worker(env.worker);

    worker.onmessage = ({ data }) => {
      if (data.event === "data") {
        bus.emit(...data.args);
      } else {
        bus.emit(data.event, ...data.args);
      }
    };

    return {
      send: (...packet) => worker.postMessage({ command: "send", packet }),
      close: () => worker.postMessage({ command: "close" }),
      open: config => worker.postMessage({ command: "open", config }),
      flush: () => worker.postMessage({ command: "flush" })
    };
  }

  return createConnection(bus);
};

/**
 * Creates a new Xpra client
 */
export const createClient = (defaultConfig = {}, env = {}) => {
  env = Object.assign(
    {
      worker: "worker.js"
    },
    env
  );

  const bus = new EventHandler("XpraClient");
  // TODO: for now skip using webworker, since need to be clear about where worker.js actually *is*....
  //const connection = createConnectionGate(bus, env);
  const connection = createConnection(bus);
  const { send } = connection;

  const ping = () => send("ping", timestamp());
  const keyboard = createKeyboard(send);
  const mouse = createMouse(send, keyboard);
  //const sound = createSound(send);

  let config;
  let connected = false;
  let connecting = false;
  let reconnecting = false;
  let clientCapabilities;
  let serverCapabilities;
  let surfaces = [];
  let activeWindow = 0;
  let lastActiveWindow = 0;
  let audioCodecs = { codecs: [] };

  const states = {
    reconnecting: () => reconnecting,
    connecting: () => connecting,
    connected: () => connected
  };

  const getState = () =>
    Object.keys(states).find(key => states[key]() === true) || "disconnected";

  const emitState = () => bus.emit("ws:status", getState());

  const findSurface = wid => surfaces.find(s => s.wid === wid);

  const focus = wid => {
    const found = findSurface(wid);
    if (found) {
      if (activeWindow !== wid) {
        send("focus", wid, []);
      }

      activeWindow = wid;

      bus.emit("window:focus", { wid });
    } else {
      activeWindow = 0;
    }
  };

  // Closes connection
  const disconnect = closing => {
    connected = false;
    connecting = false;

    if (!closing) {
      connection.close();
    }

    emitState();

    surfaces = [];
    //sound.destroy();
    connection.flush();
  };

  // Opens connection
  const connect = (cfg = {}) => {
    config = createConfiguration(defaultConfig, cfg);

    if (connection) {
      disconnect();
    }

    connecting = true;

    emitState();

    connection.open(config);
  };

  // Injects a key browser event
  const key_inject = (ev, wid) => {
    if (!connected) {
      return false;
    }

    if (typeof wid === "undefined") {
      wid = activeWindow;
    }

    const surface = findSurface(wid);
    keyboard.process(ev, surface);
    return false;
  };

  // Injects a mouse browser event
  const mouse_inject = (ev, wid) => {
    if (!connected) {
      return;
    }

    if (typeof wid === "undefined") {
      wid = activeWindow;
    }

    const surface = findSurface(wid);
    return mouse.process(ev, surface);
  };

  // Kills a window/surface
  const kill = wid => {
    if (findSurface(wid)) {
      send("close-window", wid);
    }
  };

  // Sends a draw event to surface
  const render = (
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
  ) => {
    const found = findSurface(wid);
    if (found) {
      found.draw(x, y, w, h, coding, data, sequence, rowstride, options);
    }
  };

  const log = (name, level) => (...args) => {
    if (
      connected &&
      serverCapabilities &&
      serverCapabilities["remote-logging.multi-line"]
    ) {
      send(
        "logging",
        level,
        args.map(str => {
          return unescape(encodeURIComponent(String(str)));
        })
      );
    } else {
      console[name](...args);
    }
  };

  const resize = (() => {
    let debounce;
    return (w, h) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const sizes = calculateScreens(w, h, config.dpi);
        send("desktop_size", w, h, sizes);
      }, 100);
    };
  })();

  const serverConsole = {
    error: log("error", 40),
    warn: log("warn", 30),
    log: log("log", 20),
    info: log("info", 20),
    debug: log("debug", 10)
  };

  // WebSocket actions

  bus.on("ws:open", () => {
    //audioCodecs = enumSoundCodecs(config);
    clientCapabilities = getCapabilities(config, audioCodecs.codecs);

    console.debug("!!!", { config, audioCodecs, clientCapabilities });

    const capabilities = Object.assign({}, clientCapabilities);
    if (config.username || config.password) {
      capabilities.challenge = true;
    }

    send("hello", capabilities);
  });

  bus.on("ws:close", () => disconnect(true));

  // Xpra actions
  bus.on("disconnect", () => disconnect(true)); // TODO: Reconnect

  bus.on("hello", cap => (serverCapabilities = cap));

  bus.on("ping", time => send("ping_echo", time, 0, 0, 0, 0));

  bus.on("challenge", (serverSalt, foo, digest, saltDigest) => {
    // TODO: Proto
    // FIXME: Don't use xor on non-ssl
    saltDigest = saltDigest || "xor";

    console.debug("--- challenge", { serverSalt, digest, saltDigest });

    try {
      const clientSalt = generateSalt(saltDigest, serverSalt);
      const salt = generateDigest(saltDigest, clientSalt, serverSalt);
      if (!salt) {
        throw new Error("Invalid challenge salt digest: " + saltDigest);
      }

      const response = generateDigest(digest, config.password, salt);
      if (response) {
        const append = {
          challenge_response: response,
          challenge_client_salt: clientSalt
        };

        const capabilities = Object.assign({}, clientCapabilities, append);

        send("hello", capabilities);
      } else {
        throw new Error("Invalid challenge digest: " + digest);
      }
    } catch (e) {
      console.error(e);
      disconnect();
    }
  });

  bus.on("window-metadata", (wid, metadata = {}) => {
    const surface = findSurface(wid);
    if (surface) {
      surface.updateMetadata(metadata);
      bus.emit("window:metadata", surface);
    }
  });

  bus.on("new-window", (wid, x, y, w, h, metadata, properties) => {
    lastActiveWindow = 0;

    const props = Object.assign({}, properties || {}, {
      "encodings.rgb_formats": clientCapabilities["encodings.rgb_formats"]
    });

    send("map-window", wid, x, y, w, h, props);
    send("focus", [], wid);

    const surface = createSurface(
      false,
      wid,
      x,
      y,
      w,
      h,
      metadata,
      properties,
      send
    );
    surfaces.push(surface);

    bus.emit("window:create", surface);
    focus(wid);
  });

  bus.on("new-override-redirect", (wid, x, y, w, h, metadata, properties) => {
    const parentWid = metadata["transient-for"];

    const parent = parentWid ? findSurface(parentWid) : false;
    if (parent) {
      const surface = createSurface(
        parent,
        wid,
        x,
        y,
        w,
        h,
        metadata,
        properties,
        send
      );

      bus.emit("overlay:create", { parent, wid, x, y, canvas: surface.canvas });

      surfaces.push(surface);
      lastActiveWindow = parentWid;

      focus(wid);
    }
  });

  bus.on("lost-window", wid => {
    const surface = findSurface(wid);

    if (surface) {
      if (surface.overlay) {
        bus.emit("overlay:destroy", surface);
      } else {
        if (activeWindow === wid) {
          bus.emit("window:blur", { wid });
        }
        bus.emit("window:destroy", surface);
      }

      surface.destroy();

      const index = surfaces.findIndex(s => s.wid === wid);
      surfaces.splice(index, 1);
    }

    if (activeWindow === wid) {
      activeWindow = lastActiveWindow;
    }
  });

  bus.on("window-icon", (wid, w, h, coding, data) => {
    const src = iconRenderer({ coding, data });
    if (src) {
      bus.emit("window:icon", { wid, src });
    }
  });

  bus.on("window-move-resize", (wid, x, y, w, h) => {
    console.log("window-move-resize", wid, x, y, w, h);
  });

  bus.on("startup-complete", () => {
    bus.emit("system:started");

    connected = true;
    connecting = false;

    serverConsole.info("Xpra HTML5 Client connected");
    emitState();

    /* if (config.sound) {
      sound.start(config.audio_framework, audioCodecs, clientCapabilities, serverCapabilities);
    }*/
  });

  bus.on("sound-data", (codec, buffer, options, metadata) => {
    //sound.process(codec, buffer, options, metadata);
  });

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

  bus.on("send-file", (filename, mime, print, size, data) => {
    if (data.length !== size) {
      console.warn("Invalid file", filename, mime, size);
      return;
    }

    if (print) {
      bus.emit("system:print", { filename, mime, size }, data);
    } else {
      bus.emit("system:upload", { filename, mime, size }, data);
    }
  });

  bus.on("open-url", () => bus.emit("system:url"));
  bus.on("bell", () => bus.emit("system:bell"));

  bus.on("eos", render);
  bus.on("draw", render);

  // Make sure to ping the server
  setInterval(() => {
    if (connected) {
      ping();
    }
  }, PING_FREQUENCY);

  // Exported API
  return Object.freeze({
    console: serverConsole,
    connect,
    disconnect,
    ping,
    send,
    findSurface,
    key_inject,
    mouse_inject,
    status: () => getState(),
    on: (...args) => bus.on(...args),
    off: (name, callback) => {
      if (callback) {
        bus.off(name, callback);
      }
    },
    screen: {
      resize
    },
    surface: {
      focus,
      kill
    }
  });
};
