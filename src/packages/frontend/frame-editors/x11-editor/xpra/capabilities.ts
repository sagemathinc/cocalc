/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * CoCalc's Xpra HTML Client
 *
 * ---
 *
 * Xpra
 * Copyright (c) 2013-2017 Antoine Martin <antoine@devloop.org.uk>
 * Copyright (c) 2016 David Brushinski <dbrushinski@spikes.com>
 * Copyright (c) 2014 Joshua Higgins <josh@kxes.net>
 * Copyright (c) 2015-2016 Spikes, Inc.
 * Copyright (c) 2018-2019 SageMath, Inc.
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 */
/**
 * CoCalc Xpra HTML Client
 */

import { md } from "node-forge";
import { CHARCODE_TO_NAME } from "./constants";
import { supportsWebp, calculateColorGamut, calculateScreens } from "./util";

const platformMap = {
  Win: {
    type: "win32",
    name: "Microsoft Windows",
  },
  Mac: {
    type: "darwin",
    name: "Mac OSX",
  },
  Linux: {
    type: "linux",
    name: "Linux",
  },
  X11: {
    type: "posix",
    name: "Posix",
  },
};

function getPlatform(): {
  type: string;
  name: string;
  processor: string;
  platform: string;
} {
  const { appVersion, oscpu, cpuClass } = navigator as any;
  const found = Object.keys(platformMap).find((k) => appVersion.includes(k));

  return Object.assign(
    {
      type: "unknown",
      name: "unknown",
      processor: oscpu || cpuClass || "unknown", // unlikely to work with modern browsers
      platform: appVersion,
    },
    found ? platformMap[found] : {},
  );
}

function getBrowser(): { name: string; agent: string } {
  return {
    name: "Chrome", // TODO
    agent: navigator.userAgent,
  };
}

function getEncodingCapabilities(config, soundCodecs) {
  const digest = [
    "hmac",
    "hmac+md5",
    "xor",
    ...Object.keys(md.algorithms).map((hash) => `hmac+${hash}`),
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
    digest,
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
      webp: ["BGRX", "BGRA"],
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
    "encoding.vp8+webm.score-delta": 50,

    // 'encoding.scrolling.min-percent' : 30,
    // 'encoding.min-speed': 80,
    // 'encoding.min-quality': 50,
    // 'encoding.non-scroll': ['rgb32', 'png', 'jpeg'],
  };
}

function getClientCapabilities(config) {
  const keycodes = Object.keys(CHARCODE_TO_NAME).reduce(
    (result, c) => [
      ...result,
      [parseInt(c, 10), CHARCODE_TO_NAME[c], parseInt(c, 10), 0, 0],
    ],
    [],
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
      //"fullscreen",
      //"maximized",
      "above",
      "below",
      // 'set-initial-position', 'group-leader',
      "title",
      "size-hints",
      "class-instance",
      "transient-for",
      "window-type",
      //"has-alpha",
      "decorations",
      "override-redirect",
      //"tray",
      "modal",
      //"opacity"
      // 'shadow', 'desktop',
    ],

    // Sound
    "sound.receive": false, // TODO: not implemented at all right now.
    "sound.send": false,
    "sound.server_driven": true,
    "sound.bundle-metadata": true,

    // encoding stuff
    keyboard: config.keyboard,
    xkbmap_layout: config.xkbmap_layout || "us", // default, but will get changed quickly on mount.
    xkbmap_keycodes: keycodes,
    xkbmap_print: "",
    xkbmap_query: "",

    // Screen
    desktop_size: config.screen,
    desktop_mode_size: config.screen,
    screen_sizes: calculateScreens(
      config.screen[0],
      config.screen[1],
      config.dpi,
    ),
    dpi: config.dpi,

    // Clipboard
    clipboard_enabled: config.clipboard,
    "clipboard.want_targets": true,
    "clipboard.greedy": true,
    "clipboard.selections": ["CLIPBOARD", "PRIMARY"],

    // Notifications
    notifications: config.notifications,
    "notifications.close": true,
    "notifications.actions": true,
  };
}

