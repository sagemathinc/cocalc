import SyncClient from "@cocalc/sync-client";
import { SyncDB } from "@cocalc/sync/editor/db";

export function tasks({
  project_id,
  path,
}: {
  project_id: string;
  path: string;
}): SyncDB {
  const c = new SyncClient({ project_id, role: "compute_server" });
  const s = c.sync_client.sync_db({
    project_id,
    path,
    primary_keys: ["task_id"],
    string_cols: ["desc"],
  });
  return s;
}
