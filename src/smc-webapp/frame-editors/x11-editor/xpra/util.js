/**
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */

import forge from "node-forge";
import { CHUNK_SZ, DEFAULT_DPI } from "./constants.js";

export const ord = s => s.charCodeAt(0);

export const browserLanguage = (defaultLanguage = "en") => {
  const properties = [
    "language",
    "browserLanguage",
    "systemLanguage",
    "userLanguage"
  ];
  const found = properties.map(prop => navigator[prop]).filter(str => !!str);

  const list = (navigator.languages || [found || defaultLanguage]).map(
    str => str.split(/-|_/)[0]
  );

  return list[0];
};

export const calculateDPI = () => {
  if ("deviceXDPI" in screen) {
    return (screen.systemXDPI + screen.systemYDPI) / 2;
  }

  /* FIXME
  try {
    const el = document.createElement('div');
    el.style.visibility = 'hidden';
    document.body.appendChild(el);

    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
      const dpi = Math.round((el.offsetWidth + el.offsetHeight) / 2.0);
      document.body.removeChild(el);
      return dpi;
    }
  } catch (e) {
    console.warn(e);
  }
  */

  return DEFAULT_DPI;
};

export const calculateColorGamut = () => {
  const map = {
    rec2020: "(color-gamut: rec2020)",
    P3: "(color-gamut: p3)",
    srgb: "(color-gamut: srgb)"
  };

  let found;
  if (typeof window.matchMedia === "function") {
    found = Object.keys(map).find(k => window.matchMedia(map[k]).matches);
  }

  return found ? found : "";
};

export const supportsWebp = () => {
  try {
    const el = document.createElement("canvas");
    const ctx = el.getContext("2d");

    if (ctx) {
      return el.toDataURL("image/webp").indexOf("data:image/webp") == 0;
    }
  } catch (e) {
    console.warn(e);
  }

  return false;
};

export const timestamp = () =>
  performance ? Math.round(performance.now()) : Date.now();

// apply in chunks of 10400 to avoid call stack overflow
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply
export const arraybufferBase64 = (uintArray, skip = 10400) => {
  let s = "";
  if (uintArray.subarray) {
    for (let i = 0, len = uintArray.length; i < len; i += skip) {
      s += String.fromCharCode.apply(
        null,
        uintArray.subarray(i, Math.min(i + skip, len))
      );
    }
  } else {
    for (let i = 0, len = uintArray.length; i < len; i += skip) {
      s += String.fromCharCode.apply(
        null,
        uintArray.slice(i, Math.min(i + skip, len))
      );
    }
  }

  return window.btoa(s);
};

// python-lz4 inserts the length of the uncompressed data as an int
// at the start of the stream
export function lz4decode(data) {
  throw Error("lz4decode: not implemented");
}
/*
export const lz4decode = data => {
  const d = data.subarray(0, 4);

  // output buffer length is stored as little endian
  const length = d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24);

  // decode the LZ4 block
  const inflated = new Uint8Array(length);
  const uncompressedSize = lz4.decodeBlock(data, inflated, 4);

  return { uncompressedSize, inflated };
};
*/

export const strToUint8 = str => {
  let u8a = new Uint8Array(str.length);
  for (let i = 0, j = str.length; i < j; ++i) {
    u8a[i] = str.charCodeAt(i);
  }

  return u8a;
};

export const uint8ToStr = u8a => {
  let c = [];
  for (let i = 0; i < u8a.length; i += CHUNK_SZ) {
    c.push(String.fromCharCode.apply(null, u8a.subarray(i, i + CHUNK_SZ)));
  }

  return c.join("");
};
export const xorString = (str1, str2) => {
  let result = "";
  if (str1.length !== str2.length) {
    throw new Error("strings must be equal length");
  }

  for (let i = 0; i < str1.length; i++) {
    result += String.fromCharCode(
      str1[i].charCodeAt(0) ^ str2[i].charCodeAt(0)
    );
  }

  return result;
};

export const hexUUID = () => {
  let s = [];
  const hexDigits = "0123456789abcdef";

  for (let i = 0; i < 36; i++) {
    s[i] =
      i === 8 || i === 13 || i === 18 || i === 23
        ? "-"
        : hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
  }

  return s.join("");
};

export const calculateScreens = (width, height, dpi) => {
  const wmm = Math.round((width * 25.4) / dpi);
  const hmm = Math.round((height * 25.4) / dpi);

  const monitor = ["Canvas", 0, 0, width, height, wmm, hmm];
  const screen = [
    "HTML",
    width,
    height,
    wmm,
    hmm,
    [monitor],
    0,
    0,
    width,
    height
  ];

  return [screen]; // just a single screen
};

export const generateSalt = (saltDigest, serverSalt) => {
  const l = saltDigest === "xor" ? serverSalt.length : 32;

  if (l < 16 || l > 256) {
    throw new Error("Invalid salt length of", l);
  }

  let s = "";
  while (s.length < l) {
    s += hexUUID();
  }

  return s.slice(0, l);
};

export const generateDigest = (digest, password, salt) => {
  if (digest.startsWith("hmac")) {
    let hash = "md5";
    if (digest.indexOf("+") > 0) {
      hash = digest.split("+")[1];
    }

    const hmac = forge.hmac.create();
    hmac.start(hash, password);
    hmac.update(salt);

    return hmac.digest().toHex();
  } else if (digest === "xor") {
    const trimmed = salt.slice(0, password.length);

    return xorString(trimmed, password);
  }

  return null;
};
