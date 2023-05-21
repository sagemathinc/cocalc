import SyncClient from "@cocalc/sync-client";
import { SyncDB } from "@cocalc/sync/editor/db";
import { meta_file } from "@cocalc/util/misc";
import { initJupyterRedux } from "@cocalc/jupyter/kernel";
import { redux } from "@cocalc/jupyter/redux/app";
import getLogger from "@cocalc/backend/logger";
const logger = getLogger("compute");
import { COMPUTE_THRESH_MS } from "@cocalc/jupyter/redux/project-actions";

export function tasks({
  project_id,
  path,
}: {
  project_id: string;
  path: string;
}): SyncDB {
  const c = new SyncClient();
  const s = c.sync_client.sync_db({
    project_id,
    path,
    primary_keys: ["task_id"],
    string_cols: ["desc"],
  });
  return s;
}

// path should be something like "foo/bar.ipynb"
export function jupyter({
  project_id,
  path,
}: {
  project_id: string;
  path: string;
}) {
  const log = (...args) => logger.debug(path, ...args);
  log();
  const syncdb_path = meta_file(path, "jupyter2");
  const client = new SyncClient();
  const syncdb = client.sync_client.sync_db({
    project_id,
    path: syncdb_path,
    change_throttle: 50, // our UI/React can handle more rapid updates; plus we want output FAST.
    patch_interval: 50,
    primary_keys: ["type", "id"],
    string_cols: ["input"],
    cursors: false,
    persistent: true,
  });

  syncdb.once("ready", () => {
    const f = () => {
      syncdb.set({
        type: "compute",
        id: client.client_id(),
        time: Date.now(),
      });
      syncdb.commit();
    };
    const i = setInterval(f, COMPUTE_THRESH_MS / 2);
    f();
    syncdb.once("closed", () => {
      clearInterval(i);
    });
  });

  log("initializing jupyter notebook redux...");
  initJupyterRedux(syncdb, client);
  const actions = redux.getEditorActions(project_id, path);
  const store = redux.getEditorStore(project_id, path);
  return { syncdb, client, actions, store, redux };
}
