/*
Jupyter Backend

For interactive testing:

$ source smc-env
$ coffee
j = require('./smc-project/jupyter/jupyter')
k = j.kernel(name:'python3', path:'x.ipynb')
k.execute_code(all:true, cb:((x) -> console.log(JSON.stringify(x))), code:'2+3')

Interactive testing at the command prompt involving stdin:

echo=(content, cb) -> cb(undefined, '389'+content.prompt)
k.execute_code(all:true, stdin:echo, cb:((x) -> console.log(JSON.stringify(x))), code:'input("a")')

k.execute_code(all:true, stdin:echo, cb:((x) -> console.log(JSON.stringify(x))), code:'[input("-"+str(i)) for i in range(100)]')

echo=(content, cb) -> setTimeout((->cb(undefined, '389'+content.prompt)), 1000)

*/

import { EventEmitter } from "events";
import kernelspecs from "kernelspecs";
import fs from "fs";
import pidusage from "pidusage";

require("coffee-register");
const {
  defaults,
  required,
  merge,
  copy,
  original_path
} = require("smc-util/misc");
const { key_value_store } = require("smc-util/key-value-store");
import { blob_store } from "./jupyter-blobs-sqlite";
import node_cleanup from "node-cleanup";
const util = require("smc-webapp/jupyter/util");
const iframe = require("smc-webapp/jupyter/iframe");
const {
  remove_redundant_reps
} = require("smc-webapp/jupyter/import-from-ipynb");

import { retry_until_success } from "smc-webapp/frame-editors/generic/async-utils";
import { callback } from "awaiting";
import { reuseInFlight } from "async-await-utils/hof";
import { delay } from "awaiting";

import { nbconvert } from "./nbconvert";

import { http_server } from "./http_server";

/*
We set a few extra user-specific options for the environment in which
Sage-based Jupyter kernels run; these are more multi-user friendly.
*/
const SAGE_JUPYTER_ENV = merge(copy(process.env), {
  PYTHONUSERBASE: `${process.env.HOME}/.local`,
  PYTHON_EGG_CACHE: `${process.env.HOME}/.sage/.python-eggs`,
  R_MAKEVARS_USER: `${process.env.HOME}/.sage/R/Makevars.user`
});

export function jupyter_backend(syncdb: any, client: any) {
  const dbg = client.dbg("jupyter_backend");
  dbg();
  const { JupyterActions } = require("smc-webapp/jupyter/project-actions");
  const { JupyterStore } = require("smc-webapp/jupyter/store");
  const app_data = require("smc-webapp/app-framework");

  const project_id = client.client_id();

  // This path is the file we will watch for changes and save to, which is in the original
  // official ipynb format:
  const path = original_path(syncdb._path);

  const redux_name = app_data.redux_name(project_id, path);
  const store = app_data.redux.createStore(redux_name, JupyterStore);
  const actions = app_data.redux.createActions(redux_name, JupyterActions);

  actions._init(project_id, path, syncdb, store, client);

  return syncdb.once("init", err => dbg(`syncdb init complete -- ${err}`));
}

// for interactive testing
class Client {
  dbg(f) {
    return (...m) => console.log(`Client.${f}: `, ...m);
  }
}

interface KernelParams {
  name: string;
  client?: Client;
  verbose?: boolean;
  path: string; // filename of the ipynb corresponding to this kernel (doesn't have to actually exist)
  actions?: any; // optional redux actions object
  usage?: boolean; // monitor memory/cpu usage and report via 'usage' event.∑
}

export function kernel(opts: KernelParams) {
  if (opts.verbose === undefined) {
    opts.verbose = true;
  }
  if (opts.usage === undefined) {
    opts.usage = true;
  }
  if (opts.client === undefined) {
    opts.client = new Client();
  }
  return new Kernel(
    opts.name,
    opts.verbose
      ? opts.client != null
        ? opts.client.dbg
        : undefined
      : undefined,
    opts.path,
    opts.actions,
    opts.usage
  );
}

