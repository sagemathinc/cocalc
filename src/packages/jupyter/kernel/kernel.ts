/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Jupyter Backend

For interactive testing:

$ node

> j = require('./dist/kernel'); k = j.kernel({name:'python3', path:'x.ipynb'});
> console.log(JSON.stringify(await k.execute_code_now({code:'2+3'}),0,2))

*/

// POOL VERSION - faster to restart but possible subtle issues
const USE_KERNEL_POOL = true;

// const DEBUG = true; // only for extreme debugging.
const DEBUG = false; // normal mode
if (DEBUG) {
  console.log("Enabling low level Jupyter kernel debugging.");
}

// NOTE: we choose to use node-cleanup instead of the much more
// popular exit-hook, since node-cleanup actually works for us.
// https://github.com/jtlapp/node-cleanup/issues/16
// Also exit-hook is hard to import from commonjs.
import nodeCleanup from "node-cleanup";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { callback } from "awaiting";
import type { MessageType } from "@cocalc/jupyter/zmq/types";
import { jupyterSockets, type JupyterSockets } from "@cocalc/jupyter/zmq";
import { EventEmitter } from "node:events";
import { unlink } from "@cocalc/backend/misc/async-utils-node";
import { remove_redundant_reps } from "@cocalc/jupyter/ipynb/import-from-ipynb";
import { JupyterActions } from "@cocalc/jupyter/redux/project-actions";
import {
  type BlobStoreInterface,
  CodeExecutionEmitterInterface,
  ExecOpts,
  JupyterKernelInterface,
  KernelInfo,
} from "@cocalc/jupyter/types/project-interface";
import { JupyterStore } from "@cocalc/jupyter/redux/store";
import { JUPYTER_MIMETYPES } from "@cocalc/jupyter/util/misc";
import type { SyncDB } from "@cocalc/sync/editor/db/sync";
import { retry_until_success, until } from "@cocalc/util/async-utils";
import createChdirCommand from "@cocalc/util/jupyter-api/chdir-commands";
import { key_value_store } from "@cocalc/util/key-value-store";
import {
  copy,
  deep_copy,
  is_array,
  len,
  merge,
  original_path,
  path_split,
  uuid,
  uint8ArrayToBase64,
} from "@cocalc/util/misc";
import { CodeExecutionEmitter } from "@cocalc/jupyter/execute/execute-code";
import {
  getLanguage,
  get_kernel_data_by_name,
} from "@cocalc/jupyter/kernel/kernel-data";

import launchJupyterKernel, {
  LaunchJupyterOpts,
  SpawnedKernel,
  killKernel,
} from "@cocalc/jupyter/pool/pool";
// non-pool version
import launchJupyterKernelNoPool from "@cocalc/jupyter/kernel/launch-kernel";
import { kernels } from "./kernels";
import { getAbsolutePathFromHome } from "@cocalc/jupyter/util/fs";
import type { KernelParams } from "@cocalc/jupyter/types/kernel";
import { redux_name } from "@cocalc/util/redux/name";
import { redux } from "@cocalc/jupyter/redux/app";
import { VERSION } from "@cocalc/jupyter/kernel/version";
import type { NbconvertParams } from "@cocalc/util/jupyter/types";
import type { Client } from "@cocalc/sync/client/types";
import { getLogger } from "@cocalc/backend/logger";
import { base64ToBuffer } from "@cocalc/util/base64";
import { sha1 as misc_node_sha1 } from "@cocalc/backend/misc_node";
import { join } from "path";
import { readFile } from "fs/promises";

const MAX_KERNEL_SPAWN_TIME = 120 * 1000;

type State = "failed" | "off" | "spawning" | "starting" | "running" | "closed";

const logger = getLogger("jupyter:kernel");

// We make it so nbconvert functionality can be dynamically enabled
// by calling this at runtime.  The reason is because some users of
// this code (e.g., remote kernels) don't need to provide nbconvert
// functionality, and our implementation has some heavy dependencies,
// e.g., on a big chunk of the react frontend.
let nbconvert: (opts: NbconvertParams) => Promise<void> = async () => {
  throw Error("nbconvert is not enabled");
};
export function initNbconvert(f) {
  nbconvert = f;
}

