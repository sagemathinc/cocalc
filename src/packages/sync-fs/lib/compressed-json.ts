import { encode, decode } from "lz4";

export function toCompressedJSON(obj: any): string {
  return encode(Buffer.from(JSON.stringify(obj))).toString();
}

export function fromCompressedJSON(compressedJSON: string): any {
  return JSON.parse(decode(Buffer.from(compressedJSON)).toString());
}
