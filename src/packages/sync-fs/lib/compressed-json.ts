/*
Compress and deocmpression JSON to a Buffer. This buffer *is* suitable
to write to an lz4 file and lz4 -d will work with it.
*/

import { compressFrame, decompressFrame } from "lz4-napi";

export async function toCompressedJSON(obj: any): Promise<Buffer> {
  return await compressFrame(Buffer.from(JSON.stringify(obj)));
}

export async function fromCompressedJSON(compressedJSON: Buffer): Promise<any> {
  return JSON.parse((await decompressFrame(compressedJSON)).toString());
}
