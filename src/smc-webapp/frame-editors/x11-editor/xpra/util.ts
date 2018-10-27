/**
 * CoCalc XPRA HTML Client.
 */

import forge from "node-forge";
import { CHUNK_SZ, DEFAULT_DPI } from "./constants";

export function ord(s: string): number {
  return s.charCodeAt(0);
}

/* possible values of navigator.language:

 ["af", "sq", "ar-SA", "ar-IQ", "ar-EG", "ar-LY", "ar-DZ", "ar-MA", "ar-TN", "ar-OM", "ar-YE", "ar-SY", "ar-JO", "ar-LB", "ar-KW", "ar-AE", "ar-BH", "ar-QA", "eu", "bg", "be", "ca", "zh-TW", "zh-CN", "zh-HK", "zh-SG", "hr", "cs", "da", "nl", "nl-BE", "en", "en-US", "en-EG", "en-AU", "en-GB", "en-CA", "en-NZ", "en-IE", "en-ZA", "en-JM", "en-BZ", "en-TT", "et", "fo", "fa", "fi", "fr", "fr-BE", "fr-CA", "fr-CH", "fr-LU", "gd", "gd-IE", "de", "de-CH", "de-AT", "de-LU", "de-LI", "el", "he", "hi", "hu", "is", "id", "it", "it-CH", "ja", "ko", "lv", "lt", "mk", "mt", "no", "pl", "pt-BR", "pt", "rm", "ro", "ro-MO", "ru", "ru-MI", "sz", "sr", "sk", "sl", "sb", "es", "es-AR", "es-GT", "es-CR", "es-PA", "es-DO", "es-MX", "es-VE", "es-CO", "es-PE", "es-EC", "es-CL", "es-UY", "es-PY", "es-BO", "es-SV", "es-HN", "es-NI", "es-PR", "sx", "sv", "sv-FI", "th", "ts", "tn", "tr", "uk", "ur", "ve", "vi", "xh", "ji", "zu"];
*/
export function browserLanguage(): string {
  return window.navigator.language;
}

/* There's a full list of keyboard layout codes here:

https://unix.stackexchange.com/questions/43976/list-all-valid-kbd-layouts-variants-and-toggle-options-to-use-with-setxkbmap

This answer claims doing this is impossible: https://stackoverflow.com/questions/8892238/detect-keyboard-layout-with-javascript

Table here: https://www.metamodpro.com/browser-language-codes

And this is hopeless naive, e.g., navigator.language for
japan is `ja` but the code is `jp`.

TODO: So the plan for now is to have this *heuristic*
for now, but later have a user-configurable preference
that lets the user further customize things.  Also Dvorak, Neo, etc.

Examples:
en-US    us
de       de
de-AT    de     that's just like germany
de-CH    ch     they have a special keyboard
en-GB    gb     there is a united kingom keyboard in the list
ja       jp
hu       hu

The heuristic below is of course wrong even on some of the above,
e.g., on de-AT and ja.  We will do something better later, including
user choice.
*/
export function keyboardLayout(): string {
  let v = browserLanguage();
  if (v == null) {
    // fallback that will never happen with modern browsers.
    return "us";
  }
  v = v.toLowerCase();
  //e.g.: v="en-gb";
  v = v.split(",")[0];
  let l = v.split("-", 2);
  if (l.length === 1) {
    // note: upstream, this returns an empty string, but imagine v="de"
    return l[0];
  }
  //e.g.: "gb"
  return l[1];
}

export function calculateDPI(): number {
  return Math.round(DEFAULT_DPI * window.devicePixelRatio);
}

export function calculateColorGamut(): string {
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
}

// Important to check!  https://caniuse.com/#search=webp
export function supportsWebp(): boolean {
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
}

export function timestamp(): number {
  return performance ? Math.round(performance.now()) : Date.now();
}

// apply in chunks of 10400 to avoid call stack overflow
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply
export function arraybufferBase64(uintArray, skip = 10400): string {
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
}

// python-lz4 inserts the length of the uncompressed data as an int
// at the start of the stream
export function lz4decode(_) {
  throw Error("lz4decode: not implemented");
}

// TODO: The following doesn't work at all using the lz4js npm module.
// There is a HUGE 8k lines lz4 implementation in the xpra code,
// which I might try instead...  This is important for speed!
/*
export function lz4decode = data => {
  const d = data.subarray(0, 4);

  // output buffer length is stored as little endian
  const length = d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24);

  // decode the LZ4 block
  const inflated = new Uint8Array(length);
  const uncompressedSize = lz4.decodeBlock(data, inflated, 4);

  return { uncompressedSize, inflated };
};
*/

export function strToUint8(str: string): Uint8Array {
  const u8a = new Uint8Array(str.length);
  for (let i = 0, j = str.length; i < j; ++i) {
    u8a[i] = str.charCodeAt(i);
  }

  return u8a;
}

export function uint8ToStr(u8a: Uint8Array): string {
  const c: string[] = [];
  for (let i = 0; i < u8a.length; i += CHUNK_SZ) {
    c.push(String.fromCharCode.apply(null, u8a.subarray(i, i + CHUNK_SZ)));
  }

  return c.join("");
}

export function xorString(str1: string, str2: string): string {
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
}

export function hexUUID(): string {
  const s: string[] = [];
  const hexDigits = "0123456789abcdef";

  for (let i = 0; i < 36; i++) {
    s[i] =
      i === 8 || i === 13 || i === 18 || i === 23
        ? "-"
        : hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
  }

  return s.join("");
}

export function calculateScreens(width: number, height: number, dpi: number) {
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
}

export function generateSalt(saltDigest: string, serverSalt: string): string {
  const l = saltDigest === "xor" ? serverSalt.length : 32;

  if (l < 16 || l > 256) {
    throw Error(`Invalid salt length of ${l}`);
  }

  let s = "";
  while (s.length < l) {
    s += hexUUID();
  }

  return s.slice(0, l);
}

export function generateDigest(
  digest: string,
  password: string,
  salt: string
): string | null {
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
}
