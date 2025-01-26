import { SyncTableKV } from "./synctable-kv";
import { SyncTableStream } from "./synctable-stream";
import { keys } from "lodash";

export type SyncTable = SyncTableKV | SyncTableStream;

export function createSyncTable({
  query,
  env,
  account_id,
  project_id,
}: {
  query;
  env;
  account_id?;
  project_id?;
}) {
  const table = keys(query)[0];
  if (table == "patches") {
    return new SyncTableStream({ query, env, account_id, project_id });
  }
  return new SyncTableKV({ query, env, account_id, project_id });
}
