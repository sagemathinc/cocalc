import SyncClient from "@cocalc/sync-client";
import { SyncDB } from "@cocalc/sync/editor/db";
import { meta_file } from "@cocalc/util/misc";
import { jupyter_backend, kernel } from "@cocalc/jupyter/kernel";
import getLogger from "@cocalc/backend/logger";
const logger = getLogger("compute");

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
export async function jupyter({ path }: { path: string }): Promise<any> {
  const log = (...args) => logger.debug(path, ...args);
  const syncdb_path = meta_file(path, "jupyter2");
  const client = new SyncClient();
  const syncdb = client.sync_client.sync_db({
    project_id: "97ce5a7c-25c1-4059-8670-c7de96a0db92",
    path: syncdb_path,
    change_throttle: 50, // our UI/React can handle more rapid updates; plus we want output FAST.
    patch_interval: 50,
    primary_keys: ["type", "id"],
    string_cols: ["input"],
    cursors: false,
    persistent: true,
  });
  log("got syncdb");
  await syncdb.wait_until_ready();
  log("ready");

  // Doing this jupyter_backend will create the actions, which will then create this
  // kernel object when the first eval happens...
  // TODO

  // jupyter_backend(syncdb, client)
  const name = syncdb.get_one({ type: "settings" })?.get("kernel");
  log("kernel name = ", name);
  if (!name) {
    throw Error("no kernel set");
  }
  const ker = kernel({ path, name });
  return { syncdb, kernel: ker };
}
