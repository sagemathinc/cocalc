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

export const VERSION = "5.3";

import { EventEmitter } from "events";
import { exists, unlink } from "./async-utils-node";
import { createMainChannel } from "enchannel-zmq-backend";
import { Channels, MessageType } from "@nteract/messaging";

const {
  merge,
  copy,
  deep_copy,
  original_path,
  path_split,
  uuid,
  len,
  is_array,
} = require("@cocalc/util/misc");

import { SyncDB } from "@cocalc/sync/editor/db/sync";

const { key_value_store } = require("@cocalc/util/key-value-store");

import { get_blob_store } from "./jupyter-blobs-sqlite";
import { JUPYTER_MIMETYPES } from "@cocalc/frontend/jupyter/util";
import {
  is_likely_iframe,
  process as iframe_process,
} from "@cocalc/frontend/jupyter/iframe";

import { remove_redundant_reps } from "@cocalc/frontend/jupyter/import-from-ipynb";

import { retry_until_success } from "@cocalc/util/async-utils";
import { callback } from "awaiting";
import { reuseInFlight } from "async-await-utils/hof";

import { nbconvert } from "./convert";

import {
  ExecOpts,
  KernelInfo,
  CodeExecutionEmitterInterface,
} from "@cocalc/frontend/jupyter/project-interface";

import { CodeExecutionEmitter } from "./execute-code";

import { JupyterActions } from "@cocalc/frontend/jupyter/project-actions";
import { JupyterStore } from "@cocalc/frontend/jupyter/store";

import { JupyterKernelInterface } from "@cocalc/frontend/jupyter/project-interface";

import {
  launch_jupyter_kernel,
  LaunchJupyterOpts,
} from "./launch_jupyter_kernel";

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
  const dbg = client.dbg("jupyter_backend");
  dbg();
  const app_framework = require("@cocalc/frontend/app-framework");

  const project_id = client.client_id();

  // This path is the file we will watch for changes and save to, which is in the original
  // official ipynb format:
  const path = original_path(syncdb.get_path());

  const redux_name = app_framework.redux_name(project_id, path);
  if (
    app_framework.redux.getStore(redux_name) != null &&
    app_framework.redux.getActions(redux_name) != null
  ) {
    // The redux info for this notebook already exists, so don't
    // try to make it again (which would be an error).
    // See https://github.com/sagemathinc/cocalc/issues/4331
    return;
  }
  const store = app_framework.redux.createStore(redux_name, JupyterStore);
  const actions = app_framework.redux.createActions(redux_name, JupyterActions);

  actions._init(project_id, path, syncdb, store, client);

  syncdb.once("error", (err) => dbg(`syncdb ERROR -- ${err}`));
  syncdb.once("ready", () => dbg("syncdb ready"));
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
  const app_framework = require("@cocalc/frontend/app-framework");
  const redux_name = app_framework.redux_name(project_id, path);
  const actions = app_framework.redux.getActions(redux_name);
  if (actions != null) {
    try {
      await actions.close();
    } catch (_err) {
      // ignore.
    }
  }
  app_framework.redux.removeStore(redux_name);
  app_framework.redux.removeActions(redux_name);
}

// for interactive testing
// TODO: needs to somehow proxy through the real client...
class Client {
  client_id(): string {
    return "123e4567-e89b-12d3-a456-426655440000";
  }
  is_project(): boolean {
    return true;
  }
  dbg(f) {
    return (...m) => console.log(new Date(), `Client.${f}: `, ...m);
  }
}

interface KernelParams {
  name: string;
  client?: Client;
  verbose?: boolean;
  path: string; // filename of the ipynb corresponding to this kernel (doesn't have to actually exist)
  actions?: any; // optional redux actions object
}

export function kernel(opts: KernelParams): JupyterKernel {
  if (opts.verbose === undefined) {
    opts.verbose = true;
  }
  if (opts.client === undefined) {
    opts.client = new Client();
  }
  return new JupyterKernel(
    opts.name,
    opts.verbose ? opts.client.dbg : undefined,
    opts.path,
    opts.actions
  );
}

