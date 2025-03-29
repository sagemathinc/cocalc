/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: Distributed under the terms of the Modified BSD License (same as ipywidgets)
 */

// Inspiration: this is meant to be a more modern version of upstream ipywidget's
// packages/base-manager/src/utils.ts, which based on a non-maintained library.
// Hence the BSD license.

import { fromUint8Array, toUint8Array } from "js-base64";

// Convert an ArrayBuffer to a base64 string.
// UNCLEAR: I put in ArrayBufferView also, since it's mentioned in all the typings
// in ipywidgets, and we can at least handle one case of it Uint8Array in
// one direction.
export function bufferToBase64(buffer: ArrayBuffer | ArrayBufferView): string {
  if (buffer instanceof ArrayBuffer) {
    return fromUint8Array(new Uint8Array(buffer));
  } else if (buffer instanceof Uint8Array) {
    return fromUint8Array(buffer);
  }
  throw new Error("buffer must be either ArrayBuffer or Uint8Array");
}

// Convert a base64 string to an ArrayBuffer.
export function base64ToBuffer(base64: string): ArrayBuffer {
  const buffer = toUint8Array(base64).buffer;
  // @ts-ignore
  return buffer;
}
