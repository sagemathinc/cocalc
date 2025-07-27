import { SyncDB } from "@cocalc/sync/editor/db/sync";
import { SYNCDB_OPTIONS } from "@cocalc/jupyter/redux/sync";
import { type Filesystem } from "@cocalc/conat/files/fs";
import { getLogger } from "@cocalc/backend/logger";
import { initJupyterRedux, removeJupyterRedux } from "@cocalc/jupyter/kernel";
import { original_path } from "@cocalc/util/misc";

const logger = getLogger("jupyter:control");

const sessions: { [path: string]: SyncDB } = {};
let project_id: string = "";

export function jupyterStart({
  path,
  client,
  project_id: project_id0,
  fs,
}: {
  path: string;
  client;
  project_id: string;
  fs: Filesystem;
}) {
  project_id = project_id0;
  if (sessions[path] != null) {
    logger.debug("jupyterStart: ", path, " - already running");
    return;
  }
  logger.debug("jupyterStart: ", path, " - starting it");
  const syncdb = new SyncDB({
    ...SYNCDB_OPTIONS,
    project_id,
    path,
    client,
    fs,
  });
  sessions[path] = syncdb;
  // [ ] TODO: some way to convey this to clients (?)
  syncdb.on("error", (err) => {
    logger.debug(`syncdb error -- ${err}`, path);
    jupyterStop({ path });
  });
  syncdb.on("close", () => {
    jupyterStop({ path });
  });
  initJupyterRedux(syncdb, client);
}

export function jupyterStop({ path }: { path: string }) {
  const syncdb = sessions[path];
  if (syncdb == null) {
    logger.debug("jupyterStop: ", path, " - not running");
  } else {
    logger.debug("jupyterStop: ", path, " - stopping it");
    syncdb.close();
    delete sessions[path];
    const path_ipynb = original_path(path);
    removeJupyterRedux(path_ipynb, project_id);
  }
}
