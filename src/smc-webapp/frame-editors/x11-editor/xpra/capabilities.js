/**
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */
import forge from "node-forge";
import { CHARCODE_TO_NAME } from "./constants.js";
import {
  browserLanguage,
  supportsWebp,
  calculateDPI,
  calculateColorGamut,
  calculateScreens
} from "./util.js";

const platformMap = {
  Win: {
    type: "win32",
    name: "Microsoft Windows"
  },
  Mac: {
    type: "darwin",
    name: "Mac OSX"
  },
  Linux: {
    type: "linux",
    name: "Linux"
  },
  X11: {
    type: "posix",
    name: "Posix"
  }
};

const getPlatform = () => {
  const { appVersion, oscpu, cpuClass } = navigator;
  const found = Object.keys(platformMap).find(k => appVersion.includes(k));

  return Object.assign(
    {
      type: "unknown",
      name: "unknown",
      processor: oscpu || cpuClass || "unknown",
      platform: appVersion
    },
    found ? platformMap[found] : {}
  );
};

const getBrowser = () => {
  return {
    name: "Chrome", // TODO
    agent: navigator.userAgent
  };
};

const getEncodingCapabilities = (config, soundCodecs) => {
  const digest = [
    "hmac",
    "hmac+md5",
    "xor",
    ...Object.keys(forge.md.algorithms).map(hash => `hmac+${hash}`)
  ];

  const detectedEncodings = ["jpeg", "png", "rgb", "rgb32"]; // "h264", "vp8+webm", "h264+mp4", "mpeg4+mp4"
  if (supportsWebp()) {
    detectedEncodings.push("webp");
  }

  const imageEncodings =
    config.image_codecs.length > 0 ? config.image_codecs : detectedEncodings;

  const audioEncodings =
    config.audio_codecs.length > 0 ? config.audio_codecs : soundCodecs;

  return {
    digest: digest,
    "salt-digest": digest,
    "generic-rgb-encodings": true,
    "sound.decoders": audioEncodings,
    encodings: imageEncodings,
    "encoding.generic": true,
    "encoding.rgb24zlib": true,
    "encoding.rgb_zlib": true,
    "encoding.icons.max_size": [30, 30],
    "encodings.core": imageEncodings,
    "encodings.rgb_formats": ["RGBX", "RGBA"],
    "encodings.window-icon": ["png"],
    "encodings.cursor": ["png"],
    "encoding.flush": true,
    "encoding.transparency": true,
    "encoding.client_options": true,
    "encoding.csc_atoms": true,
    "encoding.scrolling": true,
    "encoding.color-gamut": calculateColorGamut(),
    "encoding.video_scaling": true,
    "encoding.video_max_size": [1024, 768],
    "encoding.eos": true,
    "encoding.full_csc_modes": {
      mpeg1: ["YUV420P"],
      h264: ["YUV420P"],
      "mpeg4+mp4": ["YUV420P"],
      "h264+mp4": ["YUV420P"],
      "vp8+webm": ["YUV420P"],
      webp: ["BGRX", "BGRA"]
    },
    "encoding.h264.YUV420P.profile": "baseline",
    "encoding.h264.YUV420P.level": "2.1",
    "encoding.h264.cabac": false,
    "encoding.h264.deblocking-filter": false,
    "encoding.h264.fast-decode": true,
    "encoding.h264+mp4.YUV420P.profile": "main",
    "encoding.h264+mp4.YUV420P.level": "3.0",

    // prefer native video in mp4/webm container to broadway plain h264:
    "encoding.h264.score-delta": -20,
    "encoding.h264+mp4.score-delta": 50,
    "encoding.mpeg4+mp4.score-delta": 50,
    "encoding.vp8+webm.score-delta": 50

    // 'encoding.scrolling.min-percent' : 30,
    // 'encoding.min-speed': 80,
    // 'encoding.min-quality': 50,
    // 'encoding.non-scroll': ['rgb32', 'png', 'jpeg'],
  };
};