/*
Jupyter Kernel interface.

The kernel does *NOT* start up until either spawn is explicitly called, or
code execution is explicitly requested.  This makes it possible to
call process_output without spawning an actual kernel.
*/
const _jupyter_kernels = {};

function node_cleanup(): void {
  for (let id in _jupyter_kernels) {
    _jupyter_kernels[id].close();
  }
}

class CodeExecutionEmitter extends EventEmitter {
  readonly code: string;
  readonly id?: string;
  readonly all: boolean;
  readonly stdin?: (options, cb) => void;
  readonly halt_on_error: boolean;

  constructor(opts) {
    this.code = opts.code;
    this.id = opts.id || undefined;
    this.all = opts.all || false;
    this.stdin = opts.stdin || undefined;
    this.halt_on_error = opts.halt_on_error || undefined;
  }

  // Probably also a bad name. Returns a valid result
  // result is https://jupyter-client.readthedocs.io/en/stable/messaging.html#python-api
  // Or an array of those when this.all is true
  execute(result: any) {
    this.emit("result", result);
  }

  request_stdin(mesg, cb: (err, response: string) => void) {
    this.emit("stdin_request", mesg, cb);
  }

  cancel() {
    this.emit("canceled");
  }

  close() {
    this.emit("closed");
  }

  throw(err) {
    this.emit("error", err);
  }
}

class Kernel extends EventEmitter {
  private name: string;
  private _dbg: Function;
  private _path: string;
  private _actions: any;
  private _state: string;
  private usage: boolean;
  private _execute_code_queue: CodeExecutionEmitter[];

  private _spawn_cbs: Function[];

  constructor(name, _dbg, _path, _actions, usage) {
    super();

    this.spawn = reuseInFlight(this.spawn); // TODO -- test carefully!
    this.kernel_info = reuseInFlight(this.kernel_info); // TODO -- test carefully!

    this.name = name;
    this._dbg = _dbg;
    this._path = _path;
    this._actions = _actions;

    this.store = key_value_store();
    const { head, tail } = misc.path_split(this._path);
    this._directory = head;
    this._filename = tail;
    this._set_state("off");
    this._identity = misc.uuid();
    this._start_time = new Date() - 0;
    this._execute_code_queue = [];
    _jupyter_kernels[this._path] = this;
    const dbg = this.dbg("constructor");
    dbg();
    process.on("exit", this.close);
    if (usage) {
      this._init_usage_monitor();
    }
    this.setMaxListeners(100);
  }

  _set_state(state) {
    // state = 'off' --> 'spawning' --> 'starting' --> 'running' --> 'closed'
    this._state = state;
    return this.emit("state", this._state);
  }

  async spawn(): Promise<void> {
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

    const opts: any = { detached: true, stdio: "ignore" };
    if (this.name.indexOf("sage")) {
      // special environment for sage-based kernels
      opts.env = SAGE_JUPYTER_ENV;
    }
    if (this._directory !== "") {
      opts.cwd = this._directory;
    }
    try {
      this._kernel = await require("spawnteract").launch(this.name, opts);
      await this._create_comm_channels();
    } catch (err) {
      this._set_state("off");
      throw err;
    }
  }

