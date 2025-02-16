import { stream as createStream, type Stream } from "@cocalc/nats/sync/stream";
import {
  dstream as createDstream,
  type DStream,
} from "@cocalc/nats/sync/dstream";
import { kv as createKV, type KV } from "@cocalc/nats/sync/kv";
import { dkv as createDKV, type DKV } from "@cocalc/nats/sync/dkv";
import { dko as createDKO, type DKO } from "@cocalc/nats/sync/dko";
import { getEnv } from "@cocalc/backend/nats/env";
import { createOpenFiles, type OpenFiles } from "@cocalc/nats/sync/open-files";

export type { Stream, DStream, KV, DKV, DKO };

export async function stream(opts): Promise<Stream> {
  return await createStream({ env: await getEnv(), ...opts });
}

export async function dstream<T = any>(opts): Promise<DStream<T>> {
  return await createDstream<T>({ env: await getEnv(), ...opts });
}

export async function kv(opts): Promise<KV> {
  return await createKV({ env: await getEnv(), ...opts });
}

export async function dkv(opts): Promise<DKV> {
  return await createDKV({ env: await getEnv(), ...opts });
}

export async function dko(opts): Promise<DKO> {
  return await createDKO({ env: await getEnv(), ...opts });
}

export async function openFiles(project_id: string, opts?): Promise<OpenFiles> {
  return await createOpenFiles({ env: await getEnv(), project_id, ...opts });
}