export function getCapabilities(config, soundCodecs) {
  return {
    version: "17",
    client_type: "HTML5",
    display: "",
    build: { revision: 0, local_modifications: 0, branch: "v17.x" },
    platform: {
      "": "Mac OSX",
      name: "Mac OSX",
      processor: "unknown",
      platform:
        "5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    },
    "session-type": "Chrome",
    "session-type.full":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    username: "",
    uuid: "abcde123412340123456789abcdef123456789abcde23456789abcdef23456789abcdef-23123456789abcde-6789abcd3456789abcde4-123489a-6123450123456789ab1234567834567",
    argv: ["http://localhost:57958/"],
    share: false,
    steal: true,
    "mouse.show": true,
    vrefresh: 119,
    "file-chunks": 131072,
    "setting-change": true,
    "xdg-menu-update": true,
    "xdg-menu": true,
    digest: [
      "xor",
      "keycloak",
      "hmac+sha1",
      "hmac+sha256",
      "hmac+sha384",
      "hmac+sha512",
    ],
    "salt-digest": [
      "xor",
      "keycloak",
      "hmac+sha1",
      "hmac+sha256",
      "hmac+sha384",
      "hmac+sha512",
    ],
    compression_level: 1,
    rencodeplus: true,
    brotli: false,
    lz4: true,
    "bandwidth-limit": 0,
    "connection-data": {},
    network: { pings: 5 },
    auto_refresh_delay: 500,
    "metadata.supported": [
      "fullscreen",
      "maximized",
      "iconic",
      "above",
      "below",
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
      "opacity",
    ],
    encodings: {
      "": [/* "rgb24", "rgb32", */ "png", "webp", "jpeg"],
      core: [/* "rgb24", "rgb32",*/ "png", "webp", "jpeg"],
      rgb_formats: ["RGBX", "RGBA", "RGB"],
      "window-icon": ["png"],
      cursor: ["png"],
      packet: true,
    },
    encoding: {
      "": "auto",
      icons: { max_size: [30, 30] },
      transparency: true,
      rgb_lz4: true,
      "decoder-speed": { video: 0 },
      "color-gamut": "P3",
      video_scaling: true,
      video_max_size: [1024, 768],
      full_csc_modes: {
        mpeg1: ["YUV420P"],
        h264: ["YUV420P"],
        "mpeg4+mp4": ["YUV420P"],
        "h264+mp4": ["YUV420P"],
        "vp8+webm": ["YUV420P"],
        webp: ["BGRX", "BGRA"],
        jpeg: [
          "BGRX",
          "BGRA",
          "BGR",
          "RGBX",
          "RGBA",
          "RGB",
          "YUV420P",
          "YUV422P",
          "YUV444P",
        ],
        vp8: ["YUV420P"],
      },
      h264: {
        "score-delta": 80,
        YUV420P: {
          profile: "baseline",
          level: "2.1",
          cabac: false,
          "deblocking-filter": false,
          "fast-decode": true,
        },
      },
      "h264+mp4": {
        "score-delta": 50,
        YUV420P: { profile: "baseline", level: "3.0" },
      },
      vp8: { "score-delta": 70 },
      "mpeg4+mp4": { "score-delta": 40 },
      "vp8+webm": { "score-delta": 40 },
      "min-speed": 50,
      "min-quality": 10,
    },
    audio: {
      receive: true,
      send: true,
      decoders: ["mp3", "vorbis+mka", "wav"],
    },
    clipboard: {
      enabled: true,
      want_targets: true,
      greedy: true,
      selections: ["CLIPBOARD"],
      "preferred-targets": [
        "text/plain",
        "text/html",
        "UTF8_STRING",
        "TEXT",
        "STRING",
      ],
    },
    keymap: {
      layout: "us",
      keycodes: [
        [8, "BackSpace", 8, 0, 0],
        [9, "Tab", 9, 0, 0],
        [12, "KP_Begin", 12, 0, 0],
        [13, "Return", 13, 0, 0],
        [16, "Shift_L", 16, 0, 0],
        [17, "Control_L", 17, 0, 0],
        [18, "Alt_L", 18, 0, 0],
        [19, "Pause", 19, 0, 0],
        [20, "Caps_Lock", 20, 0, 0],
        [27, "Escape", 27, 0, 0],
        [31, "Mode_switch", 31, 0, 0],
        [32, "space", 32, 0, 0],
        [33, "Prior", 33, 0, 0],
        [34, "Next", 34, 0, 0],
        [35, "End", 35, 0, 0],
        [36, "Home", 36, 0, 0],
        [37, "Left", 37, 0, 0],
        [38, "Up", 38, 0, 0],
        [39, "Right", 39, 0, 0],
        [40, "Down", 40, 0, 0],
        [42, "Print", 42, 0, 0],
        [45, "Insert", 45, 0, 0],
        [46, "Delete", 46, 0, 0],
        [48, "0", 48, 0, 0],
        [49, "1", 49, 0, 0],
        [50, "2", 50, 0, 0],
        [51, "3", 51, 0, 0],
        [52, "4", 52, 0, 0],
        [53, "5", 53, 0, 0],
        [54, "6", 54, 0, 0],
        [55, "7", 55, 0, 0],
        [56, "8", 56, 0, 0],
        [57, "9", 57, 0, 0],
        [58, "colon", 58, 0, 0],
        [59, "semicolon", 59, 0, 0],
        [60, "less", 60, 0, 0],
        [61, "equal", 61, 0, 0],
        [62, "greater", 62, 0, 0],
        [63, "question", 63, 0, 0],
        [64, "at", 64, 0, 0],
        [65, "a", 65, 0, 0],
        [66, "b", 66, 0, 0],
        [67, "c", 67, 0, 0],
        [68, "d", 68, 0, 0],
        [69, "e", 69, 0, 0],
        [70, "f", 70, 0, 0],
        [71, "g", 71, 0, 0],
        [72, "h", 72, 0, 0],
        [73, "i", 73, 0, 0],
        [74, "j", 74, 0, 0],
        [75, "k", 75, 0, 0],
        [76, "l", 76, 0, 0],
        [77, "m", 77, 0, 0],
        [78, "n", 78, 0, 0],
        [79, "o", 79, 0, 0],
        [80, "p", 80, 0, 0],
        [81, "q", 81, 0, 0],
        [82, "r", 82, 0, 0],
        [83, "s", 83, 0, 0],
        [84, "t", 84, 0, 0],
        [85, "u", 85, 0, 0],
        [86, "v", 86, 0, 0],
        [87, "w", 87, 0, 0],
        [88, "x", 88, 0, 0],
        [89, "y", 89, 0, 0],
        [90, "z", 90, 0, 0],
        [91, "Menu", 91, 0, 0],
        [92, "Menu", 92, 0, 0],
        [93, "KP_Enter", 93, 0, 0],
        [96, "0", 96, 0, 0],
        [97, "1", 97, 0, 0],
        [98, "2", 98, 0, 0],
        [99, "3", 99, 0, 0],
        [100, "4", 100, 0, 0],
        [101, "5", 101, 0, 0],
        [102, "6", 102, 0, 0],
        [103, "7", 103, 0, 0],
        [104, "8", 104, 0, 0],
        [105, "9", 105, 0, 0],
        [106, "KP_Multiply", 106, 0, 0],
        [107, "KP_Add", 107, 0, 0],
        [109, "KP_Subtract", 109, 0, 0],
        [110, "KP_Delete", 110, 0, 0],
        [111, "KP_Divide", 111, 0, 0],
        [112, "F1", 112, 0, 0],
        [113, "F2", 113, 0, 0],
        [114, "F3", 114, 0, 0],
        [115, "F4", 115, 0, 0],
        [116, "F5", 116, 0, 0],
        [117, "F6", 117, 0, 0],
        [118, "F7", 118, 0, 0],
        [119, "F8", 119, 0, 0],
        [120, "F9", 120, 0, 0],
        [121, "F10", 121, 0, 0],
        [122, "F11", 122, 0, 0],
        [123, "F12", 123, 0, 0],
        [124, "F13", 124, 0, 0],
        [125, "F14", 125, 0, 0],
        [126, "F15", 126, 0, 0],
        [127, "F16", 127, 0, 0],
        [128, "F17", 128, 0, 0],
        [129, "F18", 129, 0, 0],
        [130, "F19", 130, 0, 0],
        [131, "F20", 131, 0, 0],
        [132, "F21", 132, 0, 0],
        [133, "F22", 133, 0, 0],
        [134, "F23", 134, 0, 0],
        [135, "F24", 135, 0, 0],
        [144, "Num_Lock", 144, 0, 0],
        [145, "Scroll_Lock", 145, 0, 0],
        [160, "dead_circumflex", 160, 0, 0],
        [161, "exclam", 161, 0, 0],
        [162, "quotedbl", 162, 0, 0],
        [163, "numbersign", 163, 0, 0],
        [164, "dollar", 164, 0, 0],
        [165, "percent", 165, 0, 0],
        [166, "ampersand", 166, 0, 0],
        [167, "underscore", 167, 0, 0],
        [168, "parenleft", 168, 0, 0],
        [169, "parenright", 169, 0, 0],
        [170, "asterisk", 170, 0, 0],
        [171, "plus", 171, 0, 0],
        [172, "bar", 172, 0, 0],
        [173, "minus", 173, 0, 0],
        [174, "braceleft", 174, 0, 0],
        [175, "braceright", 175, 0, 0],
        [176, "asciitilde", 176, 0, 0],
        [186, "semicolon", 186, 0, 0],
        [187, "dead_acute", 187, 0, 0],
        [188, "comma", 188, 0, 0],
        [189, "minus", 189, 0, 0],
        [190, "period", 190, 0, 0],
        [191, "slash", 191, 0, 0],
        [192, "dead_circumflex", 192, 0, 0],
        [219, "backtick", 219, 0, 0],
        [220, "dead_circumflex", 220, 0, 0],
        [221, "dead_acute", 221, 0, 0],
        [222, "apostrophe", 222, 0, 0],
      ],
    },
    file: {
      enabled: true,
      printing: true,
      "open-url": true,
      "size-limit": 33554432,
    },
    wants: ["audio"],
    windows: true,
    "window.pre-map": true,
    keyboard: true,
    desktop_size: [1800, 465],
    desktop_mode_size: [1800, 465],
    screen_sizes: [
      [
        "Google Chrome 134",
        1800,
        465,
        476,
        123,
        [["Canvas", 0, 0, 1800, 465, 476, 123]],
        0,
        0,
        1800,
        465,
      ],
    ],
    dpi: { x: 96, y: 96 },
    notifications: { enabled: true },
    cursors: true,
    bell: true,
    system_tray: true,
    named_cursors: false,
  };

  const platform = getPlatform();
  const browser = getBrowser();
  const client = getClientCapabilities(config);
  const encoding = getEncodingCapabilities(config, soundCodecs);

  const extras = {};

  return {
    version: "18.0",
    client_type: "HTML5",
    platform: platform.type,
    "platform.name": platform.name,
    "patform.processor": platform.processor,
    "platform.platform": platform.platform,
    "session-type": browser.name,
    "session-type.full": browser.agent,
    namespace: true,
    username: config.username,
    uuid: config.uuid,
    argv: [window.location.href],

    // Compression bits
    zlib: config.zlib,
    lzi: false,
    lz4: config.lz4,
    "encoding.rgb_lz4": true,
    "lz4.js.version": "0.5.1", //lz4.version,
    compression_level: config.compression_level,

    vrefresh: -1,

    // Packet encoders
    rencodeplus: true,
    bencode: false,
    yaml: false,
    "open-url": true,

    "setting-change": true, // required by v5 server

    ...client,
    ...encoding,
    ...extras,
  };
}
