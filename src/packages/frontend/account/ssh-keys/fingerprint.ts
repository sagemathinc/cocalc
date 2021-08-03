//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

// Adapted from https://github.com/bahamas10/node-ssh-fingerprint

import md5 from "md5";

// add colons, 'hello' => 'he:ll:o'
const colons = (s: string) => s.replace(/(.{2})(?=.)/g, "$1:");

export function compute_fingerprint(pub: string): string {
  const pubbuffer = new Buffer(pub, "base64");
  const key = md5(pubbuffer);
  return colons(key);
}
