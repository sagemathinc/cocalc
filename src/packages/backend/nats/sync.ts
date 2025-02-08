import { stream as createStream } from "@cocalc/nats/sync/stream";
import { dstream as createDstream } from "@cocalc/nats/sync/dstream";
import { getEnv } from "@cocalc/backend/nats/env";

export async function stream(opts) {
  return await createStream({ ...opts, env: await getEnv() });
}

export async function dstream(opts) {
  return await createDstream({ ...opts, env: await getEnv() });
}