const getClientCapabilities = config => {
  const language = browserLanguage();

  const keycodes = Object.keys(CHARCODE_TO_NAME).reduce(
    (result, c) => [
      ...result,
      [parseInt(c, 10), CHARCODE_TO_NAME[c], parseInt(c, 10), 0, 0]
    ],
    []
  );

  return {
    share: config.share,
    steal: config.steal,
    windows: true,
    "file-transfer": config.transfer,
    printing: config.printing,
    "file-size-limit": 10,
    auto_refresh_delay: 500,
    randr_notify: true,
    raw_window_icons: true,
    cursors: true,
    bell: config.bell,
    system_tray: true,
    "server-window-resize": true,
    named_cursors: false, // NOTE: we cannot handle this (GTK only)
    "notify-startup-complete": true,

    // Windows
    "window.raise": true,
    "window.initiate-moveresize": true,

    "metadata.supported": [
      "fullscreen",
      "maximized",
      "above",
      "below",
      // 'set-initial-position', 'group-leader',
      "title",
      "size-hints",
      "class-instance",
      "transient-for",
      "window-type",
      "has-alpha",
      "decorations",
      "override-redirect",
      "tray",
      "modal",
      "opacity"
      // 'shadow', 'desktop',
    ],

    // Sound
    "sound.receive": config.sound,
    "sound.send": false,
    "sound.server_driven": true,
    "sound.bundle-metadata": true,

    // encoding stuff
    keyboard: config.keyboard,
    xkbmap_layout: config.language || language,
    xkbmap_keycodes: keycodes,
    xkbmap_print: "",
    xkbmap_query: "",

    // Screen
    desktop_size: config.screen,
    desktop_mode_size: config.screen,
    screen_sizes: calculateScreens(
      config.screen[0],
      config.screen[1],
      config.dpi
    ),
    dpi: config.dpi,

    // Clipboard (not handled yet, but we will)
    clipboard_enabled: config.clipboard,
    "clipboard.want_targets": true,
    "clipboard.greedy": true,
    "clipboard.selections": ["CLIPBOARD", "PRIMARY"],

    // Notifications
    notifications: config.notifications,
    "notifications.close": true,
    "notifications.actions": true
  };
};

export const getCapabilities = (config, soundCodecs) => {
  const platform = getPlatform();
  const browser = getBrowser();
  const client = getClientCapabilities(config);
  const encoding = getEncodingCapabilities(config, soundCodecs);

  const extras = {
    /*
     challenge: false,
    'bandwidth-limit': 0
      "connection-data"	: ci,
      "start-new-session" : this.start_new_session});
      "cipher"					: this.encryption,
      "cipher.iv"					: Utilities.getHexUUID().slice(0, 16),
      "cipher.key_salt"			: Utilities.getHexUUID()+Utilities.getHexUUID(),
      "cipher.key_stretch_iterations"	: 1000,
      "cipher.padding.options"	: ["PKCS#7"],
     */
  };

  return Object.assign(
    {
      version: "2.4",
      platform: platform.type,
      "platform.name": platform.name,
      "patform.processor": platform.processor,
      "platform.platform": platform.platform,
      "session-type": browser.name,
      "session-type.full": browser.agent,
      namespace: true,
      client_type: "HTML5",
      username: config.username,
      uuid: config.uuid,
      argv: [window.location.href],

      // Compression bits
      zlib: config.zlib,
      lzi: false,
      lz4: false,
      "encoding.rgb_lz4": false,
      //lz4: config.lz4,
      //"lz4.js.version": "0.2.0", // FIXME
      //"encoding.rgb_lz4": true,
      compression_level: config.compression_level,

      // Packet encoders
      rencode: false,
      bencode: true,
      yaml: false,
      "open-url": true
    },
    client,
    encoding,
    extras
  );
};
