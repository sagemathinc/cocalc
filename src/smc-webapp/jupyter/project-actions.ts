/*
project-actions: additional actions that are only available in the
backend/project, which "manages" everything.

This code should not *explicitly* require anything that is only
available in the project or requires node to run, so that we can
fully unit test it via mocking of components.
*/

import * as immutable from "immutable";
import { JupyterActions as JupyterActions0 } from "./actions";

const { callback2, once } = require("smc-util/async-utils");

const async = require("async");
const underscore = require("underscore");
const misc = require("smc-util/misc");
const json_stable = require("json-stable-stringify");
const { OutputHandler } = require("./output-handler");

export class JupyterActions extends JupyterActions0 {
  // TODO: type
  private _backend_state: any;
  private _initialize_manager_already_done: any;
  private _kernel_state: any;
  private _last_save_ipynb_file: any;
  private _manager_run_cell_queue: any;
  private _run_nbconvert_lock: any;
  private _running_cells: any;
  private _throttled_ensure_positions_are_unique: any;

  set_backend_state = (state: any) => {
    /*
        The backend states, which are put in the syncdb so clients
        can display this:

         - 'init' -- the backend is checking the file on disk, etc.
         - 'ready' -- the backend is setup and ready to use; kernel isn't running though
         - 'starting' -- the kernel itself is actived and currently starting up (e.g., Sage is starting up)
         - 'running' -- the kernel is running and ready to evaluate code


         'init' --> 'ready'  --> 'spawning' --> 'starting' --> 'running'
                     /|\                                        |
                      |-----------------------------------------|

        Going from ready to starting happens when a code execution is requested.
        */
    if (
      ["init", "ready", "spawning", "starting", "running"].indexOf(state) === -1
    ) {
      throw Error(`invalid backend state '${state}'`);
    }
    this._backend_state = state;
    this._set({
      type: "settings",
      backend_state: state
    });
    this.save_asap();
  };

  set_kernel_state = (state: any, save = false) => {
    this._kernel_state = state;
    return this._set({ type: "settings", kernel_state: state }, save);
  };

  set_kernel_usage = (usage: any) => {
    return this._set({ type: "settings", kernel_usage: usage });
  };

  // Called exactly once when the manager first starts up after the store is initialized.
  // Here we ensure everything is in a consistent state so that we can react
  // to changes later.
  initialize_manager = async () => {
    console.log("INITIALIZING MANAGER");
    if (this._initialize_manager_already_done) {
      console.log("DONE");
      return;
    }
    this._initialize_manager_already_done = true;

    const dbg = this.dbg("initialize_manager");
    dbg();
    let cells = this.store.get("cells");
    if (cells != null) {
      cells = cells.toJS();
    }
    dbg(`cells at manage_init = ${JSON.stringify(cells)}`);

    this.sync_exec_state = underscore.debounce(this.sync_exec_state, 2000);
    this._throttled_ensure_positions_are_unique = underscore.debounce(
      this.ensure_positions_are_unique,
      5000
    );

    //dbg("syncdb='#{JSON.stringify(@syncdb.get().toJS())}'")

    this.setState({
      // used by jupyter.ts
      start_time: this._client.server_time() - 0
    });
    this.syncdb.delete({ type: "nbconvert" });
    // clear on init, since can't be running yet

    // Initialize info about available kernels
    this.init_kernel_info();

    // We try once to load from disk.  If it fails, then
    // a record with type:'fatal'
    // is created in the database; if it succeeds, that record is deleted.
    // Try again only when the file changes.
    await this._first_load();

    // Listen for changes...
    this.syncdb.on("change", this._backend_syncdb_change);
  };

  _first_load = async () => {
    const dbg = this.dbg("_first_load");
    dbg("doing load");
    try {
      await this._load_from_disk_if_newer();
    } catch (err) {
      dbg(`load failed -- ${err}; wait for file change and try again`);
      const path = this.store.get("path");
      const watcher = this._client.watch_file({ path });
      await once(watcher, "change");
      dbg("file changed");
      watcher.close();
      await this._first_load();
      return;
    }
    dbg("loading worked");
    this._init_after_first_load();
  };

