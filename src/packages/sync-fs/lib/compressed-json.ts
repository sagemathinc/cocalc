import { encode, decode } from "lz4";

export function toCompressedJSON(obj: any): Buffer {
  return encode(Buffer.from(JSON.stringify(obj)));
}

export function fromCompressedJSON(compressedJSON: Buffer): any {
  return JSON.parse(decode(compressedJSON).toString());
}
