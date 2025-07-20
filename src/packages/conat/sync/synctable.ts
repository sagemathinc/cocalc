import { SyncTableKV } from "./synctable-kv";
import { SyncTableStream } from "./synctable-stream";
import refCache from "@cocalc/util/refcache";
import { type KVLimits } from "./limits";
import { type FilteredStreamLimitOptions } from "./limits";
import jsonStableStringify from "json-stable-stringify";
import { type Client } from "@cocalc/conat/core/client";

export type ConatSyncTable = SyncTableStream | SyncTableKV;

export type ConatSyncTableFunction = (
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
) => Promise<ConatSyncTable>;

// When the database is watching tables for changefeeds, if it doesn't
// get a clear expression of interest from a client every this much time,
// it stops managing the changefeed to save resources.

export const CHANGEFEED_INTEREST_PERIOD_MS = 120000;
// export const CHANGEFEED_INTEREST_PERIOD_MS = 3000;

export interface SyncTableOptions {
  query;
  client?: Client;
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
  ephemeral?: boolean;
  noAutosave?: boolean;
}

export const createSyncTable = refCache<SyncTableOptions, ConatSyncTable>({
  name: "synctable",
  createKey: (opts: SyncTableOptions) =>
    jsonStableStringify({ ...opts, client: opts.client?.id })!,
  createObject: async (options: SyncTableOptions & { client: Client }) => {
    let t;
    if (options.stream) {
      t = new SyncTableStream(options);
    } else {
      t = new SyncTableKV(options);
    }
    await t.init();
    return t;
  },
});