  _init_after_first_load = () => {
    const dbg = this.dbg("_init_after_first_load");

    dbg("initializing");
    this.set_backend_state("init");

    this.ensure_backend_kernel_setup(); // this may change the syncdb.

    this.init_file_watcher();

    this._state = "ready";
    this.ensure_there_is_a_cell();
  };

  _backend_syncdb_change = (changes: any) => {
    const dbg = this.dbg("_backend_syncdb_change");
    if (changes != null) {
      changes.forEach(key => {
        switch (key.get("type")) {
          case "settings":
            dbg("settings change");
            var record = this.syncdb.get_one(key);
            if (record != null) {
              // ensure kernel is properly configured
              this.ensure_backend_kernel_setup();
              // only the backend should change kernel and backend state;
              // however, our security model allows otherwise (e.g., via TimeTravel).
              if (
                record.get("kernel_state") !== this._kernel_state &&
                this._kernel_state != null
              ) {
                this.set_kernel_state(this._kernel_state, true);
              }
              if (
                record.get("backend_state") !== this._backend_state &&
                this._backend_state != null
              ) {
                this.set_backend_state(this._backend_state);
              }
            }
            break;
          case "nbconvert":
            this.nbconvert_change();
            break;
        }
      });
    }

    this.ensure_there_is_a_cell();
    this._throttled_ensure_positions_are_unique();
    this.sync_exec_state();
  };

  // ensure_backend_kernel_setup ensures that we have a connection
  // to the proper type of kernel.
  // If running is true, starts the kernel and waits until running.
  ensure_backend_kernel_setup = () => {
    const dbg = this.dbg("ensure_backend_kernel_setup");
    const kernel = this.store.get("kernel");
    if (kernel == null) {
      dbg("no kernel set -- can't do anything");
      return;
    }

    let current: string | undefined = undefined;
    if (this._jupyter_kernel != null) {
      current = this._jupyter_kernel.name;
      if (current === kernel && this._jupyter_kernel.get_state() != "closed") {
        dbg("everything is properly setup and working");
        return;
      }
    }

    dbg(`kernel='${kernel}', current='${current}'`);

    if (
      this._jupyter_kernel != null &&
      this._jupyter_kernel.get_state() != "closed"
    ) {
      if (current != kernel) {
        dbg("kernel changed -- kill running kernel to trigger switch");
        this._jupyter_kernel.close();
        return;
      } else {
        dbg("nothing to do");
        return;
      }
    }

    dbg("make a new kernel");

    // No kernel wrapper object setup at all. Make one.
    this._jupyter_kernel = this._client.jupyter_kernel({
      name: kernel,
      path: this.store.get("path"),
      actions: this
    });

    if (this._jupyter_kernel == null) {
      // to satisfy compiler.
      throw Error("Jupter kernel must be defined");
    }

    // Since we just made a new kernel, clearly no cells are running on the backend.
    this._running_cells = {};
    this.clear_all_cell_run_state();

    // When the kernel closes, make sure a new kernel gets setup.
    this._jupyter_kernel.once("closed", () => {
      dbg("kernel closed -- make new one.");
      this.ensure_backend_kernel_setup();
    });

    // Track backend state changes other than closing, so they
    // are visible to user etc.
    // TODO: all these need to move to ephemeral table!!
    this._jupyter_kernel.on("state", state => {
      switch (state) {
        case "spawning":
        case "starting":
        case "running":
          return this.set_backend_state(state);
      }
    });

    this._jupyter_kernel.on("execution_state", this.set_kernel_state);

    this._jupyter_kernel.on("spawn_error", err => {
      // TODO: need to save so gets reported to frontend...
      dbg(`error: ${err}`);
    });

    this._jupyter_kernel.on("usage", this.set_kernel_usage);

    this.handle_all_cell_attachments();
    this.set_backend_state("ready");
    if (current == null || current !== kernel) {
      // Only set backend info if first time or kernel changed.
      // Otherwise, just stopping the kernel will start it running
      // again just to get this info.
      this.set_backend_kernel_info();
    }
  };