  async _create_comm_channels(): Promise<void> {
    const dbg = this.dbg("channels");
    dbg("now creating channels...");

    this._kernel.spawn.on("error", err => {
      dbg("kernel spawn error", err);
      return this.emit("spawn_error", err);
    });

    this._channels = require("enchannel-zmq-backend").createChannels(
      this._identity,
      this._kernel.config
    );

    this._channels.shell.subscribe(mesg => this.emit("shell", mesg));

    this._channels.stdin.subscribe(mesg => this.emit("stdin", mesg));

    this._channels.iopub.subscribe(mesg => {
      if (mesg.content != null && mesg.content.execution_state != null) {
        this.emit("execution_state", mesg.content.execution_state);
      }
      return this.emit("iopub", mesg);
    });

    this._kernel.spawn.on("close", this.close);

    // so we can start sending code execution to the kernel, etc.
    this._set_state("starting");

    const wait_for_iopub_or_shell = cb => {
      function done() {
        this.removeListener("iopub", done);
        this.removeListener("shell", done);
        cb();
      }
      this.once("iopub", done);
      this.once("shell", done);
    };

    if (this._state === "closed") {
      throw Error("closed");
    }
    await callback(wait_for_iopub_or_shell);

    if (this._state === "closed") {
      throw Error("closed");
    }

    // We have now received an iopub or shell message from the kernel,
    // so kernel has started running.
    dbg("start_running");
    // We still wait a few ms, since otherwise -- especially in testing --
    // the kernel will bizarrely just ignore first input.
    // TODO: I think this a **massive bug** in Jupyter (or spawnteract or ZMQ)...
    await delay(100);
    this._set_state("running");

    /*
    The following is very ugly!  In practice, with testing,
    I've found that some kernels simply
    don't start immediately, and drop early messages.  The only reliable way to
    get things going properly is to just keep trying something (we do the kernel_info
    command) until it works. Only then do we declare the kernel ready for code
    execution, etc.   Probably the jupyter devs never notice this race condition
    bug in ZMQ/Jupyter kernels... or maybe the Python server has a sort of
    accidental work around.
    */
    async function f(): Promise<void> {
      await this.kernel_info();
      if (this._state === "starting") {
        throw Error("still starting");
      }
    }

    await retry_until_success({
      start_delay: 500,
      max_delay: 5000,
      factor: 1.4,
      max_time: 2 * 60000, // long in case of starting many at once --
      // we don't want them to all fail and start
      // again and fail ad infinitum!
      f: f
    });
  }

  signal(signal: string | number): void {
    const dbg = this.dbg("signal");
    const spawn = this._kernel != null ? this._kernel.spawn : undefined;
    const pid = spawn != null ? spawn.pid : undefined;
    dbg(`pid=${pid}, signal=${signal}`);
    if (pid !== undefined) {
      try {
        this._clear_execute_code_queue();
        process.kill(-pid, signal); // negative to kill the process group
      } catch (err) {
        dbg(`error: ${err}`);
      }
    }
  }

  // Get memory/cpu usage e.g. { cpu: 1.154401154402318, memory: 482050048 }
  // If no kernel/pid returns {cpu:0,memory:0}
  async usage(): Promise<{ cpu: number; memory: number }> {
    // Do *NOT* put any logging in here, since it gets called a lot by the usage monitor.
    const spawn = this._kernel != null ? this._kernel.spawn : undefined;
    const pid = spawn != null ? spawn.pid : undefined;
    if (pid !== undefined) {
      return await callback(pidusage.stat)(pid);
    } else {
      return { cpu: 0, memory: 0 };
    }
  }

  // Start a monitor that calls usage periodically.
  // When the usage changes by a certain threshhold from the
  // previous usage, emits a 'usage' event with new values.
  _init_usage_monitor(): void {
    const last_usage = { cpu: 0, memory: 0 };
    const thresh = 0.2; // report any change of at least thresh percent (we always report cpu dropping to 0)
    const interval = 5000; // frequently should be OK, since it just reads /proc filesystem
    this.emit("usage", last_usage);
    const dbg = this.dbg("usage_monitor");
    while (this._state != "closed") {
      await delay(intervals);
      try {
        const usage = await this.usage();
        for (let x of ["cpu", "memory"]) {
          if (
            usage[x] > locals.last_usage[x] * (1 + locals.thresh) ||
            usage[x] < locals.last_usage[x] * (1 - locals.thresh) ||
            (usage[x] === 0 && locals.last_usage[x] > 0)
          ) {
            locals.last_usage = usage;
            this.emit("usage", usage);
            break;
          }
        }
      } catch (e) {
        dbg("err", err, " -- skip");
      }
    }
  }

