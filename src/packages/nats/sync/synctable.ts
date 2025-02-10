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
  ...options
}: {
  query;
  env: NatsEnv;
  account_id?: string;
  project_id?: string;
  atomic?: boolean;
  stream?: boolean;
  immutable?: boolean; // if true for SyncTableKVAtomic, then get/get_one output immutable.js objects
}) {
  if (stream) {
    if (atomic === false) {
      throw Error("streams must be atomic");
    }
    return new SyncTableStream({
      query,
      env,
      account_id,
      project_id,
      ...options,
    });
  } else {
    if (options?.immutable !== undefined) {
      // for now if immutable specified at all, do this (for now so project save works)
      return new SyncTableKV({
        query,
        env,
        account_id,
        project_id,
        ...options,
      });
    }
    return new SyncTableKVAtomic({
      query,
      env,
      account_id,
      project_id,
      atomic,
      ...options,
    });
  }
}