  init_kernel_info = async () => {
    let kernels = this.store.get("kernels");
    if (kernels != null) {
      return;
    }
    const dbg = this.dbg("init_kernel_info");
    dbg("getting");
    try {
      kernels = await this._client.jupyter_kernel_info();
      dbg("success");
    } catch (err) {
      dbg(`FAILED to get kernel info: ${err}`);
      // TODO: what to do??  Saving will be broken...
      return;
    }
    this.setState({
      kernels: immutable.fromJS(kernels)
    });
  };

  ensure_backend_kernel_is_running = async () => {
    const dbg = this.dbg("ensure_backend_kernel_is_running");
    if (this._backend_state == "ready") {
      dbg("in state 'ready', so kick it into gear");
      await this.set_backend_kernel_info();
      dbg("done getting kernel info");
    }
    const is_running = (s): boolean => {
      if (this._state === "closed") return true;
      const t = s.get_one({ type: "settings" });
      if (t == null) {
        dbg("no settings");
        return false;
      } else {
        const state = t.get("backend_state");
        dbg(`state = ${state}`);
        return state == "running";
      }
    };
    await this.syncdb.wait(is_running, 60);
  };

  // manager_on_cell_change is called after a cell change has been
  // incorporated into the store by _syncdb_cell_change.
  // It ensures any cell with a compute request
  // gets computed,    Only one client -- the project itself -- will run this code.
  manager_on_cell_change = (id: any, new_cell: any, old_cell: any) => {
    const dbg = this.dbg(`manager_on_cell_change(id='${id}')`);
    dbg(
      `new_cell='${misc.to_json(
        new_cell != null ? new_cell.toJS() : undefined
      )}',old_cell='${misc.to_json(
        old_cell != null ? old_cell.toJS() : undefined
      )}')`
    );

    if (
      (new_cell != null ? new_cell.get("state") : undefined) === "start" &&
      (old_cell != null ? old_cell.get("state") : undefined) !== "start"
    ) {
      this.manager_run_cell_enqueue(id);
      return;
    }

    if (
      (new_cell != null ? new_cell.get("attachments") : undefined) != null &&
      new_cell.get("attachments") !==
        (old_cell != null ? old_cell.get("attachments") : undefined)
    ) {
      return this.handle_cell_attachments(new_cell);
    }
  };

  // Ensure that the cells listed as running *are* exactly the
  // ones actually running or queued up to run.
  sync_exec_state = () => {
    const dbg = this.dbg("sync_exec_state");
    let change = false;
    const cells = this.store.get("cells");
    // First verify that all actual cells that are said to be running
    // (according to the store) are in fact running.
    if (cells != null) {
      cells.forEach((cell, id) => {
        const state = cell.get("state");
        if (
          state != null &&
          state !== "done" &&
          !(this._running_cells != null ? this._running_cells[id] : undefined)
        ) {
          dbg(`set cell ${id} to done`);
          this._set({ type: "cell", id, state: "done" }, false);
          change = true;
        }
      });
    }
    if (this._running_cells != null) {
      const cells = this.store.get("cells");
      // Next verify that every cell actually running is still in the document
      // and listed as running.  TimeTravel, deleting cells, etc., can
      // certainly lead to this being necessary.
      for (let id in this._running_cells) {
        const state = cells.getIn([id, "state"]);
        if (state == null || state === "done") {
          // cell no longer exists or isn't in a running state
          dbg(`tell kernel to not run ${id}`);
          this._cancel_run(id);
        }
      }
    }
    if (change) {
      return this._sync();
    }
  };

  _cancel_run = (id: any) => {
    const dbg = this.dbg(`_cancel_run ${id}`);
    // All these checks are so we only cancel if it is actually running
    // with the current kernel...
    if (this._running_cells == null || this._jupyter_kernel == null) return;
    const identity = this._running_cells[id];
    if (identity == null) return;
    if (this._jupyter_kernel.identity == identity) {
      dbg("cancelling")
      this._jupyter_kernel.cancel_execute(id);
    } else {
      dbg("not canceling since wrong identity");
    }
  };

