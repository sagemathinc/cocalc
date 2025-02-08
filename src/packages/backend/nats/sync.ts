import { stream as createStream } from "@cocalc/nats/sync/stream";
import { dstream as createDstream } from "@cocalc/nats/sync/dstream";
import { kv as createKV } from "@cocalc/nats/sync/kv";
import { dkv as createDKV } from "@cocalc/nats/sync/dkv";
import { getEnv } from "@cocalc/backend/nats/env";

export async function stream(opts) {
  return await createStream({ ...opts, env: await getEnv() });
}

export async function dstream(opts) {
  return await createDstream({ ...opts, env: await getEnv() });
}

export async function kv(opts) {
  return await createKV({ ...opts, env: await getEnv() });
}

export async function dkv(opts) {
  return await createDKV({ ...opts, env: await getEnv() });
}
