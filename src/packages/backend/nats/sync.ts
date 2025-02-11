import { stream as createStream, type Stream } from "@cocalc/nats/sync/stream";
import {
  dstream as createDstream,
  type DStream,
} from "@cocalc/nats/sync/dstream";
import { kv as createKV, type KV } from "@cocalc/nats/sync/kv";
import { dkv as createDKV, type DKV } from "@cocalc/nats/sync/dkv";
import { dko as createDKO, type DKO } from "@cocalc/nats/sync/dko";
import { getEnv } from "@cocalc/backend/nats/env";

export type { Stream, DStream, KV, DKV, DKO };

export async function stream(opts): Promise<Stream> {
  return await createStream({ env: await getEnv(), ...opts });
}

export async function dstream(opts, options?): Promise<DStream> {
  return await createDstream({ env: await getEnv(), ...opts }, options);
}

export async function kv(opts): Promise<KV> {
  return await createKV({ env: await getEnv(), ...opts });
}

export async function dkv(opts, options?): Promise<DKV> {
  return await createDKV({ env: await getEnv(), ...opts }, options);
}

export async function dko(opts): Promise<DKO> {
  return await createDKO({ env: await getEnv(), ...opts });
}