  // Note that there is a request to run a given cell.
  // You must call manager_run_cell_process_queue for them to actually start running.
  manager_run_cell_enqueue = (id: any) => {
    if (this._running_cells != null ? this._running_cells[id] : undefined) {
      return;
    }
    if (this._manager_run_cell_queue == null) {
      this._manager_run_cell_queue = {};
    }
    this._manager_run_cell_queue[id] = true;
  };

  // properly start running -- in order -- the cells that have been requested to run
  manager_run_cell_process_queue = () => {
    if (this._manager_run_cell_queue == null) {
      return;
    }
    const v: any[] = [];
    for (let id in this._manager_run_cell_queue) {
      if (
        !(this._running_cells != null ? this._running_cells[id] : undefined)
      ) {
        v.push(this.store.getIn(["cells", id]));
      }
    }
    v.sort((a, b) =>
      misc.cmp(
        a != null ? a.get("start") : undefined,
        b != null ? b.get("start") : undefined
      )
    );
    // dbg = @dbg("manager_run_cell_process_queue")
    // dbg("running: #{misc.to_json( ([a?.get('start'), a?.get('id')] for a in v) )}")
    for (let cell of v) {
      if (cell != null) {
        this.manager_run_cell(cell.get("id"));
      }
    }
    delete this._manager_run_cell_queue;
  };

  // returns new output handler for this cell.
  _output_handler = (cell: any) => {
    const dbg = this.dbg(`handler(id='${cell.id}')`);
    if (
      this._jupyter_kernel == null ||
      this._jupyter_kernel.get_state() == "closed"
    ) {
      throw Error("jupyter kernel must exist and not be closed;");
    }
    this.reset_more_output(cell.id);

    const handler = new OutputHandler({
      cell,
      max_output_length: this.store.get("max_output_length"),
      report_started_ms: 250,
      dbg
    });

    this._jupyter_kernel.once("closed", () => {
      dbg("closing due to jupyter kernel closed");
      handler.close();
    });

    handler.on("more_output", (mesg, mesg_length) => {
      return this.set_more_output(cell.id, mesg, mesg_length);
    });

    handler.on("process", mesg => {
      if (
        this._jupyter_kernel != null &&
        this._jupyter_kernel.get_state() == "running"
      ) {
        this._jupyter_kernel.process_output(mesg);
      }
    });

    return handler;
  };

