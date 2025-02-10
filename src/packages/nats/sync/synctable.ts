import { type NatsEnv } from "@cocalc/nats/types";
import { SyncTableKV } from "./synctable-kv";
import { SyncTableKVAtomic } from "./synctable-kv-atomic";
import { SyncTableStream } from "./synctable-stream";

export type SyncTable = SyncTableKV | SyncTableStream | SyncTableKVAtomic;

// When the database is watching tables for changefeeds, if it doesn't get a clear expression
// of interest from a client every this much time, it automatically stops.
export const CHANGEFEED_INTEREST_PERIOD_MS = 120000;

export function createSyncTable({
  query,
  env,
  account_id,
  project_id,
  atomic,
  stream,
  immutable,
  ...options
}: {
  query;
  env: NatsEnv;
  account_id?: string;
  project_id?: string;
  atomic?: boolean;
  stream?: boolean;
  immutable?: boolean; // if true, then get/set works with immutable.js objects instead.
}) {
  if (stream) {
    if (atomic === false) {
      throw Error("streams must be atomic");
    }
    if (immutable) {
      throw Error("immutable not yet supported for streams");
    }
    return new SyncTableStream({
      query,
      env,
      account_id,
      project_id,
      ...options,
    });
  } else {
    return new SyncTableKVAtomic({
      query,
      env,
      account_id,
      project_id,
      atomic,
      immutable,
      ...options,
    });
  }
}
