import { SyncDB } from "@cocalc/sync/editor/db/sync";
import { SYNCDB_OPTIONS } from "@cocalc/jupyter/redux/sync";
import { type Filesystem } from "@cocalc/conat/files/fs";
import { getLogger } from "@cocalc/backend/logger";
import { initJupyterRedux, removeJupyterRedux } from "@cocalc/jupyter/kernel";
import { original_path } from "@cocalc/util/misc";
import { once } from "@cocalc/util/async-utils";

const logger = getLogger("jupyter:control");

const sessions: { [path: string]: { syncdb: SyncDB; actions; store } } = {};
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
  // [ ] TODO: some way to convey this to clients (?)
  syncdb.on("error", (err) => {
    logger.debug(`syncdb error -- ${err}`, path);
    jupyterStop({ path });
  });
  syncdb.on("close", () => {
    jupyterStop({ path });
  });
  const { actions, store } = initJupyterRedux(syncdb, client);
  sessions[path] = { syncdb, actions, store };
}

// run the cells with given id...
export async function jupyterRun({
  path,
  ids,
}: {
  path: string;
  ids: string[];
}) {
  logger.debug("jupyterRun", { path, ids });
  const session = sessions[path];
  if (session == null) {
    throw Error(`${path} not running`);
  }
  const { syncdb, actions, store } = session;
  if (syncdb.isClosed()) {
    // shouldn't be possible
    throw Error("syncdb is closed");
  }
  if (!syncdb.isReady()) {
    logger.debug("jupyterRun: waiting until ready");
    await once(syncdb, "ready");
  }
  //   for (let i = 0; i < ids.length; i++) {
  //     actions.run_cell(ids[i], false);
  //   }
  logger.debug("jupyterRun: running");
  if (ids.length == 1) {
    const code = store.get("cells").get(ids[0])?.get("input")?.trim();
    if (code) {
      const result: any[] = [];
      for (const x of await actions.jupyter_kernel.execute_code_now({ code })) {
        if (x.msg_type == "execute_result") {
          result.push(x.content);
        }
      }
      return result;
    }
  }
}

export function jupyterStop({ path }: { path: string }) {
  const session = sessions[path];
  if (session == null) {
    logger.debug("jupyterStop: ", path, " - not running");
  } else {
    const { syncdb } = session;
    logger.debug("jupyterStop: ", path, " - stopping it");
    syncdb.close();
    delete sessions[path];
    const path_ipynb = original_path(path);
    removeJupyterRedux(path_ipynb, project_id);
  }
}