  manager_run_cell = async (id: string) => {
    let left;
    const dbg = this.dbg(`manager_run_cell(id='${id}')`);
    dbg(JSON.stringify(misc.keys(this._running_cells)));

    // INITIAL STATE THAT MUST BE DONE BEFORE ANYTHING ASYNC!

    if (this._running_cells == null) {
      this._running_cells = {};
    }

    if (this._running_cells[id]) {
      dbg("cell already queued to run in kernel");
      return;
    }

    // END INITIAL STATE BEFORE ASYNC.

    this.ensure_backend_kernel_setup();


    try {
      await this.ensure_backend_kernel_is_running();
      if (this._state == 'closed') return;
    } catch (err) {
      // if this fails, give up on this evaluation.
      return;
    }

    const orig_cell = this.store.get("cells").get(id);
    if (orig_cell == null) {
      // nothing to do -- cell deleted
      return;
    }

    const input = ((left = orig_cell.get("input")) != null ? left : "").trim();

    if (this._jupyter_kernel == null) {
      throw Error("bug -- this is guaranteed by the above");
    }
    this._running_cells[id] = this._jupyter_kernel.identity;

    const cell: any = {
      id,
      type: "cell",
      kernel: this.store.get("kernel")
    };

    dbg(`using max_output_length=${this.store.get("max_output_length")}`);
    const handler = this._output_handler(cell);

    handler.on("change", save => {
      if (!this.store.getIn(["cells", id])) {
        // The cell was deleted, but we just got some output
        // NOTE: client shouldn't allow deleting running or queued
        // cells, but we still want to do something useful/sensible.
        // We put cell back where it was with same input.
        cell.input = orig_cell.get("input");
        cell.pos = orig_cell.get("pos");
      }
      this.syncdb.set(cell);
      if (save) {
        this.syncdb.save();
      }
    });

    handler.once("done", () => {
      dbg("handler is done");
      this.store.removeListener("cell_change", cell_change);
      exec.close();
      if (this._running_cells != null) {
        delete this._running_cells[id];
      }
    });

    if (this._jupyter_kernel == null) {
      handler.error("Unable to start Jupyter");
      return;
    }

    const get_password = (): string => {
      if (this._jupyter_kernel == null) {
        dbg("get_password", id, "no kernel");
        return "";
      }
      const password = this._jupyter_kernel.store.get(id);
      dbg("get_password", id, password);
      this._jupyter_kernel.store.delete(id);
      return password;
    };

    // This is used only for stdin right now.
    const cell_change = (cell_id, new_cell) => {
      if (id === cell_id) {
        dbg("cell_change");
        handler.cell_changed(new_cell, get_password);
      }
    };
    this.store.on("cell_change", cell_change);

    const exec = this._jupyter_kernel.execute_code({
      code: input,
      id,
      stdin: handler.stdin
    });

    exec.on("output", mesg => {
      dbg(`got mesg='${JSON.stringify(mesg)}'`);
      if (mesg == null) {
        // can't possibly happen, of course.
        let err = "empty mesg";
        dbg(`got error='${err}'`);
        handler.error(err);
        return;
      }
      if (mesg.done) {
        // done is a special internal cocalc message.
        handler.done();
        return;
      }
      if (mesg.msg_type === "clear_output") {
        handler.clear(mesg.content.wait);
        return;
      }
      if (mesg.content.execution_state === "idle") {
        this.store.removeListener("cell_change", cell_change);
        return;
      }
      if (mesg.content.execution_state === "busy") {
        handler.start();
      }
      if (mesg.content.payload != null) {
        if (
          (mesg.content.payload != null
            ? mesg.content.payload.length
            : undefined) > 0
        ) {
          // payload shell message:
          // Despite https://ipython.org/ipython-doc/3/development/messaging.html#payloads saying
          // ""Payloads are considered deprecated, though their replacement is not yet implemented."
          // we fully have to implement them, since they are used to implement (crazy, IMHO)
          // things like %load in the python2 kernel!
          return mesg.content.payload.map(p => handler.payload(p));
        }
      } else {
        // Normal iopub output message
        return handler.message(mesg.content);
      }
    });
    exec.on("error", err => {
      dbg(`got error='${err}'`);
      handler.error(err);
    });
  };

  reset_more_output = (id: any) => {
    if (id == null) {
      delete this.store._more_output;
    }
    if (
      (this.store._more_output != null
        ? this.store._more_output[id]
        : undefined) != null
    ) {
      return delete this.store._more_output[id];
    }
  };

  set_more_output = (id: any, mesg: any, length: any) => {
    if (this.store._more_output == null) {
      this.store._more_output = {};
    }
    const output =
      this.store._more_output[id] != null
        ? this.store._more_output[id]
        : (this.store._more_output[id] = {
            length: 0,
            messages: [],
            lengths: [],
            discarded: 0,
            truncated: 0
          });

    output.length += length;
    output.lengths.push(length);
    output.messages.push(mesg);

    const goal_length = 10 * this.store.get("max_output_length");
    const result: any[] = [];
    while (output.length > goal_length) {
      let need: any;
      let did_truncate = false;

      // check if there is a text field, which we can truncate
      let len =
        output.messages[0].text != null
          ? output.messages[0].text.length
          : undefined;
      if (len != null) {
        need = output.length - goal_length + 50;
        if (len > need) {
          // Instead of throwing this message away, let's truncate its text part.  After
          // doing this, the message is at least need shorter than it was before.
          output.messages[0].text = misc.trunc(
            output.messages[0].text,
            len - need
          );
          did_truncate = true;
        }
      }

      // check if there is a text/plain field, which we can thus also safely truncate
      if (!did_truncate && output.messages[0].data != null) {
        for (let field in output.messages[0].data) {
          const val = output.messages[0].data[field];
          if (field === "text/plain") {
            len = val.length;
            if (len != null) {
              need = output.length - goal_length + 50;
              if (len > need) {
                // Instead of throwing this message away, let's truncate its text part.  After
                // doing this, the message is at least need shorter than it was before.
                output.messages[0].data[field] = misc.trunc(val, len - need);
                did_truncate = true;
              }
            }
          }
        }
      }

      if (did_truncate) {
        const new_len = JSON.stringify(output.messages[0]).length;
        output.length -= output.lengths[0] - new_len; // how much we saved
        output.lengths[0] = new_len;
        output.truncated += 1;
        break;
      }

      const n = output.lengths.shift();
      output.messages.shift();
      output.length -= n;
      result.push((output.discarded += 1));
    }
    return result;
  };

