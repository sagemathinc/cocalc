/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Jupyter Backend

For interactive testing:

$ ts-node
> const j = require('@cocalc/project/jupyter/jupyter'); const k = j.kernel({name:'python3', path:'x.ipynb'});
> k.execute_code({all:true, cb:((x) => console.log(JSON.stringify(x))), code:'2+3'})

Interactive testing at the command prompt involving stdin:

let echo=(content, cb) => cb(undefined, '389'+content.prompt)
k.execute_code({all:true, stdin:echo, cb:((x) -> console.log(JSON.stringify(x))), code:'input("a")'})

k.execute_code({all:true, stdin:echo, cb:((x) -> console.log(JSON.stringify(x))), code:'[input("-"+str(i)) for i in range(100)]'})

echo=(content, cb) => setTimeout((->cb(undefined, '389'+content.prompt)), 1000)

*/

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
import type { Channels, MessageType } from "@nteract/messaging";
import { reuseInFlight } from "async-await-utils/hof";
import { callback } from "awaiting";
import { createMainChannel } from "enchannel-zmq-backend";
import { EventEmitter } from "node:events";
import { unlink } from "@cocalc/backend/misc/async-utils-node";
import {
  process as iframe_process,
  is_likely_iframe,
} from "@cocalc/jupyter/blobs/iframe";
import { remove_redundant_reps } from "@cocalc/jupyter/ipynb/import-from-ipynb";
import { JupyterActions } from "@cocalc/jupyter/redux/project-actions";
import {
  CodeExecutionEmitterInterface,
  ExecOpts,
  JupyterKernelInterface,
  KernelInfo,
} from "@cocalc/jupyter/types/project-interface";
import { JupyterStore } from "@cocalc/jupyter/redux/store";
import { JUPYTER_MIMETYPES } from "@cocalc/jupyter/util/misc";
import type { SyncDB } from "@cocalc/sync/editor/db/sync";
import { retry_until_success } from "@cocalc/util/async-utils";
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
} from "@cocalc/util/misc";
import { CodeExecutionEmitter } from "@cocalc/jupyter/execute/execute-code";
import { get_blob_store_sync } from "@cocalc/jupyter/blobs";
import {
  getLanguage,
  get_kernel_data_by_name,
} from "@cocalc/jupyter/kernel/kernel-data";
import launchJupyterKernel, {
  LaunchJupyterOpts,
  SpawnedKernel,
  killKernel,
} from "@cocalc/jupyter/pool/pool";
import { getAbsolutePathFromHome } from "@cocalc/jupyter/util/fs";
import type { KernelParams } from "@cocalc/jupyter/types/kernel";
import { redux_name } from "@cocalc/util/redux/name";
import { getLogger } from "@cocalc/backend/logger";
import { redux } from "@cocalc/jupyter/redux/app";
import { VERSION } from "@cocalc/jupyter/kernel/version";
import type { NbconvertParams } from "@cocalc/jupyter/types/nbconvert";

const log = getLogger("jupyter");

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

export function jupyter_backend(syncdb: SyncDB, client: any): void {
  const dbg = getLogger("jupyter_backend");
  dbg.debug();

  const project_id = client.client_id();

  // This path is the file we will watch for changes and save to, which is in the original
  // official ipynb format:
  const path = original_path(syncdb.get_path());

  const name = redux_name(project_id, path);
  if (redux.getStore(name) != null && redux.getActions(name) != null) {
    // The redux info for this notebook already exists, so don't
    // try to make it again (which would be an error).
    // See https://github.com/sagemathinc/cocalc/issues/4331
    return;
  }
  const store = redux.createStore(name, JupyterStore);
  const actions = redux.createActions(name, JupyterActions);

  actions._init(project_id, path, syncdb, store, client);

  syncdb.once("error", (err) => dbg.error(`syncdb ERROR -- ${err}`));
  syncdb.once("ready", () => dbg.debug("syncdb ready"));
}

