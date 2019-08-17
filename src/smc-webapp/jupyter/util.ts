/*
Some simple misc functions with no dependencies.

It's very good to have these as functions rather than put
the code all over the place and have conventions about paths!

part of CoCalc
(c) SageMath, Inc., 2017
*/

import * as immutable from "immutable";

// This list is inspired by OutputArea.output_types in https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/outputarea.js
// The order matters -- we only keep the left-most type (see import-from-ipynb.coffee)

export const JUPYTER_MIMETYPES = [
  "application/javascript",
  "text/html",
  "text/markdown",
  "text/latex",
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "application/pdf",
  "text/plain"
];

export type Kernel = immutable.Map<string, string>;
export type Kernels = immutable.List<Kernel>;

export function codemirror_to_jupyter_pos(
  code: string,
  pos: { ch: number; line: number }
): number {
  const lines = code.split("\n");
  let s = pos.ch;
  for (let i = 0; i < pos.line; i++) {
    s += lines[i].length + 1;
  }
  return s;
}

// Return s + ... + s = s*n (in python notation), where there are n>=0 summands.
export function times_n(s: string, n: number): string {
  let t = "";
  for (let i = 0; i < n; i++) t += s;
  return t;
}

// These js_idx functions are adapted from https://github.com/jupyter/notebook/pull/2509
// Also, see https://github.com/nteract/hydrogen/issues/807 for why.
// An example using a python3 kernel is to define
//    𨭎𨭎𨭎𨭎𨭎 = 10
// then type 𨭎𨭎[tab key] and see it properly complete.

// javascript stores text as utf16 and string indices use "code units",
// which stores high-codepoint characters as "surrogate pairs",
// which occupy two indices in the javascript string.
// We need to translate cursor_pos in the protocol (in characters)
// to js offset (with surrogate pairs taking two spots).
export function js_idx_to_char_idx(js_idx: number, text: string): number {
  let char_idx = js_idx;
  for (let i = 0; i + 1 < text.length && i < js_idx; i++) {
    const char_code = text.charCodeAt(i);
    // check for surrogate pair
    if (char_code >= 0xd800 && char_code <= 0xdbff) {
      const next_char_code = text.charCodeAt(i + 1);
      if (next_char_code >= 0xdc00 && next_char_code <= 0xdfff) {
        char_idx--;
        i++;
      }
    }
  }
  return char_idx;
}

export function char_idx_to_js_idx(char_idx: number, text: string): number {
  let js_idx = char_idx;
  for (let i = 0; i + 1 < text.length && i < js_idx; i++) {
    const char_code = text.charCodeAt(i);
    // check for surrogate pair
    if (char_code >= 0xd800 && char_code <= 0xdbff) {
      const next_char_code = text.charCodeAt(i + 1);
      if (next_char_code >= 0xdc00 && next_char_code <= 0xdfff) {
        js_idx++;
        i++;
      }
    }
  }
  return js_idx;
}