  init_file_watcher = () => {
    const dbg = this.dbg("file_watcher");
    dbg();
    this._file_watcher = this._client.watch_file({
      path: this.store.get("path"),
      interval: 3000,
      debounce: 1500
    });

    this._file_watcher.on("change", () => {
      dbg("change");
      if (new Date().getTime() - this._last_save_ipynb_file <= 10000) {
        // Guard against reacting to saving file to disk, which would
        // be inefficient and could lead to corruption.
        return;
      }
      this.load_ipynb_file();
    });
    //@_sync_file_mode()

    return this._file_watcher.on("delete", () => {
      return dbg("delete");
    });
  };

  /*
    * Unfortunately, though I spent two hours on this approach... it just doesn't work,
    * since, e.g., if the sync file doesn't already exist, it can't be created,
    * which breaks everything.  So disabling for now and re-opening the issue.
    _sync_file_mode: =>
        dbg = @dbg("_sync_file_mode"); dbg()
        * Make the mode of the syncdb file the same as the mode of the .ipynb file.
        * This is used for read-only status.
        ipynb_file  = @store.get('path')
        locals =
            ipynb_file_ro  : undefined
            syncdb_file_ro : undefined
        syncdb_file = @syncdb.get_path()
        async.parallel([
            (cb) ->
                fs.access ipynb_file, fs.constants.W_OK, (err) ->
                    * Also store in @_ipynb_file_ro to prevent starting kernel in this case.
                    @_ipynb_file_ro = locals.ipynb_file_ro = !!err
                    cb()
            (cb) ->
                fs.access syncdb_file, fs.constants.W_OK, (err) ->
                    locals.syncdb_file_ro = !!err
                    cb()
        ], ->
            if locals.ipynb_file_ro == locals.syncdb_file_ro
                return
            dbg("mode change")
            async.parallel([
                (cb) ->
                    fs.stat ipynb_file, (err, stats) ->
                        locals.ipynb_stats = stats
                        cb(err)
                (cb) ->
                    * error if syncdb_file doesn't exist, which is GOOD, since
                    * in that case we do not want to chmod which would create
                    * that file as empty and blank it.
                    fs.stat(syncdb_file, cb)
            ], (err) ->
                if not err
                    dbg("changing syncb mode to match ipynb mode")
                    fs.chmod(syncdb_file, locals.ipynb_stats.mode)
                else
                    dbg("error stating ipynb", err)
            )
        )
    */

  _load_from_disk_if_newer = async () => {
    const dbg = this.dbg("load_from_disk_if_newer");
    // Get ctime of last .ipynb file that we explicitly saved.

    // TODO: breaking the syncdb typescript data hiding.  The
    // right fix will be to move
    // this info to a new ephemeral state table.
    const last_ipynb_save = (this.syncdb as any).syncstring_table
      .get_one()
      .getIn(["save", "last_ipynb_save"], 0);

    dbg(`syncdb last_ipynb_save=${last_ipynb_save}`);
    const path = this.store.get("path");
    let stats;
    try {
      stats = await callback2(this._client.path_stat, { path });
      dbg(`stats.ctime = ${stats.ctime}`);
    } catch (err) {
      // This err just means the file doesn't exist.
      // We set the 'last load' to now in this case, since
      // the frontend clients need to know that we
      // have already scanned the disk.
      this.set_last_load();
      return;
    }
    const file_changed = stats.ctime.getTime() !== last_ipynb_save;
    if (file_changed) {
      dbg(".ipynb disk file changed since last load, so loading");
      await this.load_ipynb_file();
    } else {
      dbg(".ipynb disk file NOT changed since last load, so NOT loading");
    }
  };

