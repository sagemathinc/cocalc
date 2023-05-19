import SyncClient from "@cocalc/sync-client";
import { SyncDB } from "@cocalc/sync/editor/db";
import { meta_file } from "@cocalc/util/misc";

export function tasks({ path }: { path: string }): SyncDB {
  const c = new SyncClient();
  const s = c.sync_client.sync_db({
    project_id: "97ce5a7c-25c1-4059-8670-c7de96a0db92",
    path,
    primary_keys: ["task_id"],
    string_cols: ["desc"],
  });
  return s;
}

// path should be something like "foo/bar.ipynb"
export function jupyter({ path }: { path: string }): SyncDB {
  const syncdb_path = meta_file(path, "jupyter2");
  const c = new SyncClient();
  const s = c.sync_client.sync_db({
    project_id: "97ce5a7c-25c1-4059-8670-c7de96a0db92",
    path: syncdb_path,
    change_throttle: 50, // our UI/React can handle more rapid updates; plus we want output FAST.
    patch_interval: 50,
    primary_keys: ["type", "id"],
    string_cols: ["input"],
    cursors: false,
    persistent: true,
  });
  return s;
}