// Get rid of the store/actions for a given Jupyter notebook,
// and also close the kernel if it is running.
export async function remove_jupyter_backend(
  path: string,
  project_id: string
): Promise<void> {
  // if there is a kernel, close it
  try {
    await get_existing_kernel(path)?.close();
  } catch (_err) {
    // ignore
  }
  const name = redux_name(project_id, path);
  const actions = redux.getActions(name);
  if (actions != null) {
    try {
      await actions.close();
    } catch (_err) {
      // ignore.
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
const _jupyter_kernels: { [path: string]: JupyterKernel } = {};

// Ensure that the kernels all get killed when the process exits.
nodeCleanup(() => {
  for (const kernelPath in _jupyter_kernels) {
    // We do NOT await the close since that's not really
    // supported or possible in general.
    const { _kernel } = _jupyter_kernels[kernelPath] as any;
    if (_kernel) {
      killKernel(_kernel);
    }
  }
});

// NOTE: keep JupyterKernel implementation private -- use the kernel function
// above, and the interface defined in types.
class JupyterKernel extends EventEmitter implements JupyterKernelInterface {
  // name -- if undefined that means "no actual Jupyter kernel" (i.e., this JupyterKernel exists
  // here, but there is no actual separate real Jupyter kernel process and one won't be created).
  // Everything should work, except you can't *spawn* such a kernel.
  public name: string | undefined;

  public store: any; // this is a key:value store used mainly for stdin support right now. NOTHING TO DO WITH REDUX!
  public readonly identity: string = uuid();

  private stderr: string = "";
  private ulimit?: string;
  private _path: string;
  private _actions?: JupyterActions;
  private _state: string;
  private _directory: string;
  private _filename: string;
  private _kernel?: SpawnedKernel;
  private _kernel_info?: KernelInfo;
  public _execute_code_queue: CodeExecutionEmitter[] = [];
  public channel?: Channels;
  private has_ensured_running: boolean = false;

  constructor(
    name: string,
    _path: string,
    _actions: JupyterActions | undefined,
    ulimit: string | undefined
  ) {
    super();

    this.ulimit = ulimit;
    this.spawn = reuseInFlight(this.spawn.bind(this));

    this.kernel_info = reuseInFlight(this.kernel_info.bind(this));
    this.nbconvert = reuseInFlight(this.nbconvert.bind(this));
    this.ensure_running = reuseInFlight(this.ensure_running.bind(this));

    this.close = this.close.bind(this);
    this.process_output = this.process_output.bind(this);

    this.name = name;
    this._path = _path;
    this._actions = _actions;

    this.store = key_value_store();
    const { head, tail } = path_split(this._path);
    this._directory = head;
    this._filename = tail;
    this._set_state("off");
    this._execute_code_queue = [];
    if (_jupyter_kernels[this._path] !== undefined) {
      // This happens when we change the kernel for a given file, e.g., from python2 to python3.
      // Obviously, it is important to clean up after the old kernel.
      _jupyter_kernels[this._path].close();
    }
    _jupyter_kernels[this._path] = this;
    this.setMaxListeners(100);
    const dbg = this.dbg("constructor");
    dbg("done");
  }

  public get_path() {
    return this._path;
  }

  // no-op if calling it doesn't change the state.
  private _set_state(state: string): void {
    // state = 'off' --> 'spawning' --> 'starting' --> 'running' --> 'closed'
    if (this._state == state) return;
    this._state = state;
    this.emit("state", this._state);
    this.emit(this._state); // we *SHOULD* use this everywhere, not above.
  }

  get_state(): string {
    return this._state;
  }

  async spawn(spawn_opts?: { env?: { [key: string]: string } }): Promise<void> {
    if (this._state === "closed") {
      // game over!
      throw Error("closed");
    }
    if (!this.name) {
      // spawning not allowed.
      throw Error("cannot spawn since no kernel is set");
    }
    if (["running", "starting"].includes(this._state)) {
      // Already spawned, so no need to do it again.
      return;
    }
    this._set_state("spawning");
    const dbg = this.dbg("spawn");
    dbg("spawning kernel...");

    // ****
    // CRITICAL: anything added to opts better not be specific
    // to the kernel path or it will completely break using a
    // pool, which makes things massively slower.
    // ****

    const opts: LaunchJupyterOpts = {
      env: spawn_opts?.env ?? {},
      ...(this.ulimit != null ? { ulimit: this.ulimit } : undefined),
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
    // Otherwise the pool will switch to fallling back to not being used, and
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
      dbg("launching kernel interface...");
      this._kernel = await launchJupyterKernel(this.name, opts);
      await this.finish_spawn();
    } catch (err) {
      if (this._state === "closed") {
        throw Error("closed");
      }
      this._set_state("off");
      throw err;
    }

    // NOW we do path-related customizations:
    // TODO: we will set each of these after getting a kernel from the pool
    // expose path of jupyter notebook -- https://github.com/sagemathinc/cocalc/issues/5165
    //opts.env.COCALC_JUPYTER_FILENAME = this._path;
    //     if (this._directory !== "") {
    //       opts.cwd = this._directory;
    //     }
  }

  get_spawned_kernel() {
    return this._kernel;
  }

  public get_connection_file(): string | undefined {
    return this._kernel?.connectionFile;
  }

  private async finish_spawn(): Promise<void> {
    const dbg = this.dbg("finish_spawn");
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
      this.emit("kernel_error", error);
    });

    // Track stderr from the subprocess itself (the kernel).
    // This is useful for debugging broken kernels, etc., and is especially
    // useful since it exists even if the kernel sends nothing over any
    // zmq channels (e.g., due to being very broken).
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
      // even if we **totally ignore** the data. Otherwise, execa saves
      // some amount then just locks up and doesn't allow flushing the
      // output stream.  This is a "nice" feature of execa, since it means
      // no data gets dropped.  See https://github.com/sagemathinc/cocalc/issues/5065
    });

    dbg("create main channel...", this._kernel.config);
    this.channel = await createMainChannel(
      this._kernel.config,
      "",
      this.identity
    );
    dbg("created main channel");

    this.channel?.subscribe((mesg) => {
      switch (mesg.channel) {
        case "shell":
          this._set_state("running");
          this.emit("shell", mesg);
          break;
        case "stdin":
          this.emit("stdin", mesg);
          break;
        case "iopub":
          this._set_state("running");
          if (mesg.content != null && mesg.content.execution_state != null) {
            this.emit("execution_state", mesg.content.execution_state);
          }

          if (
            (mesg.content != null ? mesg.content.comm_id : undefined) !==
            undefined
          ) {
            // A comm message, which gets handled directly.
            this.process_comm_message_from_kernel(mesg);
            break;
          }

          if (
            this._actions != null &&
            this._actions.capture_output_message(mesg)
          ) {
            // captured an output message -- do not process further
            break;
          }

          this.emit("iopub", mesg);
          break;
      }
    });

    this._kernel.spawn.on("exit", (exit_code, signal) => {
      this.dbg("kernel_exit")(
        `spawned kernel terminated with exit code ${exit_code} (signal=${signal}); stderr=${this.stderr}`
      );
      const stderr = this.stderr ? `\n...\n${this.stderr}` : "";
      if (signal != null) {
        this.emit(
          "kernel_error",
          `Kernel last terminated by signal ${signal}.${stderr}`
        );
      } else if (exit_code != null) {
        this.emit(
          "kernel_error",
          `Kernel last exited with code ${exit_code}.${stderr}`
        );
      }
      this.close();
    });

    // so we can start sending code execution to the kernel, etc.
    this._set_state("starting");

    if (this._state === "closed") {
      throw Error("closed");
    }
  }

  // Signal should be a string like "SIGINT", "SIGKILL".
  // See https://nodejs.org/api/process.html#process_process_kill_pid_signal
  signal(signal: string): void {
    const dbg = this.dbg("signal");
    const spawn = this._kernel != null ? this._kernel.spawn : undefined;
    const pid = spawn?.pid;
    dbg(`pid=${pid}, signal=${signal}`);
    if (pid == null) return;
    try {
      this.clear_execute_code_queue();
      process.kill(-pid, signal); // negative to kill the process group
    } catch (err) {
      dbg(`error: ${err}`);
    }
  }

  // This is async, but the process.kill happens *before*
  // anything async. That's important for cleaning these
  // up when the project terminates.
  async close(): Promise<void> {
    this.dbg("close")();
    if (this._state === "closed") {
      return;
    }
    this._set_state("closed");
    if (this.store != null) {
      this.store.close();
      delete this.store;
    }
    const kernel = _jupyter_kernels[this._path];
    if (kernel != null && kernel.identity === this.identity) {
      delete _jupyter_kernels[this._path];
    }
    this.removeAllListeners();
    if (this._kernel != null) {
      killKernel(this._kernel);
      delete this._kernel;
      delete this.channel;
    }
    if (this._execute_code_queue != null) {
      for (const code_snippet of this._execute_code_queue) {
        code_snippet.close();
      }
      this._execute_code_queue = [];
    }
  }

  // public, since we do use it from some other places...
  dbg(f: string): Function {
    return (...args) => {
      //console.log(
      log.debug(
        `jupyter.Kernel('${this.name ?? "no kernel"}',path='${
          this._path
        }').${f}`,
        ...args
      );
    };
  }

  low_level_dbg(): void {
    const dbg = (...args) => log.silly("low_level_debug", ...args);
    dbg("Enabling");
    if (this._kernel) {
      this._kernel.spawn.all?.on("data", (data) =>
        dbg("STDIO", data.toString())
      );
    }
    // for low level debugging only...
    this.channel?.subscribe((mesg) => {
      dbg(mesg);
    });
  }

  async ensure_running(): Promise<void> {
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
    if (this._kernel?.initCode != null) {
      for (const code of this._kernel?.initCode ?? []) {
        dbg("initCode ", code);
        await new CodeExecutionEmitter(this, { code }).go();
      }
    }
    if (!this.has_ensured_running) {
      this.has_ensured_running = true;
    }
  }

  execute_code(
    opts: ExecOpts,
    skipToFront = false
  ): CodeExecutionEmitterInterface {
    if (opts.halt_on_error === undefined) {
      // if not specified, default to true.
      opts.halt_on_error = true;
    }
    if (this._state === "closed") {
      throw Error("closed");
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
  }

  cancel_execute(id: string): void {
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
        "mutate this._execute_code_queue removing everything with the given id"
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
  }

  async _process_execute_code_queue(): Promise<void> {
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
      this._execute_code_queue
    );
    try {
      await this.ensure_running();
      this._execute_code_queue[0].go();
    } catch (err) {
      dbg(`error running kernel -- ${err}`);
      for (const code of this._execute_code_queue) {
        code.throw_error(err);
      }
      this._execute_code_queue = [];
    }
  }

  public clear_execute_code_queue(): void {
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
  }

  // This is like execute_code, but async and returns all the results,
  // and does not use the internal execution queue.
  // This is used for unit testing and interactive work at the terminal and nbgrader and the stateless api.
  async execute_code_now(opts: ExecOpts): Promise<object[]> {
    this.dbg("execute_code_now")();
    if (this._state === "closed") {
      throw Error("closed");
    }
    if (opts.halt_on_error === undefined) {
      // if not specified, default to true.
      opts.halt_on_error = true;
    }
    await this.ensure_running();
    return await new CodeExecutionEmitter(this, opts).go();
  }

  process_output(content: any): void {
    if (this._state === "closed") {
      return;
    }
    const dbg = this.dbg("process_output");
    // https://github.com/sagemathinc/cocalc/issues/6665
    // NO do not do this sort of thing.  This is exactly the sort of situation where
    // content could be very large, and JSON.stringify could use huge amounts of memory.
    // If you need to see this for debugging, uncomment it.
    // dbg(trunc(JSON.stringify(content), 300));
    if (content.data == null) {
      // todo: FOR now -- later may remove large stdout, stderr, etc...
      dbg("no data, so nothing to do");
      return;
    }

    remove_redundant_reps(content.data);

    let type: string;
    for (type of JUPYTER_MIMETYPES) {
      if (content.data[type] != null) {
        if (type.split("/")[0] === "image" || type === "application/pdf") {
          const blob_store = get_blob_store_sync();
          if (blob_store != null) {
            content.data[type] = blob_store.save(content.data[type], type);
          }
        } else if (
          type === "text/html" &&
          is_likely_iframe(content.data[type])
        ) {
          // Likely iframe, so we treat it as such.  This is very important, e.g.,
          // because of Sage's JMOL-based 3d graphics.  These are huge, so we have to parse
          // and remove these and serve them from the backend.
          //  {iframe: sha1 of srcdoc}
          content.data["iframe"] = iframe_process(
            content.data[type],
            get_blob_store_sync()
          );
          delete content.data[type];
        }
      }
    }
  }

  async call(msg_type: string, content?: any): Promise<any> {
    this.dbg("call")(msg_type);
    if (!this.has_ensured_running) {
      await this.ensure_running();
    }
    // Do a paranoid double check anyways...
    if (this.channel == null || this._state == "closed") {
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
    this.channel?.next(message);

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
        cb("closed");
      };
      this.on("shell", f);
      this.on("closed", g);
    };
    await callback(wait_for_response);
    return the_mesg;
  }

  async complete(opts: { code: any; cursor_pos: any }): Promise<any> {
    const dbg = this.dbg("complete");
    dbg(`code='${opts.code}', cursor_pos='${opts.cursor_pos}'`);
    return await this.call("complete_request", opts);
  }

  async introspect(opts: {
    code: any;
    cursor_pos: any;
    detail_level: any;
  }): Promise<any> {
    const dbg = this.dbg("introspect");
    dbg(
      `code='${opts.code}', cursor_pos='${opts.cursor_pos}', detail_level=${opts.detail_level}`
    );
    return await this.call("inspect_request", opts);
  }

  async kernel_info(): Promise<KernelInfo> {
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
  }

  async save_ipynb_file(): Promise<void> {
    if (this._actions != null) {
      await this._actions.save_ipynb_file();
    } else {
      throw Error("save_ipynb_file -- ERROR: actions not known");
    }
  }

  more_output(id: string): any[] {
    if (id == null) {
      throw new Error("must specify id");
    }
    if (this._actions == null) {
      throw new Error("must have redux actions");
    }
    return this._actions.store.get_more_output(id) || [];
  }

  async nbconvert(args: string[], timeout?: number): Promise<void> {
    if (timeout === undefined) {
      timeout = 30; // seconds
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
  }

  // TODO: double check that this actually returns sha1
  async load_attachment(path: string): Promise<string> {
    const dbg = this.dbg("load_attachment");
    dbg(`path='${path}'`);
    if (path[0] !== "/") {
      path = process.env.HOME + "/" + path;
    }
    async function f(): Promise<string> {
      const bs = get_blob_store_sync();
      if (bs == null) throw new Error("BlobStore not available");
      return bs.readFile(path, "base64");
    }
    try {
      return await retry_until_success({
        f: f,
        max_time: 30000,
      });
    } catch (err) {
      unlink(path); // TODO: think through again if this is the right thing to do.
      throw err;
    }
  }

  // This is called by project-actions when exporting the notebook
  // to an ipynb file:
  get_blob_store() {
    return get_blob_store_sync();
  }

  process_attachment(base64, mime): string | undefined {
    const blob_store = get_blob_store_sync();
    return blob_store?.save(base64, mime);
  }

  process_comm_message_from_kernel(mesg): void {
    if (this._actions == null) {
      return;
    }
    const dbg = this.dbg("process_comm_message_from_kernel");
    dbg(mesg);
    this._actions.process_comm_message_from_kernel(mesg);
  }

  public ipywidgetsGetBuffer(
    model_id: string,
    buffer_path: string
  ): Buffer | undefined {
    return this._actions?.syncdb.ipywidgets_state?.getBuffer(
      model_id,
      buffer_path
    );
  }

  public send_comm_message_to_kernel(
    msg_id: string,
    comm_id: string,
    data: any
  ): void {
    const dbg = this.dbg("send_comm_message_to_kernel");

    const message = {
      parent_header: {},
      metadata: {},
      channel: "shell",
      content: { comm_id, data },
      header: {
        msg_id,
        username: "user",
        session: "",
        msg_type: "comm_msg" as MessageType,
        version: VERSION,
        date: new Date().toISOString(),
      },
    };

    dbg(message);
    // "The Kernel listens for these messages on the Shell channel,
    // and the Frontend listens for them on the IOPub channel." -- docs
    this.channel?.next(message);
  }

  async chdir(path: string): Promise<void> {
    if (!this.name) return; // no kernel, no current directory
    const dbg = this.dbg("chdir");
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
    if (code) {
      // returns '' if no command needed, e.g., for sparql.
      await this.execute_code_now({ code });
    }
  }
}

export function get_existing_kernel(path: string): JupyterKernel | undefined {
  return _jupyter_kernels[path];
}

export function get_kernel_by_pid(pid: number): JupyterKernel | undefined {
  for (const kernel of Object.values(_jupyter_kernels)) {
    if (kernel.get_spawned_kernel()?.spawn.pid === pid) {
      return kernel;
    }
  }
  return;
}
