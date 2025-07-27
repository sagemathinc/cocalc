import { SyncDB } from "@cocalc/sync/editor/db/sync";
import { SYNCDB_OPTIONS } from "@cocalc/jupyter/redux/sync";
import { type Filesystem } from "@cocalc/conat/files/fs";
import { getLogger } from "@cocalc/backend/logger";
import { initJupyterRedux, removeJupyterRedux } from "@cocalc/jupyter/kernel";
import { original_path } from "@cocalc/util/misc";
import { once } from "@cocalc/util/async-utils";
import { OutputHandler } from "@cocalc/jupyter/execute/output-handler";
import { throttle } from "lodash";
import { type RunOptions } from "@cocalc/conat/project/jupyter/run-code";

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

// Returns async iterator over outputs
export async function jupyterRun({ path, cells }: RunOptions) {
  logger.debug("jupyterRun", { path }); // , cells });

  const session = sessions[path];
  if (session == null) {
    throw Error(`${path} not running`);
  }
  const { syncdb, actions } = session;
  if (syncdb.isClosed()) {
    // shouldn't be possible
    throw Error("syncdb is closed");
  }
  if (!syncdb.isReady()) {
    logger.debug("jupyterRun: waiting until ready");
    await once(syncdb, "ready");
  }
  logger.debug("jupyterRun: running");
  async function* run() {
    for (const cell of cells) {
      const output = actions.jupyter_kernel.execute_code({
        halt_on_error: true,
        code: cell.input,
      });
      for await (const mesg of output.iter()) {
        yield mesg;
      }
      if (actions.jupyter_kernel.failedError) {
        // kernel failed during call
        throw Error(actions.jupyter_kernel.failedError);
      }
    }
  }
  return await run();
}

const BACKEND_OUTPUT_FPS = 8;
export function outputHandler({ path, cells }: RunOptions) {
  if (sessions[path] == null) {
    throw Error(`session '${path}' not available`);
  }
  const { actions } = sessions[path];
  // todo: need to handle multiple cells
  const cell = { type: "cell" as "cell", ...cells[0] };
  const handler = new OutputHandler({ cell });
  const f = throttle(
    () => {
      logger.debug("outputHandler", path, cell);
      actions._set(cell, true);
    },
    1000 / BACKEND_OUTPUT_FPS,
    {
      leading: false,
      trailing: true,
    },
  );
  handler.on("change", f);
  return handler;
}
