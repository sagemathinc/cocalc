/*
sha1 hash functionality
*/

import { createHash, type BinaryToTextEncoding } from "crypto";

// compute sha1 hash of data in hex
export function sha1(
  data: Buffer | string,
  encoding: BinaryToTextEncoding = "hex",
): string {
  const sha1sum = createHash("sha1");
  if (typeof data === "string") {
    sha1sum.update(data, "utf8");
  } else {
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    sha1sum.update(uint8Array);
  }

  return sha1sum.digest(encoding);
}

export function sha1base64(data: Buffer | string): string {
  return sha1(data, "base64");
}

// Compute a uuid v4 from the Sha-1 hash of data.
// Optionally, if knownSha1 is given, just uses that, rather than recomputing it.
// WARNING: try to avoid using this, since it discards information!
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
