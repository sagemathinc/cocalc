import { type NatsEnv } from "@cocalc/nats/types";
import { SyncTableKV } from "./synctable-kv";
import { SyncTableStream } from "./synctable-stream";

export type SyncTable = SyncTableStream | SyncTableKV;

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
    return new SyncTableStream({
      query,
      env,
      account_id,
      project_id,
      immutable,
      ...options,
    });
  } else {
    return new SyncTableKV({
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