/*
Jupyter Kernel interface.

The kernel does *NOT* start up until either spawn is explicitly called, or
code execution is explicitly requested.  This makes it possible to
call process_output without spawning an actual kernel.
*/
const _jupyter_kernels: { [path: string]: JupyterKernel } = {};

export class JupyterKernel
  extends EventEmitter
  implements JupyterKernelInterface
{
  public name: string;
  public store: any; // used mainly for stdin support right now...
  public readonly identity: string = uuid();

  private stderr: string = "";
  private _dbg: Function;
  private _path: string;
  private _actions: any;
  private _state: string;
  private _directory: string;
  private _filename: string;
  private _kernel: any;
  private _kernel_info: KernelInfo;
  _execute_code_queue: CodeExecutionEmitter[] = [];
  public channel?: Channels;
  private has_ensured_running: boolean = false;

  constructor(name, _dbg, _path, _actions) {
    super();

    this.spawn = reuseInFlight(this.spawn.bind(this)); // TODO -- test carefully!

    this.kernel_info = reuseInFlight(this.kernel_info.bind(this));
    this.nbconvert = reuseInFlight(this.nbconvert.bind(this));
    this.ensure_running = reuseInFlight(this.ensure_running.bind(this));

    this.close = this.close.bind(this);
    this.process_output = this.process_output.bind(this);

    this.name = name;
    this._dbg = _dbg;
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
    const dbg = this.dbg("constructor");
    dbg();
    process.on("exit", this.close);
    this.setMaxListeners(100);
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

  async spawn(spawn_opts?): Promise<void> {
    if (this._state === "closed") {
      // game over!
      throw Error("closed");
    }
    if (["running", "starting"].includes(this._state)) {
      // Already spawned, so no need to do it again.
      return;
    }
    this._set_state("spawning");
    const dbg = this.dbg("spawn");
    dbg("spawning kernel...");

    const opts: LaunchJupyterOpts = {
      detached: true,
      env: spawn_opts?.env ?? {},
    };

    if (this.name.indexOf("sage") == 0) {
      dbg("setting special environment for sage.* kernels");
      opts.env = merge(opts.env, SAGE_JUPYTER_ENV);
    }

    // Make cocalc default to the colab renderer for cocalc-jupyter, since
    // this one happens to work best for us, and they don't have a custom
    // one for us.  See https://plot.ly/python/renderers/ and
    // https://github.com/sagemathinc/cocalc/issues/4259
    opts.env.PLOTLY_RENDERER = "colab";

    // expose path of jupyter notebook -- https://github.com/sagemathinc/cocalc/issues/5165
    opts.env.COCALC_JUPYTER_FILENAME = this._path;
    opts.env.COCALC_JUPYTER_KERNELNAME = this.name;

    if (this._directory !== "") {
      opts.cwd = this._directory;
    }

    try {
      dbg("launching kernel interface...");
      this._kernel = await launch_jupyter_kernel(this.name, opts);
      await this.finish_spawn();
    } catch (err) {
      if (this._state === "closed") {
        throw Error("closed");
      }
      this._set_state("off");
      throw err;
    }
  }

  get_spawned_kernel() {
    return this._kernel;
  }

  public get_connection_file(): string | undefined {
    return this._kernel?.connection_file;
  }

  private async finish_spawn(): Promise<void> {
    const dbg = this.dbg("finish_spawn");
    dbg("now finishing spawn of kernel...");

    if (DEBUG) {
      this.low_level_dbg();
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

    dbg("create main channel...");
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

  async _get_kernel_info(): Promise<void> {
    const dbg = this.dbg("_get_kernel_info");
    /*
    The following is very ugly!  In practice, with testing,
    I've found that some kernels simply
    don't start immediately, and drop early messages.  The only reliable way to
    get things going properly is to just keep trying something (we do the kernel_info
    command) until it works. Only then do we declare the kernel ready for code
    execution, etc.   Probably the jupyter devs never notice this race condition
    bug in ZMQ/Jupyter kernels... or maybe the Python server has a sort of
    accidental work around.

    Update: a Jupyter dev has finally publicly noticed this bug:
      https://github.com/jupyterlab/rtc/pull/73#issuecomment-705775279
    */
    const that = this;
    async function f(): Promise<void> {
      if (that._state == "closed") return;
      dbg("calling kernel_info_request...", that._state);
      await that.call("kernel_info_request");
      dbg("called kernel_info_request", that._state);
      if (that._state === "starting") {
        throw Error("still starting");
      }
    }

    dbg("getting kernel info to be certain kernel is fully usable...");
    await retry_until_success({
      start_delay: 500,
      max_delay: 5000,
      factor: 1.4,
      max_time: 60000, // long in case of starting many at once --
      // we don't want them to all fail and start
      // again and fail ad infinitum!
      f: f,
      log: function (...args) {
        dbg("retry_until_success", ...args);
      },
    });
    if (this._state == "closed") {
      throw Error("closed");
    }

    dbg("successfully got kernel info");
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
    process.removeListener("exit", this.close);
    if (this._kernel != null) {
      if (this._kernel.spawn != null) {
        // Important to remove listeners before sending signals, since otherwise
        // sending signals emits events that can lead to fork bombs going off.
        this._kernel.spawn.removeAllListeners();
        // OK, now tell kernel to terminate.
        if (this._kernel.spawn.pid) {
          try {
            process.kill(-this._kernel.spawn.pid, "SIGTERM");
          } catch (err) {}
        }
        this._kernel.spawn.close?.();
      }
      if (await exists(this._kernel.connection_file)) {
        try {
          await unlink(this._kernel.connection_file);
        } catch {
          // ignore
        }
      }
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
  public dbg(f: string, trunc: number = 1000): Function {
    if (!this._dbg) {
      return function () {};
    } else {
      return this._dbg(
        `jupyter.Kernel('${this.name}',path='${this._path}').${f}`,
        trunc
      );
    }
  }

  low_level_dbg(): void {
    const dbg = this.dbg("low_level_debug", 10000);
    dbg("Enabling");
    this._kernel.spawn.all?.on("data", (data) => dbg("STDIO", data.toString()));
    // for low level debugging only...
    this.channel?.subscribe((mesg) => {
      dbg(JSON.stringify(mesg));
    });
  }

  private async ensure_running(): Promise<void> {
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
    if (!this.has_ensured_running) {
      dbg("waiting for kernel info");
      this.has_ensured_running = true;
      await this._get_kernel_info();
      dbg("got kernel info");
    }
  }

  execute_code(opts: ExecOpts): CodeExecutionEmitterInterface {
    if (opts.halt_on_error === undefined) {
      // if not specified, default to true.
      opts.halt_on_error = true;
    }
    if (this._state === "closed") {
      throw Error("closed");
    }
    const code = new CodeExecutionEmitter(this, opts);
    this._execute_code_queue.push(code);
    if (this._execute_code_queue.length === 1) {
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
    dbg(`queue has ${n} items; ensure kernel running`);
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
  // This is used for unit testing and interactive work at the terminal.
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

  get_blob_store() {
    return get_blob_store();
  }

  process_output(content: any): void {
    if (this._state === "closed") {
      return;
    }
    const dbg = this.dbg("process_output");
    dbg(JSON.stringify(content));
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
          content.data[type] = get_blob_store()?.save(content.data[type], type);
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
            get_blob_store()
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
      const bs = get_blob_store();
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

  process_attachment(base64, mime): string | undefined {
    return get_blob_store()?.save(base64, mime);
  }

  process_comm_message_from_kernel(mesg): void {
    const dbg = this.dbg("process_comm_message_from_kernel");
    dbg(mesg);
    this._actions.process_comm_message_from_kernel(mesg);
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

    dbg("sending ", JSON.stringify(message));
    // "The Kernel listens for these messages on the Shell channel,
    // and the Frontend listens for them on the IOPub channel." -- docs
    this.channel?.next(message);
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
