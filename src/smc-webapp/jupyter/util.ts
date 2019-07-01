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
