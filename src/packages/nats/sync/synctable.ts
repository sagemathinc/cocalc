import { type NatsEnv } from "@cocalc/nats/types";
import { SyncTableKV } from "./synctable-kv";
import { SyncTableStream } from "./synctable-stream";
import { refCacheSync } from "@cocalc/util/refcache";
import { type KVLimits } from "./general-kv";
import { type FilteredStreamLimitOptions } from "./stream";

export type NatsSyncTable = SyncTableStream | SyncTableKV;

export type NatsSyncTableFunction = (
  query: { [table: string]: { [field: string]: any }[] },
  options?: {
    obj?: object;
    atomic?: boolean;
    immutable?: boolean;
    stream?: boolean;
    pubsub?: boolean;
    throttleChanges?: number;
    // for tables specific to a project, e.g., syncstrings in a project
    project_id?: string;
  },
) => Promise<NatsSyncTable>;

// When the database is watching tables for changefeeds, if it doesn't get a clear expression
// of interest from a client every this much time, it stops managing the changefeed to
// save resources.

export const CHANGEFEED_INTEREST_PERIOD_MS = 120000;
// export const CHANGEFEED_INTEREST_PERIOD_MS = 3000;

interface Options {
  query;
  env: NatsEnv;
  account_id?: string;
  project_id?: string;
  atomic?: boolean;
  stream?: boolean;
  immutable?: boolean; // if true, then get/set works with immutable.js objects instead.
  noCache?: boolean;
  limits?: Partial<KVLimits> | Partial<FilteredStreamLimitOptions>;
  desc?: any;
  start_seq?: number;
  noInventory?: boolean;
}

function createObject(options: Options) {
  if (options.stream) {
    return new SyncTableStream(options);
  } else {
    return new SyncTableKV(options);
  }
}

export const createSyncTable = refCacheSync<Options, NatsSyncTable>({
  createKey: (opts) => JSON.stringify({ ...opts, env: undefined }),
  createObject,
});
