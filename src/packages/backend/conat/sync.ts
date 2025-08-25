import {
  dstream as createDstream,
  type DStream,
  type DStreamOptions as DstreamCreateOptions,
} from "@cocalc/conat/sync/dstream";
import { dkv as createDKV, type DKV, type DKVOptions } from "@cocalc/conat/sync/dkv";
import { dko as createDKO, type DKO } from "@cocalc/conat/sync/dko";
import { akv as createAKV, type AKV } from "@cocalc/conat/sync/akv";
import { astream as createAStream, type AStream } from "@cocalc/conat/sync/astream";
export { inventory } from "@cocalc/conat/sync/inventory";
import "./index";

export type { DStream, DKV, DKO, AKV };

export async function dstream<T = any>(
  opts: DstreamCreateOptions,
): Promise<DStream<T>> {
  return await createDstream<T>(opts);
}

export function astream<T = any>(opts: DstreamCreateOptions): AStream<T> {
  return createAStream<T>(opts);
}

export async function dkv<T = any>(opts: DKVOptions): Promise<DKV<T>> {
  return await createDKV<T>(opts);
}

export function akv<T = any>(opts: DKVOptions): AKV<T> {
  return createAKV<T>(opts);
}

export async function dko<T = any>(opts: DKVOptions): Promise<DKO<T>> {
  return await createDKO(opts);
}

