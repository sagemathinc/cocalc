import { SyncTableKV } from "./synctable-kv";
import { SyncTableStream } from "./synctable-stream";
import { keys } from "lodash";

export type SyncTable = SyncTableKV | SyncTableStream;

export function createSyncTable({ query, env }) {
  const table = keys(query)[0];
  if (table == "patches") {
    return new SyncTableStream({ query, env });
  }
  return new SyncTableKV({ query, env });
}