/*
We set a few extra user-specific options for the environment in which
Sage-based Jupyter kernels run; these are more multi-user friendly.
*/
const SAGE_JUPYTER_ENV = merge(copy(process.env), {
  PYTHONUSERBASE: `${process.env.HOME}/.local`,
  PYTHON_EGG_CACHE: `${process.env.HOME}/.sage/.python-eggs`,
  R_MAKEVARS_USER: `${process.env.HOME}/.sage/R/Makevars.user`,
});

// Initialize the actions and store for working with a specific
// Jupyter notebook.  The syncdb is the syncdoc associated to
// the ipynb file, and this function creates the corresponding
// actions and store, which make it possible to work with this
// notebook.
export async function initJupyterRedux(syncdb: SyncDB, client: Client) {
  const project_id = syncdb.project_id;
  if (project_id == null) {
    throw Error("project_id must be defined");
  }
  if (syncdb.get_state() == "closed") {
    throw Error("syncdb must not be closed");
  }

  // This path is the file we will watch for changes and save to, which is in the original
  // official ipynb format:
  const path = original_path(syncdb.get_path());
  logger.debug("initJupyterRedux", path);

  const name = redux_name(project_id, path);
  if (redux.getStore(name) != null && redux.getActions(name) != null) {
    logger.debug(
      "initJupyterRedux",
      path,
      " -- existing actions, so removing them",
    );
    // The redux info for this notebook already exists, so don't
    // try to make it again without first deleting the existing one.
    // Having two at once basically results in things feeling hung.
    // This should never happen, but we ensure it
    // See https://github.com/sagemathinc/cocalc/issues/4331
    await removeJupyterRedux(path, project_id);
  }
  const store = redux.createStore(name, JupyterStore);
  const actions = redux.createActions(name, JupyterActions);

  actions._init(project_id, path, syncdb, store, client);

  syncdb.once("error", (err) =>
    logger.error("initJupyterRedux", path, "syncdb ERROR", err),
  );
  syncdb.once("ready", () =>
    logger.debug("initJupyterRedux", path, "syncdb ready"),
  );
}

export async function getJupyterRedux(syncdb: SyncDB) {
  const project_id = syncdb.project_id;
  const path = original_path(syncdb.get_path());
  const name = redux_name(project_id, path);
  return { actions: redux.getActions(name), store: redux.getStore(name) };
}

// Remove the store/actions for a given Jupyter notebook,
// and also close the kernel if it is running.
export async function removeJupyterRedux(
  path: string,
  project_id: string,
): Promise<void> {
  logger.debug("removeJupyterRedux", path);
  // if there is a kernel, close it
  try {
    await kernels.get(path)?.close();
  } catch (_err) {
    // ignore
  }
  const name = redux_name(project_id, path);
  const actions = redux.getActions(name);
  if (actions != null) {
    try {
      await actions.close();
    } catch (err) {
      logger.debug(
        "removeJupyterRedux",
        path,
        " WARNING -- issue closing actions",
        err,
      );
    }
  }
  redux.removeStore(name);
  redux.removeActions(name);
}

export function kernel(opts: KernelParams): JupyterKernel {
  return new JupyterKernel(opts.name, opts.path, opts.actions, opts.ulimit);
}

/*
Jupyter Kernel interface.

The kernel does *NOT* start up until either spawn is explicitly called, or
code execution is explicitly requested.  This makes it possible to
call process_output without spawning an actual kernel.
*/

// Ensure that the kernels all get killed when the process exits.
nodeCleanup(() => {
  for (const kernelPath in kernels.kernels) {
    // We do NOT await the close since that's not really
    // supported or possible in general.
    const { _kernel } = kernels.kernels[kernelPath];
    if (_kernel) {
      killKernel(_kernel);
    }
  }
});

