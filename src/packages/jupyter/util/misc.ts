/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Some simple misc functions with no dependencies.

It's very good to have these as functions rather than put
the code all over the place and have conventions about paths!

part of CoCalc
(c) SageMath, Inc., 2017
*/

import * as immutable from "immutable";

import { cmp } from "@cocalc/util/misc";

// This list is inspired by OutputArea.output_types in https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/outputarea.js
// The order matters -- we only keep the left-most type (see import-from-ipynb.ts)
// See https://jupyterlab.readthedocs.io/en/stable/user/file_formats.html#file-and-output-formats

export const JUPYTER_MIMETYPES = [
  "application/javascript",
  "application/json",
  "text/html",
  "text/markdown",
  "text/latex",
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/bmp",
  "image/gif",
  "application/pdf",
  "text/plain",
] as const;

export const JUPYTER_MIMETYPES_SET = new Set(JUPYTER_MIMETYPES);

// with metadata.cocalc.priority >= this the kernel will be "emphasized" or "suggested" in the UI
export const KERNEL_POPULAR_THRESHOLD = 10;

export type Kernel = immutable.Map<string, string>;
export type Kernels = immutable.List<Kernel>;

export function codemirror_to_jupyter_pos(
  code: string,
  pos: { ch: number; line: number },
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

// Transforms the KernelSpec list into two useful datastructures.
// Was part of jupyter/store, but now used in several places.
export function get_kernels_by_name_or_language(
  kernels: Kernels,
): [
  immutable.OrderedMap<string, immutable.Map<string, string>>,
  immutable.OrderedMap<string, immutable.List<string>>,
] {
  const data_name: any = {};
  let data_lang: any = {};
  const add_lang = (lang, entry) => {
    if (data_lang[lang] == null) data_lang[lang] = [];
    data_lang[lang].push(entry);
  };
  kernels
    .filter((entry) => entry.getIn(["metadata", "cocalc", "disabled"]) !== true)
    .map((entry) => {
      const name = entry.get("name");
      const lang = entry.get("language");
      if (name != null) data_name[name] = entry;
      if (lang == null) {
        // we collect all kernels without a language under "misc"
        add_lang("misc", entry);
      } else {
        add_lang(lang, entry);
      }
    });
  const by_name = immutable
    .OrderedMap<string, immutable.Map<string, string>>(data_name)
    .sortBy((v, k) => {
      return v.get("display_name", v.get("name", k)).toLowerCase();
    });
  // data_lang, we're only interested in the kernel names, not the entry itself
  data_lang = immutable.fromJS(data_lang).map((v, k) => {
    v = v
      .sortBy((v) => v.get("display_name", v.get("name", k)).toLowerCase())
      .map((v) => v.get("name"));
    return v;
  });
  const by_lang = immutable
    .OrderedMap<string, immutable.List<string>>(data_lang)
    .sortBy((_v, k) => k.toLowerCase());
  return [by_name, by_lang];
}

/*
 * select all kernels, which are ranked highest for a specific language.
 *
 * kernel metadata looks like that
 *
 *  "display_name": ...,
 *  "argv":, ...
 *  "language": "sagemath",
 *  "metadata": {
 *    "cocalc": {
 *      "priority": 10,
 *      "description": "Open-source mathematical software system",
 *      "url": "https://www.sagemath.org/",
 *      "disabled": true
 *    }
 *  }
 *
 * Return dict of language <-> kernel_name
 */
export function get_kernel_selection(
  kernels: Kernels,
): immutable.Map<string, string> {
  // for each language, we pick the top priority kernel
  const data: any = {};
  kernels
    .filter((entry) => entry.get("language") != null)
    .groupBy((entry) => entry.get("language"))
    .forEach((kernels, lang) => {
      const top: any = kernels
        .sort((a, b) => {
          const va = -(a.getIn(
            ["metadata", "cocalc", "priority"],
            0,
          ) as number);
          const vb = -(b.getIn(
            ["metadata", "cocalc", "priority"],
            0,
          ) as number);
          return cmp(va, vb);
        })
        .first();
      if (top == null || lang == null) return true;
      const name = top.get("name");
      if (name == null) return true;
      data[lang] = name;
    });

  return immutable.Map<string, string>(data);
}