  close(): void {
    this.dbg("close")();
    if (this._state === "closed") {
      return;
    }
    this.store.close();
    delete this.store;
    this._set_state("closed");
    const kernel = _jupyter_kernels[this._path];
    if (kernel != null && kernel._identity === this._identity) {
      delete _jupyter_kernels[this._path];
    }
    this.removeAllListeners();
    process.removeListener("exit", this.close);
    if (this._kernel != null) {
      if (this._kernel.spawn != null) {
        this._kernel.spawn.removeAllListeners();
      }
      this.signal("SIGKILL"); // kill the process group
      try {
        fs.unlink(this._kernel.connectionFile);
      } catch {
        // ignore
      }
      delete this._kernel;
      delete this._channels;
    }
    if (this._execute_code_queue != null) {
      for (let snippet of this._execute_code_queue) {
        snippet.close();
      }
      delete this._execute_code_queue;
    }
    delete this._kernel_info;
    if (this._kernel_info_cbs != null) {
      for (let cb of this._kernel_info_cbs) {
        cb("closed");
      }
      delete this._kernel_info_cbs;
    }
  }

  dbg(f: any): ((f: any) => void) {
    if (!this._dbg) {
      return function() {};
    } else {
      return this._dbg(
        `jupyter.Kernel('${this.name}',path='${this._path}').${f}`
      );
    }
  }

  _low_level_dbg() {
    // for low level debugging only...
    const f = channel => {
      return this._channels[channel].subscribe(mesg =>
        console.log(channel, mesg)
      );
    };
    for (let channel of ["shell", "iopub", "control", "stdin"]) {
      f(channel);
    }
  }

  async _ensure_running(): Promise<string | undefined> {
    if (this._state === "closed") {
      return "closed";
    }
    if (this._state !== "running") {
      return await this.spawn();
    } else {
      return;
    }
  }

  execute_code(opts) {
    opts = defaults(opts, {
      code: required,
      id: undefined, // optional tag to be used by cancel_execute
      all: false, // if all=true, cb(undefined, [all output messages]); used for testing mainly.
      stdin: undefined, // if given, support stdin prompting; this function will be called
      // as `stdin(options, cb)`, and must then do cb(undefined, 'user input')
      // Here, e.g., options = { password: false, prompt: '' }.
      halt_on_error: true // Clear execution queue if shell returns status:'error', e.g., on traceback
    }); // if all=false, this happens **repeatedly**:  cb(undefined, output message)
    if (this._state === "closed") {
      throw Error("closed");
    }
    if (this._execute_code_queue == null) {
      this._execute_code_queue = [];
    }
    let code = new CodeExecutionEmitter(opts);
    this._execute_code_queue.push(code);
    if (this._execute_code_queue.length === 1) {
      return this._process_execute_code_queue();
    }
  }

