/*
Compress and deocmpression JSON to a Buffer. This buffer *is* suitable
to write to an lz4 file and lz4 -d will work with it.

NOTE: I was worried because lz4-napi's compressSync and uncompressSync 
seem to have a MASSIVE memory leak.  I tested these functions via the
following, and did NOT observe a memory leak.  So it's maybe just a problem
with their sync functions, fortunately.

a = require('@cocalc/sync-fs/lib/compressed-json')
t=Date.now(); for(i=0;i<10000;i++) { await a.fromCompressedJSON(await a.toCompressedJSON({a:'x'.repeat(1000000)}))}; Date.now()-t
*/

import { compressFrame, decompressFrame } from "lz4-napi";

export async function toCompressedJSON(obj: any): Promise<Buffer> {
  return await compressFrame(Buffer.from(JSON.stringify(obj)));
}

export async function fromCompressedJSON(compressedJSON: Buffer): Promise<any> {
  return JSON.parse((await decompressFrame(compressedJSON)).toString());
}
