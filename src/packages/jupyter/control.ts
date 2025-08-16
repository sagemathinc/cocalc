import { SyncDB } from "@cocalc/sync/editor/db/sync";
import { SYNCDB_OPTIONS } from "@cocalc/jupyter/redux/sync";
import { type Filesystem } from "@cocalc/conat/files/fs";
import { initJupyterRedux, removeJupyterRedux } from "@cocalc/jupyter/kernel";
import { syncdbPath, ipynbPath } from "@cocalc/util/jupyter/names";
import { once } from "@cocalc/util/async-utils";
import { OutputHandler } from "@cocalc/jupyter/execute/output-handler";
import { throttle } from "lodash";
import { type RunOptions } from "@cocalc/conat/project/jupyter/run-code";
import { type JupyterActions } from "@cocalc/jupyter/redux/project-actions";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("jupyter:control");

const jupyterActions: { [ipynbPath: string]: JupyterActions } = {};

export function isRunning(path): boolean {
  return jupyterActions[ipynbPath(path)] != null;
}

let project_id: string = "";

export function start({
  path,
  project_id: project_id0,
  client,
  fs,
}: {
  path: string;
  client;
  project_id: string;
  fs: Filesystem;
}) {
  if (isRunning(path)) {
    return;
  }
  project_id = project_id0;
  logger.debug("start: ", path, " - starting it");
  const syncdb = new SyncDB({
    ...SYNCDB_OPTIONS,
    project_id,
    path: syncdbPath(path),
    client,
    fs,
  });
  syncdb.on("error", (err) => {
    // [ ] TODO: some way to convey this to clients (?)
    logger.debug(`syncdb error -- ${err}`, path);
    stop({ path });
  });
  syncdb.once("closed", () => {
    stop({ path });
  });
  const { actions } = initJupyterRedux(syncdb, client);
  jupyterActions[ipynbPath(path)] = actions;
}

export function stop({ path }: { path: string }) {
  const actions = jupyterActions[ipynbPath(path)];
  if (actions == null) {
    logger.debug("stop: ", path, " - not running");
  } else {
    delete jupyterActions[ipynbPath(path)];
    const { syncdb } = actions;
    logger.debug("stop: ", path, " - stopping it");
    syncdb.close();
    removeJupyterRedux(ipynbPath(path), project_id);
  }
}

// Returns async iterator over outputs
export async function run({ path, cells, noHalt, socket }: RunOptions) {
  logger.debug("run:", { path, noHalt });

  const actions = jupyterActions[ipynbPath(path)];
  if (actions == null) {
    throw Error(`${ipynbPath(path)} not running`);
  }
  if (actions.syncdb.isClosed()) {
    // shouldn't be possible
    throw Error("syncdb is closed");
  }
  if (!actions.syncdb.isReady()) {
    logger.debug("jupyterRun: waiting until ready");
    await once(actions.syncdb, "ready");
  }
  logger.debug("jupyterRun: running");
  async function* runCells() {
    for (const cell of cells) {
      actions.ensureKernelIsReady();
      const kernel = actions.jupyter_kernel!;
      const output = kernel.execute_code({
        halt_on_error: !noHalt,
        code: cell.input,
        stdin: async (prompt: string, password: boolean) => {
          try {
            const resp = await socket.request(
              {
                type: "stdin",
                id: cell.id,
                prompt,
                password,
              },
              // timeout
              { timeout: 1000 * 60 * 15 },
            );
            return resp.data;
          } catch (err) {
            return `${err}`;
          }
        },
      });
      for await (const mesg0 of output.iter()) {
        const content = mesg0?.content;
        if (content != null) {
          // this mutates content, removing large base64/svg, etc. images, pdf's, etc.
          await actions.processOutput(content);
        }
        const mesg = { ...mesg0, id: cell.id };
        yield mesg;
        if (!noHalt && mesg.msg_type == "error") {
          // done running code because there was an error.
          return;
        }
      }
      if (kernel.failedError) {
        // kernel failed during call
        throw Error(kernel.failedError);
      }
    }
  }
  return await runCells();
}

const BACKEND_OUTPUT_FPS = 8;

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
        () => {
          const { id, state, output, start, end, exec_count } = cell;
          this.actions._set(
            { type: "cell", id, state, output, start, end, exec_count },
            true,
          );
        },
        1000 / BACKEND_OUTPUT_FPS,
        {
          leading: true,
          trailing: true,
        },
      );
      this.handler.on("change", f);
      this.handler.on("process", this.actions.processOutput);
    }
    this.handler!.process(mesg);
  };

  done = () => {
    this.handler?.done();
    this.handler = null;
  };
}

export function outputHandler({ path, cells }: RunOptions) {
  if (jupyterActions[ipynbPath(path)] == null) {
    throw Error(`session '${ipynbPath(path)}' not available`);
  }
  const actions = jupyterActions[ipynbPath(path)];
  return new MulticellOutputHandler(cells, actions);
}

function getKernel(path: string) {
  const actions = jupyterActions[ipynbPath(path)];
  if (actions == null) {
    throw Error(`${ipynbPath(path)} not running`);
  }
  actions.ensureKernelIsReady();
  return actions.jupyter_kernel!;
}

export async function introspect(opts: {
  path: string;
  code: string;
  cursor_pos: number;
  detail_level: 0 | 1;
}) {
  const kernel = getKernel(opts.path);
  return await kernel.introspect(opts);
}

export async function complete(opts: {
  path: string;
  code: string;
  cursor_pos: number;
}) {
  const kernel = getKernel(opts.path);
  return await kernel.complete(opts);
}

export async function getConnectionFile(opts: { path }) {
  const kernel = getKernel(opts.path);
  await kernel.ensure_running();
  const c = kernel.getConnectionFile();
  if (c == null) {
    throw Error("unable to start kernel");
  }
  return c;
}

export async function signal(opts: { path: string; signal: string }) {
  const kernel = getKernel(opts.path);
  await kernel.signal(opts.signal);
}