  set_last_load = () => {
    this.syncdb.set({
      type: "file",
      last_load: new Date().getTime()
    });
    this.syncdb.commit();
  };

  /* Determine timestamp of aux .ipynb file, and record it here,
     so we know that we do not have to load exactly that file
     back from disk. */
  set_last_ipynb_save = async () => {
    let stats;
    try {
      stats = await callback2(this._client.path_stat, {
        path: this.store.get("path")
      });
    } catch (err) {
      // no-op -- nothing to do.
      this.dbg("set_last_ipynb_save")(`error ${err}`);
      return;
    }

    // This is ugly (i.e., how we get access), but I need to get this done.
    // This is the RIGHT place to save the info though.
    // TODO: move this state info to new ephemeral table.
    (this.syncdb as any).set_save({ last_ipynb_save: stats.ctime.getTime() });
  };

  load_ipynb_file = async () => {
    /*
    Read the ipynb file from disk.  Fully use the ipynb file to
    set the syncdb's state.  We do this when opening a new file, or when
    the file changes on disk (e.g., a git checkout or something).
    */
    const dbg = this.dbg(`load_ipynb_file`);
    dbg("reading file");
    const path = this.store.get("path");
    let content: string;
    try {
      content = await callback2(this._client.path_read, {
        path,
        maxsize_MB: 50
      });
    } catch (err) {
      const error = `Error reading ipynb file '${path}': ${err.toString()}.  Fix this to continue.`;
      this.syncdb.set({ type: "fatal", error });
      throw Error(error);
    }
    if (content.length === 0) {
      // Blank file, e.g., when creating in CoCalc.
      // This is good, works, etc. -- just clear state, including error.
      this.syncdb.delete();
      this.set_last_load();
      return;
    }

    // File is nontrivial -- parse and load.
    let parsed_content;
    try {
      parsed_content = JSON.parse(content);
    } catch (err) {
      const error = `Error parsing the ipynb file '${path}': ${err}.  You must fix the ipynb file somehow before continuing.`;
      dbg(error);
      this.syncdb.set({ type: "fatal", error });
      throw Error(error);
    }
    this.syncdb.delete({ type: "fatal" });
    this.set_to_ipynb(parsed_content);
    this.set_last_load();
  };

  save_ipynb_file = (cb?: any) => {
    let err;
    const dbg = this.dbg("save_ipynb_file");
    dbg("saving to file");
    if (this._jupyter_kernel == null) {
      err = "no kernel so cannot save";
      dbg(err);
      if (typeof cb === "function") {
        cb(err);
      }
      return;
    }
    if (this.store.get("kernels") == null) {
      err = "kernel info not known, so can't save";
      dbg(err);
      if (typeof cb === "function") {
        cb(err);
      }
      return;
    }
    dbg("going to try to save");
    const ipynb = this.store.get_ipynb(this._jupyter_kernel.get_blob_store());
    // We use json_stable (and indent 1) to be more diff friendly to user, and more consistent
    // with official Jupyter.
    const data = json_stable(ipynb, { space: 1 });
    if (data == null) {
      err = "ipynb not defined yet; can't save";
      dbg(err);
      if (typeof cb === "function") {
        cb(err);
      }
      return;
    }
    //dbg("got string version '#{data}'")
    this._client.write_file({
      path: this.store.get("path"),
      data,
      cb: err => {
        if (err) {
          // TODO: need way to report this to frontend
          dbg(`error writing file: ${err}`);
        } else {
          dbg("succeeded at saving");
          this._last_save_ipynb_file = new Date();
          this.set_last_ipynb_save();
        }
        return typeof cb === "function" ? cb(err) : undefined;
      }
    });
  };

  ensure_there_is_a_cell = () => {
    if (this._state !== "ready") {
      return;
    }
    const cells = this.store.get("cells");
    if (cells == null || cells.size === 0) {
      this._set({
        type: "cell",
        id: this._new_id(),
        pos: 0,
        input: ""
      });
      // We are obviously contributing all content to this notebook.
      return this.set_trust_notebook(true);
    }
  };

