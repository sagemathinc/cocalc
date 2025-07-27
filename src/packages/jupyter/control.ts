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
export async function jupyterRun({ path, cells, noHalt }: RunOptions) {
  logger.debug("jupyterRun", { path, noHalt });

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
        halt_on_error: !noHalt,
        code: cell.input,
      });
      for await (const mesg of output.iter()) {
        mesg.id = cell.id;
        yield mesg;
        if (!noHalt && mesg.msg_type == "error") {
          // done running code because there was an error.
          return;
        }
      }
      if (actions.jupyter_kernel.failedError) {
        // kernel failed during call
        throw Error(actions.jupyter_kernel.failedError);
      }
    }
  }
  return await run();
}

class MulticellOutputHandler {
  private id: string | null = null;
  private handler: OutputHandler | null = null;

  constructor(
    private cells: RunOptions["cells"],
    private actions,
  ) {}

  process = (mesg) => {
    if (mesg.id !== this.id || this.handler == null) {
      this.id = mesg.id;
      let cell = this.cells[mesg.id] ?? { id: mesg.id };
      this.handler?.done();
      this.handler = new OutputHandler({ cell });
      const f = throttle(
        () => this.actions._set({ ...cell, type: "cell" }, true),
        1000 / BACKEND_OUTPUT_FPS,
        {
          leading: true,
          trailing: true,
        },
      );
      this.handler.on("change", f);
    }
    this.handler!.process(mesg);
  };

  done = () => {
    this.handler?.done();
    this.handler = null;
  };
}

const BACKEND_OUTPUT_FPS = 8;
export function outputHandler({ path, cells }: RunOptions) {
  if (sessions[path] == null) {
    throw Error(`session '${path}' not available`);
  }
  const { actions } = sessions[path];
  return new MulticellOutputHandler(cells, actions);
}
