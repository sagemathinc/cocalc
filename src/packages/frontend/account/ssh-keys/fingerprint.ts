/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Adapted from https://github.com/bahamas10/node-ssh-fingerprint

import md5 from "md5";

// add colons, 'hello' => 'he:ll:o'
const colons = (s: string) => s.replace(/(.{2})(?=.)/g, "$1:");

export function compute_fingerprint(pub: string | undefined): string {
  if (pub == null) {
    throw new Error("No valid SSH key value");
  }
  const pubbuffer = Buffer.from(pub, "base64");
  const key = md5(
    new Uint8Array(
      pubbuffer.buffer,
      pubbuffer.byteOffset,
      pubbuffer.byteLength,
    ),
  );
  return colons(key);
}