// NOTE: keep JupyterKernel implementation private -- use the kernel function
// above, and the interface defined in types.
export class JupyterKernel
  extends EventEmitter
  implements JupyterKernelInterface
{
  // name -- if undefined that means "no actual Jupyter kernel" (i.e., this JupyterKernel exists
  // here, but there is no actual separate real Jupyter kernel process and one won't be created).
  // Everything should work, except you can't *spawn* such a kernel.
  public name: string | undefined;

  // this is a key:value store used mainly for stdin support right now. NOTHING TO DO WITH REDUX!
  public store: any;

  public readonly identity: string = uuid();

  private stderr: string = "";
  private ulimit?: string;
  private _path: string;
  private _actions?: JupyterActions;
  private _state: State;
  private _directory: string;
  private _filename: string;
  public _kernel?: SpawnedKernel;
  private _kernel_info?: KernelInfo;
  public _execute_code_queue: CodeExecutionEmitter[] = [];
  public sockets?: JupyterSockets;
  private has_ensured_running: boolean = false;
  private failedError: string = "";

  constructor(
    name: string | undefined,
    _path: string,
    _actions: JupyterActions | undefined,
    ulimit: string | undefined,
  ) {
    super();

    this.ulimit = ulimit;

    this.name = name;
    this._path = _path;
    this._actions = _actions;

    this.store = key_value_store();
    const { head, tail } = path_split(getAbsolutePathFromHome(this._path));
    this._directory = head;
    this._filename = tail;
    this.setState("off");
    this._execute_code_queue = [];
    if (kernels.get(this._path) !== undefined) {
      // This happens when we change the kernel for a given file, e.g.,
      // from python2 to python3.
      // Obviously, it is important to clean up after the old kernel.
      kernels.get(this._path)?.close();
    }
    kernels.set(this._path, this);
    this.setMaxListeners(100);
    const dbg = this.dbg("constructor");
    dbg("done");
  }

  get_path = () => {
    return this._path;
  };

  // no-op if calling it doesn't change the state.
  private setState = (state: State): void => {
    // state = 'off' --> 'spawning' --> 'starting' --> 'running' --> 'closed'
    //             'failed'
    if (this._state == state) return;
    this._state = state;
    this.emit("state", this._state);
    this.emit(this._state); // we *SHOULD* use this everywhere, not above.
  };

  private setFailed = (error: string): void => {
    this.failedError = error;
    this.emit("kernel_error", error);
    this.setState("failed");
  };

  get_state = (): string => {
    return this._state;
  };

  private spawnedAlready = false;
  spawn = async (spawn_opts?: {
    env?: { [key: string]: string };
  }): Promise<void> => {
    if (this._state === "closed") {
      // game over!
      throw Error("closed -- kernel spawn");
    }
    if (!this.name) {
      // spawning not allowed.
      throw Error("cannot spawn since no kernel is set");
    }
    if (["running", "starting"].includes(this._state)) {
      // Already spawned, so no need to do it again.
      return;
    }

    if (this.spawnedAlready) {
      return;
    }
    this.spawnedAlready = true;

    this.setState("spawning");
    const dbg = this.dbg("spawn");
    dbg("spawning kernel...");

    // ****
    // CRITICAL: anything added to opts better not be specific
    // to the kernel path or it will completely break using a
    // pool, which makes things massively slower.
    // ****

    const opts: LaunchJupyterOpts = {
      env: spawn_opts?.env ?? {},
      ulimit: this.ulimit,
    };

    try {
      const kernelData = await get_kernel_data_by_name(this.name);
      // This matches "sage", "sage-x.y", and Sage Python3 ("sage -python -m ipykernel")
      if (kernelData.argv[0].startsWith("sage")) {
        dbg("setting special environment for Sage kernels");
        opts.env = merge(opts.env, SAGE_JUPYTER_ENV);
      }
    } catch (err) {
      dbg(`No kernelData available for ${this.name}`);
    }

    // Make cocalc default to the colab renderer for cocalc-jupyter, since
    // this one happens to work best for us, and they don't have a custom
    // one for us.  See https://plot.ly/python/renderers/ and
    // https://github.com/sagemathinc/cocalc/issues/4259
    opts.env.PLOTLY_RENDERER = "colab";
    opts.env.COCALC_JUPYTER_KERNELNAME = this.name;

    // !!! WARNING: do NOT add anything new here that depends on that path!!!!
    // Otherwise the pool will switch to falling back to not being used, and
    // cocalc would then be massively slower.
    // Non-uniform customization.
    // launchJupyterKernel is explicitly smart enough to deal with opts.cwd
    if (this._directory) {
      opts.cwd = this._directory;
    }
    // launchJupyterKernel is explicitly smart enough to deal with opts.env.COCALC_JUPYTER_FILENAME
    opts.env.COCALC_JUPYTER_FILENAME = this._path;
    // and launchJupyterKernel is NOT smart enough to deal with anything else!

    try {
      if (USE_KERNEL_POOL) {
        dbg("launching Jupyter kernel, possibly from pool");
        this._kernel = await launchJupyterKernel(this.name, opts);
      } else {
        dbg("launching Jupyter kernel, NOT using pool");
        this._kernel = await launchJupyterKernelNoPool(this.name, opts);
      }
      dbg("finishing kernel setup");
      await this.finishSpawningKernel();
    } catch (err) {
      dbg(`ERROR spawning kernel - ${err}, ${err.stack}`);
      // @ts-ignore
      if (this._state == "closed") {
        throw Error("closed");
      }
      // console.trace(err);
      this.setFailed(
        `**Unable to Spawn Jupyter Kernel:**\n\n${err} \n\nTry this in a terminal to help debug this (or contact support): \`jupyter console --kernel=${this.name}\`\n\nOnce you fix the problem, explicitly restart this kernel to test here.`,
      );
    }
  };

  get_spawned_kernel = () => {
    return this._kernel;
  };

  get_connection_file = (): string | undefined => {
    return this._kernel?.connectionFile;
  };

  private finishSpawningKernel = async () => {
    const dbg = this.dbg("finishSpawningKernel");
    dbg("now finishing spawn of kernel...");

    if (DEBUG) {
      this.low_level_dbg();
    }

    if (!this._kernel) {
      throw Error("_kernel must be defined");
    }
    this._kernel.spawn.on("error", (err) => {
      const error = `${err}\n${this.stderr}`;
      dbg("kernel error", error);
      this.setFailed(error);
    });

    // Track stderr from the subprocess itself (the kernel).
    // This is useful for debugging broken kernels, etc., and is especially
    // useful since it exists even if the kernel sends nothing over any
    // zmq sockets (e.g., due to being very broken).
    this.stderr = "";
    this._kernel.spawn.stderr.on("data", (data) => {
      const s = data.toString();
      this.stderr += s;
      if (this.stderr.length > 5000) {
        // truncate if gets long for some reason -- only the end will
        // be useful...
        this.stderr = this.stderr.slice(this.stderr.length - 4000);
      }
    });

    this._kernel.spawn.stdout.on("data", (_data) => {
      // NOTE: it is very important to read stdout (and stderr above)
      // even if we **totally ignore** the data. Otherwise, exec
      // might overflow
      // https://github.com/sagemathinc/cocalc/issues/5065
    });

    dbg("create main channel...", this._kernel.config);

    // This horrible code is because jupyterSockets will just "hang
    // forever" if the kernel doesn't get spawned for some reason.
    // (TODO: now that I completely rewrote jupytersockets, we could
    // just put a timeout there or better checks? not sure.)
    // Thus we do some tests, waiting for at least 2 seconds for there
    // to be a pid.  This is complicated and ugly, and I'm sorry about that,
    // but sometimes that's life.
    try {
      await until(
        () => {
          if (this._state != "spawning") {
            // gave up
            return true;
          }
          if (this.pid()) {
            // there's a process :-)
            return true;
          }
          return false;
        },
        { start: 100, max: 100, timeout: 3000 },
      );
    } catch (err) {
      // timed out
      this.setFailed(`Failed to start kernel process. ${err}`);
      return;
    }
    if (this._state != "spawning") {
      // got canceled
      return;
    }
    const pid = this.pid();
    if (!pid) {
      throw Error("bug");
    }
    let success = false;
    let gaveUp = false;
    setTimeout(() => {
      if (!success) {
        gaveUp = true;
        // it's been 30s and the channels didn't work.  Let's give up.
        // probably the kernel process just failed.
        this.setFailed("Failed to start kernel process -- timeout");
        // We can't yet "cancel" createMainChannel itself -- that will require
        // rewriting that dependency.
        //      https://github.com/sagemathinc/cocalc/issues/7040
        // I did rewrite that -- so let's revisit this!
      }
    }, MAX_KERNEL_SPAWN_TIME);
    const sockets = await jupyterSockets(this._kernel.config, this.identity);
    if (gaveUp) {
      process.kill(-pid, 9);
      return;
    }
    this.sockets = sockets;
    success = true;
    dbg("created main channel");
    sockets.on("shell", (mesg) => this.emit("shell", mesg));
    sockets.on("stdin", (mesg) => this.emit("stdin", mesg));
    sockets.on("iopub", (mesg) => {
      this.setState("running");
      if (mesg.content != null && mesg.content.execution_state != null) {
        this.emit("execution_state", mesg.content.execution_state);
      }

      if (mesg.content?.comm_id != null) {
        // A comm message, which gets handled directly.
        this.process_comm_message_from_kernel(mesg);
        return;
      }

      if (this._actions?.capture_output_message(mesg)) {
        // captured an output message -- do not process further
        return;
      }

      this.emit("iopub", mesg);
    });

    this._kernel.spawn.once("exit", (exit_code, signal) => {
      if (this._state === "closed") {
        return;
      }
      this.dbg("kernel_exit")(
        `spawned kernel terminated with exit code ${exit_code} (signal=${signal}); stderr=${this.stderr}`,
      );
      const stderr = this.stderr ? `\n...\n${this.stderr}` : "";
      if (signal != null) {
        this.setFailed(`Kernel last terminated by signal ${signal}.${stderr}`);
      } else if (exit_code != null) {
        this.setFailed(`Kernel last exited with code ${exit_code}.${stderr}`);
      }
      this.close();
    });

    if (this._state == "spawning") {
      // so we can start sending code execution to the kernel, etc.
      this.setState("starting");
    }
  };

  pid = (): number | undefined => {
    return this._kernel?.spawn?.pid;
  };

  // Signal should be a string like "SIGINT", "SIGKILL".
  // See https://nodejs.org/api/process.html#process_process_kill_pid_signal
  signal = (signal: string): void => {
    const dbg = this.dbg("signal");
    const pid = this.pid();
    dbg(`pid=${pid}, signal=${signal}`);
    if (!pid) {
      return;
    }
    try {
      process.kill(-pid, signal); // negative to signal the process group
      this.clear_execute_code_queue();
    } catch (err) {
      dbg(`error: ${err}`);
    }
  };

  close = (): void => {
    this.dbg("close")();
    if (this._state === "closed") {
      return;
    }
    this.signal("SIGKILL");
    if (this.sockets != null) {
      this.sockets.close();
      delete this.sockets;
    }
    this.setState("closed");
    if (this.store != null) {
      this.store.close();
      delete this.store;
    }
    const kernel = kernels.get(this._path);
    if (kernel != null && kernel.identity === this.identity) {
      kernels.delete(this._path);
    }
    this.removeAllListeners();
    if (this._kernel != null) {
      killKernel(this._kernel);
      delete this._kernel;
      delete this.sockets;
    }
    if (this._execute_code_queue != null) {
      for (const runningCode of this._execute_code_queue) {
        runningCode.close();
      }
      this._execute_code_queue = [];
    }
  };

  // public, since we do use it from some other places...
  dbg = (f: string): Function => {
    return (...args) => {
      //console.log(
      logger.debug(
        `jupyter.Kernel('${this.name ?? "no kernel"}',path='${
          this._path
        }').${f}`,
        ...args,
      );
    };
  };

  low_level_dbg = (): void => {
    const dbg = (...args) => logger.silly("low_level_debug", ...args);
    dbg("Enabling");
    if (this._kernel) {
      this._kernel.spawn.all?.on("data", (data) =>
        dbg("STDIO", data.toString()),
      );
    }
  };

  ensure_running = reuseInFlight(async (): Promise<void> => {
    const dbg = this.dbg("ensure_running");
    dbg(this._state);
    if (this._state == "closed") {
      throw Error("closed so not possible to ensure running");
    }
    if (this._state == "running") {
      return;
    }
    dbg("spawning");
    await this.spawn();
    if (this.get_state() != "starting" && this.get_state() != "running") {
      return;
    }
    if (this._kernel?.initCode != null) {
      for (const code of this._kernel?.initCode ?? []) {
        dbg("initCode ", code);
        this.execute_code({ code }, true);
      }
    }
    if (!this.has_ensured_running) {
      this.has_ensured_running = true;
    }
  });

  execute_code = (
    opts: ExecOpts,
    skipToFront = false,
  ): CodeExecutionEmitterInterface => {
    if (opts.halt_on_error === undefined) {
      // if not specified, default to true.
      opts.halt_on_error = true;
    }
    if (this._state === "closed") {
      throw Error("closed -- kernel -- execute_code");
    }
    const code = new CodeExecutionEmitter(this, opts);
    if (skipToFront) {
      this._execute_code_queue.unshift(code);
    } else {
      this._execute_code_queue.push(code);
    }
    if (this._execute_code_queue.length == 1) {
      // start it going!
      this._process_execute_code_queue();
    }
    return code;
  };

  cancel_execute = (id: string): void => {
    if (this._state === "closed") {
      return;
    }
    const dbg = this.dbg(`cancel_execute(id='${id}')`);
    if (
      this._execute_code_queue == null ||
      this._execute_code_queue.length === 0
    ) {
      dbg("nothing to do");
      return;
    }
    if (this._execute_code_queue.length > 1) {
      dbg(
        "mutate this._execute_code_queue removing everything with the given id",
      );
      for (let i = this._execute_code_queue.length - 1; i--; i >= 1) {
        const code = this._execute_code_queue[i];
        if (code.id === id) {
          dbg(`removing entry ${i} from queue`);
          this._execute_code_queue.splice(i, 1);
          code.cancel();
        }
      }
    }
    // if the currently running computation involves this id, send an
    // interrupt signal (that's the best we can do)
    if (this._execute_code_queue[0].id === id) {
      dbg("interrupting running computation");
      this.signal("SIGINT");
    }
  };

  _process_execute_code_queue = async (): Promise<void> => {
    const dbg = this.dbg("_process_execute_code_queue");
    dbg(`state='${this._state}'`);
    if (this._state === "closed") {
      dbg("closed");
      return;
    }
    if (this._execute_code_queue == null) {
      dbg("no queue");
      return;
    }
    const n = this._execute_code_queue.length;
    if (n === 0) {
      dbg("queue is empty");
      return;
    }
    dbg(
      `queue has ${n} items; ensure kernel running`,
      this._execute_code_queue,
    );
    try {
      await this.ensure_running();
      await this._execute_code_queue[0].go();
    } catch (err) {
      dbg(`WARNING: error running kernel -- ${err}`);
      for (const code of this._execute_code_queue) {
        code.throw_error(err);
      }
      this._execute_code_queue = [];
    }
  };

  clear_execute_code_queue = (): void => {
    const dbg = this.dbg("_clear_execute_code_queue");
    // ensure no future queued up evaluation occurs (currently running
    // one will complete and new executions could happen)
    if (this._state === "closed") {
      dbg("no op since state is closed");
      return;
    }
    if (this._execute_code_queue == null) {
      dbg("nothing to do since queue is null");
      return;
    }
    dbg(`clearing queue of size ${this._execute_code_queue.length}`);
    const mesg = { done: true };
    for (const code_execution_emitter of this._execute_code_queue.slice(1)) {
      code_execution_emitter.emit_output(mesg);
      code_execution_emitter.close();
    }
    this._execute_code_queue = [];
  };

  // This is like execute_code, but async and returns all the results.
  // This is used for unit testing and interactive work at
  // the terminal and nbgrader and the stateless api.
  execute_code_now = async (opts: ExecOpts): Promise<object[]> => {
    this.dbg("execute_code_now")();
    if (this._state == "closed") {
      throw Error("closed");
    }
    if (this.failedError) {
      throw Error(this.failedError);
    }
    const output = this.execute_code({ halt_on_error: true, ...opts });
    const v: object[] = [];
    for await (const mesg of output.iter()) {
      v.push(mesg);
    }
    if (this.failedError) {
      // kernel failed during call
      throw Error(this.failedError);
    }
    return v;
  };

  private saveBlob = (data: string, type: string) => {
    const blobs = this._actions?.blobs;
    if (blobs == null) {
      throw Error("blob store not available");
    }
    const buf: Buffer = !type.startsWith("text/")
      ? Buffer.from(data, "base64")
      : Buffer.from(data);

    const sha1: string = misc_node_sha1(buf);
    blobs.set(sha1, buf);
    return sha1;
  };

  process_output = (content: any): void => {
    if (this._state === "closed") {
      return;
    }
    const dbg = this.dbg("process_output");
    if (content.data == null) {
      // No data -- https://github.com/sagemathinc/cocalc/issues/6665
      // NO do not do this sort of thing.  This is exactly the sort of situation where
      // content could be very large, and JSON.stringify could use huge amounts of memory.
      // If you need to see this for debugging, uncomment it.
      // dbg(trunc(JSON.stringify(content), 300));
      // todo: FOR now -- later may remove large stdout, stderr, etc...
      // dbg("no data, so nothing to do");
      return;
    }

    remove_redundant_reps(content.data);

    const saveBlob = (data, type) => {
      try {
        return this.saveBlob(data, type);
      } catch (err) {
        dbg(`WARNING: Jupyter blob store not working -- ${err}`);
        // i think it'll just send the large data on in the usual way instead
        // via the output, instead of using the blob store.  It's probably just
        // less efficient.
      }
    };

    let type: string;
    for (type of JUPYTER_MIMETYPES) {
      if (content.data[type] == null) {
        continue;
      }
      if (
        type.split("/")[0] === "image" ||
        type === "application/pdf" ||
        type === "text/html"
      ) {
        // Store all images and PDF and text/html in a binary blob store, so we don't have
        // to involve it in realtime sync.  It tends to be large, etc.
        const sha1 = saveBlob(content.data[type], type);
        if (type == "text/html") {
          // NOTE: in general, this may or may not get rendered as an iframe --
          // we use iframe for backward compatibility.
          content.data["iframe"] = sha1;
          delete content.data["text/html"];
        } else {
          content.data[type] = sha1;
        }
      }
    }
  };

  call = async (msg_type: string, content?: any): Promise<any> => {
    this.dbg("call")(msg_type);
    if (!this.has_ensured_running) {
      await this.ensure_running();
    }
    // Do a paranoid double check anyways...
    if (this.sockets == null || this._state == "closed") {
      throw Error("not running, so can't call");
    }

    const message = {
      parent_header: {},
      metadata: {},
      channel: "shell",
      content,
      header: {
        msg_id: uuid(),
        username: "",
        session: "",
        msg_type: msg_type as MessageType,
        version: VERSION,
        date: new Date().toISOString(),
      },
    };

    // Send the message
    this.sockets.send(message);

    // Wait for the response that has the right msg_id.
    let the_mesg: any = undefined;
    const wait_for_response = (cb) => {
      const f = (mesg) => {
        if (mesg.parent_header.msg_id === message.header.msg_id) {
          this.removeListener("shell", f);
          this.removeListener("closed", g);
          mesg = deep_copy(mesg.content);
          if (len(mesg.metadata) === 0) {
            delete mesg.metadata;
          }
          the_mesg = mesg;
          cb();
        }
      };
      const g = () => {
        this.removeListener("shell", f);
        this.removeListener("closed", g);
        cb("closed - jupyter - kernel - call");
      };
      this.on("shell", f);
      this.on("closed", g);
    };
    await callback(wait_for_response);
    return the_mesg;
  };

  complete = async (opts: { code: any; cursor_pos: any }): Promise<any> => {
    const dbg = this.dbg("complete");
    dbg(`code='${opts.code}', cursor_pos='${opts.cursor_pos}'`);
    return await this.call("complete_request", opts);
  };

  introspect = async (opts: {
    code: any;
    cursor_pos: any;
    detail_level: any;
  }): Promise<any> => {
    const dbg = this.dbg("introspect");
    dbg(
      `code='${opts.code}', cursor_pos='${opts.cursor_pos}', detail_level=${opts.detail_level}`,
    );
    return await this.call("inspect_request", opts);
  };

  kernel_info = reuseInFlight(async (): Promise<KernelInfo> => {
    if (this._kernel_info !== undefined) {
      return this._kernel_info;
    }
    const info = await this.call("kernel_info_request");
    info.nodejs_version = process.version;
    if (this._actions != null) {
      info.start_time = this._actions.store.get("start_time");
    }
    this._kernel_info = info;
    return info;
  });

  save_ipynb_file = async (opts?): Promise<void> => {
    if (this._actions != null) {
      await this._actions.save_ipynb_file(opts);
    } else {
      throw Error("save_ipynb_file -- ERROR: actions not known");
    }
  };

  more_output = (id: string): any[] => {
    if (id == null) {
      throw new Error("must specify id");
    }
    if (this._actions == null) {
      throw new Error("must have redux actions");
    }
    return this._actions.store.get_more_output(id) ?? [];
  };

  nbconvert = reuseInFlight(
    async (args: string[], timeout?: number): Promise<void> => {
      if (timeout === undefined) {
        timeout = 60; // seconds
      }
      if (!is_array(args)) {
        throw new Error("args must be an array");
      }
      args = copy(args);
      args.push("--");
      args.push(this._filename);
      await nbconvert({
        args,
        timeout,
        directory: this._directory,
      });
    },
  );

  load_attachment = async (path: string): Promise<string> => {
    const dbg = this.dbg("load_attachment");
    dbg(`path='${path}'`);
    if (path[0] !== "/") {
      path = join(process.env.HOME ?? "", path);
    }
    const f = async (): Promise<string> => {
      const bs = this.get_blob_store();
      if (bs == null) {
        throw new Error("BlobStore not available");
      }
      return await bs.readFile(path);
    };
    try {
      return await retry_until_success({
        f,
        max_time: 30000,
      });
    } catch (err) {
      unlink(path); // TODO: think through again if this is the right thing to do.
      throw err;
    }
  };

  // This is called by project-actions when exporting the notebook
  // to an ipynb file:
  get_blob_store = (): BlobStoreInterface | undefined => {
    const blobs = this._actions?.blobs;
    if (blobs == null) {
      return;
    }
    const t = new TextDecoder();
    return {
      getBase64: (sha1: string): string | undefined => {
        const buf = blobs.get(sha1);
        if (buf === undefined) {
          return buf;
        }
        return uint8ArrayToBase64(buf);
      },

      getString: (sha1: string): string | undefined => {
        const buf = blobs.get(sha1);
        if (buf === undefined) {
          return buf;
        }
        return t.decode(buf);
      },

      readFile: async (path: string): Promise<string> => {
        const buf = await readFile(path);
        const sha1: string = misc_node_sha1(buf);
        blobs.set(sha1, buf);
        return sha1;
      },

      saveBase64: (data: string) => {
        const buf = Buffer.from(data, "base64");
        const sha1: string = misc_node_sha1(buf);
        blobs.set(sha1, buf);
        return sha1;
      },
    };
  };

  process_comm_message_from_kernel = (mesg): void => {
    if (this._actions == null) {
      return;
    }
    const dbg = this.dbg("process_comm_message_from_kernel");
    // This can be HUGE so don't print out the entire message; e.g., it could contain
    // massive binary data!
    dbg(mesg.header);
    this._actions.process_comm_message_from_kernel(mesg);
  };

  ipywidgetsGetBuffer = (
    model_id: string,
    // buffer_path is the string[] *or* the JSON of that.
    buffer_path: string | string[],
  ): Buffer | undefined => {
    if (typeof buffer_path != "string") {
      buffer_path = JSON.stringify(buffer_path);
    }
    return this._actions?.syncdb.ipywidgets_state?.getBuffer(
      model_id,
      buffer_path,
    );
  };

  send_comm_message_to_kernel = ({
    msg_id,
    comm_id,
    target_name,
    data,
    buffers64,
    buffers,
  }: {
    msg_id: string;
    comm_id: string;
    target_name: string;
    data: any;
    buffers64?: string[];
    buffers?: Buffer[];
  }): void => {
    if (this.sockets == null) {
      throw Error("sockets not initialized");
    }
    const dbg = this.dbg("send_comm_message_to_kernel");
    // this is HUGE
    // dbg({ msg_id, comm_id, target_name, data, buffers64 });
    if (buffers64 != null && buffers64.length > 0) {
      buffers = buffers64?.map((x) => Buffer.from(base64ToBuffer(x))) ?? [];
      dbg(
        "buffers lengths = ",
        buffers.map((x) => x.byteLength),
      );
      if (this._actions?.syncdb.ipywidgets_state != null) {
        this._actions.syncdb.ipywidgets_state.setModelBuffers(
          comm_id,
          data.buffer_paths,
          buffers,
          false,
        );
      }
    }

    const message = {
      parent_header: {},
      metadata: {},
      channel: "shell",
      content: { comm_id, target_name, data },
      header: {
        msg_id,
        username: "user",
        session: "",
        msg_type: "comm_msg" as MessageType,
        version: VERSION,
        date: new Date().toISOString(),
      },
      buffers,
    };

    // HUGE
    // dbg(message);
    // "The Kernel listens for these messages on the Shell channel,
    // and the Frontend listens for them on the IOPub channel." -- docs
    this.sockets.send(message);
  };

  chdir = async (path: string): Promise<void> => {
    if (!this.name) return; // no kernel, no current directory
    const dbg = this.dbg("chdir");
    dbg({ path });
    let lang;
    try {
      // using probably cached data, so likely very fast
      lang = await getLanguage(this.name);
    } catch (err) {
      dbg("WARNING ", err);
      const info = await this.kernel_info();
      lang = info.language_info?.name ?? "";
    }

    const absPath = getAbsolutePathFromHome(path);
    const code = createChdirCommand(lang, absPath);
    // code = '' if no command needed, e.g., for sparql.
    if (code) {
      await this.execute_code_now({ code });
    }
  };
}

export function get_kernel_by_pid(pid: number): JupyterKernel | undefined {
  for (const kernel of Object.values(kernels.kernels)) {
    if (kernel.get_spawned_kernel()?.spawn.pid === pid) {
      return kernel;
    }
  }
  return;
}
