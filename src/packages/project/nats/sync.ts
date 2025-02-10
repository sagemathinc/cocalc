import { stream as createStream, type Stream } from "@cocalc/nats/sync/stream";
import {
  dstream as createDstream,
  type DStream,
} from "@cocalc/nats/sync/dstream";
import { kv as createKV, type KV } from "@cocalc/nats/sync/kv";
import { dkv as createDKV, type DKV } from "@cocalc/nats/sync/dkv";
import { dko as createDKO, type DKO } from "@cocalc/nats/sync/dko";
import { getEnv } from "./env";
import { project_id } from "@cocalc/project/data";

export type { Stream, DStream, KV, DKV };

export async function stream(opts): Promise<Stream> {
  return await createStream({ project_id, env: await getEnv(), ...opts });
}

export async function dstream(opts): Promise<DStream> {
  return await createDstream({ project_id, env: await getEnv(), ...opts });
}

export async function kv(opts): Promise<KV> {
  return await createKV({ project_id, env: await getEnv(), ...opts });
}

export async function dkv(opts): Promise<DKV> {
  return await createDKV({ project_id, env: await getEnv(), ...opts });
}

export async function dko(opts): Promise<DKO> {
  return await createDKO({ project_id, env: await getEnv(), ...opts });
}