  cancel_execute(opts: { id: string }): void {
    if (this._state === "closed") {
      return;
    }
    const dbg = this.dbg(`cancel_execute(id='${opts.id}')`);
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
        if (code.id === opts.id) {
          dbg(`removing entry ${i} from queue`);
          this._execute_code_queue.splice(i, 1);
          code.cancel();
        }
      }
    }
    // if the currently running computation involves this id, send an
    // interrupt signal (that's the best we can do)
    if (this._execute_code_queue[0].id === opts.id) {
      dbg("interrupting running computation");
      this.signal("SIGINT");
    }
  }

  _process_execute_code_queue() {
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
    this._ensure_running(err => {
      if (err) {
        dbg(`error running kernel -- ${err}`);
        for (let code of this._execute_code_queue) {
          code.throw(err);
        }
        return (this._execute_code_queue = []);
      } else {
        dbg("now executing oldest item in queue");
        return this._execute_code(this._execute_code_queue[0]);
      }
    });
  }

  _clear_execute_code_queue() {
    // ensure no future queued up evaluation occurs (currently running
    // one will complete and new executions could happen)
    if (this._state === "closed") {
      return;
    }
    if (this._execute_code_queue == null) {
      return;
    }
    const mesg = { done: true };
    for (let code_execution_emitter of this._execute_code_queue.slice(1)) {
      if (code_execution_emitter.all) {
        code_execution_emitter.execute([mesg]);
      } else {
        code_execution_emitter.execute(mesg);
      }
    }
    return (this._execute_code_queue = []);
  }

  _execute_code(code_execution_emitter: CodeExecutionEmitter) {
    let all_mesgs, g, h, iopub_done, shell_done;
    const dbg = this.dbg(
      `_execute_code('${misc.trunc(code_execution_emitter.code, 15)}')`
    );
    dbg(
      `code='${code_execution_emitter.code}', all=${code_execution_emitter.all}`
    );
    if (this._state === "closed") {
      code_execution_emitter.close();
      return;
    }

    const message = {
      header: {
        msg_id: `execute_${misc.uuid()}`,
        username: "",
        session: "",
        msg_type: "execute_request",
        version: "5.0"
      },
      content: {
        code: code_execution_emitter.code,
        silent: false,
        store_history: true, // so execution_count is updated.
        user_expressions: {},
        allow_stdin: code_execution_emitter.stdin != null
      }
    };

    // setup handling of the results
    if (code_execution_emitter.all) {
      all_mesgs = [];
    }

    let f = (g = h = shell_done = iopub_done = undefined);

    const push_mesg = mesg => {
      // TODO: mesg isn't a normal javascript object; it's **silently** immutable, which
      // is pretty annoying for our use. For now, we just copy it, which is a waste.
      const msg_type = mesg.header != null ? mesg.header.msg_type : undefined;
      mesg = misc.copy_with(mesg, ["metadata", "content", "buffers", "done"]);
      mesg = misc.deep_copy(mesg);
      mesg.msg_type = msg_type;
      if (code_execution_emitter.all) {
        all_mesgs.push(mesg);
      } else {
        code_execution_emitter.execute(mesg);
      }
    };

    if (code_execution_emitter.stdin != null) {
      g = mesg => {
        dbg(`STDIN kernel --> server: ${JSON.stringify(mesg)}`);
        if (mesg.parent_header.msg_id !== message.header.msg_id) {
          dbg(
            `STDIN msg_id mismatch: ${mesg.parent_header.msg_id}!=${
              message.header.msg_id
            }`
          );
          return;
        }

        code_execution_emitter.request_stdin(mesg.content, (err, response) => {
          dbg(`STDIN client --> server ${err}, ${JSON.stringify(response)}`);
          if (err) {
            response = `ERROR -- ${err}`;
          }
          const m = {
            parent_header: message.header,
            header: {
              msg_id: misc.uuid(), // message.header.msg_id
              username: "",
              session: "",
              msg_type: "input_reply",
              version: "5.2"
            },
            content: {
              value: response
            }
          };
          dbg(`STDIN server --> kernel: ${JSON.stringify(m)}`);
          this._channels.stdin.next(m);
        });
      };

      this.on("stdin", g);
    }

    h = mesg => {
      if (mesg.parent_header.msg_id !== message.header.msg_id) {
        return;
      }
      dbg(`got SHELL message -- ${JSON.stringify(mesg)}`);
      if (
        (mesg.content != null ? mesg.content.status : undefined) === "error"
      ) {
        if (code_execution_emitter.halt_on_error) {
          this._clear_execute_code_queue();
        }
        // just bail; actual error would have been reported on iopub channel, hopefully.
        return typeof finish === "function" ? finish() : undefined;
      } else {
        push_mesg(mesg);
        shell_done = true;
        if (iopub_done && shell_done) {
          return typeof finish === "function" ? finish() : undefined;
        }
      }
    };

    this.on("shell", h);

    f = mesg => {
      if (mesg.parent_header.msg_id !== message.header.msg_id) {
        return;
      }
      dbg(`got IOPUB message -- ${JSON.stringify(mesg)}`);

      // check this before giving code_execution_emitter.cb the chance to mutate.
      iopub_done =
        (mesg.content != null ? mesg.content.execution_state : undefined) ===
        "idle";

      push_mesg(mesg);

      if (iopub_done && shell_done) {
        return typeof finish === "function" ? finish() : undefined;
      }
    };

    this.on("iopub", f);

    var finish = () => {
      if (f != null) {
        this.removeListener("iopub", f);
      }
      if (g != null) {
        this.removeListener("stdin", g);
      }
      if (h != null) {
        this.removeListener("shell", h);
      }
      this._execute_code_queue.shift(); // finished
      this._process_execute_code_queue(); // start next exec
      push_mesg({ done: true });
      if (code_execution_emitter.all) {
        code_execution_emitter.execute(all_mesgs);
      }
      finish = undefined;
    };

    dbg("send the message");
    this._channels.shell.next(message);
  }

  process_output(content) {
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

    for (let type of util.JUPYTER_MIMETYPES) {
      if (content.data[type] != null) {
        if (type.split("/")[0] === "image" || type === "application/pdf") {
          content.data[type] = blob_store.save(content.data[type], type);
        } else if (
          type === "text/html" &&
          iframe.is_likely_iframe(content.data[type])
        ) {
          // Likely iframe, so we treat it as such.  This is very important, e.g.,
          // because of Sage's JMOL-based 3d graphics.  These are huge, so we have to parse
          // and remove these and serve them from the backend.
          //  {iframe: sha1 of srcdoc}
          content.data["iframe"] = iframe.process(
            content.data[type],
            blob_store
          );
          delete content.data[type];
        }
      }
    }
  }

  // Returns a reference to the blob store.
  get_blob_store() {
    return blob_store;
  }

  // Returns information about all available kernels
  async get_kernel_data(): Promise<any> {
    // cb(err, kernel_data)  # see below.
    return await get_kernel_data();
  }

  async call(msg_type: string, content?: any): Promise<any> {
    await this._ensure_running();

    // Do a paranoid double check anyways...
    if (this._channels == null) {
      throw Error("not running (no channels defined)");
    }

    const message = {
      content,
      header: {
        msg_id: misc.uuid(),
        username: "",
        session: "",
        msg_type: opts.msg_type,
        version: "5.0" // TODO: increase this?
      }
    };

    // Send the message
    this._channels.shell.next(message);

    // Wait for the response that has the right msg_id.
    let the_mesg: any = undefined;
    const wait_for_response = cb => {
      var f = mesg => {
        if (mesg.parent_header.msg_id === message.header.msg_id) {
          this.removeListener("shell", f);
          mesg = misc.deep_copy(mesg.content);
          if (misc.len(mesg.metadata) === 0) {
            delete mesg.metadata;
          }
          the_mesg = mesg;
          cb();
        }
      };
      this.on("shell", f);
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
      `code='${opts.code}', cursor_pos='${opts.cursor_pos}', detail_level=${
        opts.detail_level
      }`
    );
    return await this.call("inspect_request", opts);
  }

  async kernel_info(): Promise<any> {
    if (this._kernel_info != null) {
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

  more_output(id: string): any[] {
    if (id == null) {
      throw new Error("must specify id");
    }
    if (this._actions == null) {
      throw new Error("must have redux actions");
    }
    return this._actions.store.get_more_output(id) || [];
  }

  async nbconvert(args: string[], timeout?: number): Promise<string> {
    if (timeout === undefined) {
      timeout = 30; // seconds
    }
    if (this._nbconvert_lock) {
      throw new Error("lock");
    }
    if (!misc.is_array(args)) {
      throw new Error("args must be an array");
    }
    this._nbconvert_lock = true;
    const args = misc.copy(args);
    args.push("--");
    args.push(this._filename);
    try {
      return await nbconvert({
        args,
        timeout,
        directory: this._directory
      });
    } catch (err) {
      delete this._nbconvert_lock;
      throw err;
    }
  }

  // TODO: double check this
  // returns sha1
  async load_attachment(path: string): Promise<string> {
    const dbg = this.dbg("load_attachment");
    dbg(`path='${path}'`);
    if (path[0] !== "/") {
      path = process.env.HOME + "/" + path;
    }
    try {
      return await retry_until_success({
        // TODO: fix when blobstore is async-d
        f: callback(blob_store.readFile)(path, "base64"),
        max_time: 30000
      });
    } catch (err) {
      fs.unlink(path); // TODO: think through again if this is the right thing to do.
      throw err;
    }
  }

  process_attachment(base64, mime) {
    return blob_store.save(base64, mime);
  }

  http_server(opts) {
    opts.jupyter = this;
    http_server(opts);
  }
}
