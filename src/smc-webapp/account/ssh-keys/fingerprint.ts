//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

// Adapted from https://github.com/bahamas10/node-ssh-fingerprint

import { createHash } from "crypto";

// hash a string with the given alg
const hash = (s: Buffer, alg: string): string => {
  return createHash(alg).update(s).digest("hex");
};
// add colons, 'hello' => 'he:ll:o'
const colons = (s: string) => s.replace(/(.{2})(?=.)/g, "$1:");

export function compute_fingerprint(pub: string, alg: string = "md5"): string {
  const pubbuffer = new Buffer(pub, "base64");
  const key = hash(pubbuffer, alg);
  return colons(key);
}