  nbconvert_change = (old_val?: any, new_val?: any) => {
    /*
        Client sets this:
            {type:'nbconvert', args:[...], state:'start'}

        Then:
         1. All clients show status bar that export is happening.
         2. Commands to export are disabled during export.
         3. Unless timeout (say 3 min?) exceeded.

        - Project sees export entry in table.  If currently exporting, does nothing.
        If not exporting, starts exporting and sets:

             {type:'nbconvert', args:[...], state:'run', start:[time in ms]}

        - When done, project sets

             {type:'nbconvert', args:[...], state:'done'}

        - If error, project stores the error in the key:value store and sets:

             {type:'nbconvert', args:[...], state:'done', error:'message' or {key:'xlkjdf'}}
        */
    const dbg = this.dbg("run_nbconvert");
    dbg(
      `${misc.to_json(
        old_val != null ? old_val.toJS() : undefined
      )} --> ${misc.to_json(new_val != null ? new_val.toJS() : undefined)}`
    );
    // TODO - e.g. clear key:value store
    if (new_val == null) {
      dbg("delete nbconvert, so stop");
      return;
    }
    if (new_val.get("state") === "start") {
      if (this._run_nbconvert_lock) {
        dbg("ignoring state change to start, since already running.");
        // this could only happen with a malicious client (or bug, of course)?
        return;
      }
      let args = new_val.get("args");
      // TODO: is this guard necessary?
      if (args != null && typeof args.toJS === "function") {
        args = args.toJS();
      }
      if (!misc.is_array(args)) {
        dbg("invalid args");
        this.syncdb.set({
          type: "nbconvert",
          state: "done",
          error: "args must be an array"
        });
        return;
      }
      dbg("starting running");
      this.syncdb.set({
        type: "nbconvert",
        state: "run",
        start: new Date().getTime(),
        error: null
      });
      this.ensure_backend_kernel_setup();
      this._run_nbconvert_lock = true;
      return async.series(
        [
          cb => {
            dbg("saving file to disk first");
            this.save_ipynb_file(cb);
          },
          cb => {
            dbg("now actually running nbconvert");
            if (this._jupyter_kernel == null) {
              cb("jupyter kernel not defined");
            } else {
              this._jupyter_kernel
                .nbconvert(args)
                .then(data => cb(undefined, data))
                .catch(err => cb(err));
            }
          }
        ],
        err => {
          dbg("finished running; removing lock");
          this._run_nbconvert_lock = false;
          if (!err) {
            err = null;
          }
          if (err) {
            dbg("error running");
            if (!misc.is_string(err)) {
              err = `${err}`;
            }
            if (err.length >= 50) {
              // save in key:value store.
              if (this._jupyter_kernel && this._jupyter_kernel.store) {
                this._jupyter_kernel.store.set("nbconvert_error", err);
              }
              err = { key: "nbconvert_error" };
            }
          }
          return this.syncdb.set({
            type: "nbconvert",
            state: "done",
            error: err,
            time: new Date().getTime()
          });
        }
      );
    }
  };

  handle_all_cell_attachments = () => {
    // Check if any cell attachments need to be loaded.
    const cells = this.store.get("cells");
    if (cells != null) {
      cells.forEach(cell => {
        return this.handle_cell_attachments(cell);
      });
    }
  };

  handle_cell_attachments = (cell: any) => {
    if (this._jupyter_kernel == null) {
      // can't do anything
      return;
    }
    const dbg = this.dbg(`handle_cell_attachments(id=${cell.get("id")})`);
    dbg();

    const attachments = cell.get("attachments");
    if (attachments != null) {
      attachments.forEach((x, name) => {
        if ((x != null ? x.get("type") : undefined) === "load") {
          // need to load from disk
          this.set_cell_attachment(cell.get("id"), name, {
            type: "loading",
            value: null
          });
          if (this._jupyter_kernel != null) {
            this._jupyter_kernel
              .load_attachment(x.get("value"))
              .then(sha1 => {
                this.set_cell_attachment(cell.get("id"), name, {
                  type: "sha1",
                  value: sha1
                });
              })
              .catch(err => {
                this.set_cell_attachment(cell.get("id"), name, {
                  type: "error",
                  value: err
                });
              });
          }
        }
      });
    }
  };
}
