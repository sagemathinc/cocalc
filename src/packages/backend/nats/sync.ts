import { stream as createStream, type Stream } from "@cocalc/conat/sync/stream";
import {
  dstream as createDstream,
  type DStream,
} from "@cocalc/conat/sync/dstream";
import { kv as createKV, type KV } from "@cocalc/conat/sync/kv";
import { dkv as createDKV, type DKV } from "@cocalc/conat/sync/dkv";
import { dko as createDKO, type DKO } from "@cocalc/conat/sync/dko";
import { akv as createAKV, type AKV } from "@cocalc/conat/sync/akv";
import { createOpenFiles, type OpenFiles } from "@cocalc/conat/sync/open-files";
export { inventory } from "@cocalc/conat/sync/inventory";
import "./index";

export type { Stream, DStream, KV, DKV, DKO, AKV };

export async function stream<T = any>(opts): Promise<Stream<T>> {
  return await createStream<T>(opts);
}

export async function dstream<T = any>(opts): Promise<DStream<T>> {
  return await createDstream<T>(opts);
}

export async function kv<T = any>(opts): Promise<KV<T>> {
  return await createKV(opts);
}

export async function dkv<T = any>(opts): Promise<DKV<T>> {
  return await createDKV<T>(opts);
}

export function akv<T = any>(opts): AKV<T> {
  return createAKV<T>(opts);
}

export async function dko<T = any>(opts): Promise<DKO<T>> {
  return await createDKO(opts);
}

export async function openFiles(project_id: string, opts?): Promise<OpenFiles> {
  return await createOpenFiles({ project_id, ...opts });
}
