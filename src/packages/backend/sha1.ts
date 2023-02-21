/*
sha1 hash functionality
*/

import { createHash } from "crypto";

// compute sha1 hash of data in hex
export function sha1(data: Buffer | string): string {
  if (typeof data === "string") {
    // CRITICAL: Code below assumes data is a Buffer; it will seem to work on a string, but give
    // the wrong result where wrong means that it doesn't agree with the frontend version defined
    // in misc.
    data = Buffer.from(data);
  }
  const sha1sum = createHash("sha1");
  sha1sum.update(data);
  return sha1sum.digest("hex");
}

// Compute a uuid v4 from the Sha-1 hash of data.
// Optionally, if knownSha1 is given, just uses that, rather than recomputing it.
export function uuidsha1(data: Buffer | string, knownSha1?: string): string {
  const s = knownSha1 ?? sha1(data);
  let i = -1;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    i += 1;
    switch (c) {
      case "x":
        return s[i] ?? "0";
      case "y":
        // take 8 + low order 3 bits of hex number.
        return ((parseInt("0x" + s[i], 16) & 0x3) | 0x8).toString(16);
    }
    return "0";
  });
}
