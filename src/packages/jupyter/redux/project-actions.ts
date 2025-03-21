/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
project-actions: additional actions that are only available in the
backend/project, which "manages" everything.

This code should not *explicitly* require anything that is only
available in the project or requires node to run, so that we can
fully unit test it via mocking of components.

NOTE: this is also now the actions used by remote compute servers as well.
*/

import { get_kernel_data } from "@cocalc/jupyter/kernel/kernel-data";
import * as immutable from "immutable";
import json_stable from "json-stable-stringify";
import { debounce } from "lodash";
import {
  JupyterActions as JupyterActions0,
  MAX_OUTPUT_MESSAGES,
} from "@cocalc/jupyter/redux/actions";
import { callback2, once } from "@cocalc/util/async-utils";
import * as misc from "@cocalc/util/misc";
import { OutputHandler } from "@cocalc/jupyter/execute/output-handler";
import { RunAllLoop } from "./run-all-loop";
import nbconvertChange from "./handle-nbconvert-change";
import type { ClientFs } from "@cocalc/sync/client/types";
import { kernel as createJupyterKernel } from "@cocalc/jupyter/kernel";
import {
  decodeUUIDtoNum,
  isEncodedNumUUID,
} from "@cocalc/util/compute/manager";
import { removeJupyterRedux } from "@cocalc/jupyter/kernel";
import { initNatsService } from "@cocalc/jupyter/kernel/nats-service";
import { type DKV, dkv } from "@cocalc/nats/sync/dkv";

// see https://github.com/sagemathinc/cocalc/issues/8060
const MAX_OUTPUT_SAVE_DELAY = 30000;

// refuse to open an ipynb that is bigger than this:
const MAX_SIZE_IPYNB_MB = 150;

type BackendState = "init" | "ready" | "spawning" | "starting" | "running";

export class JupyterActions extends JupyterActions0 {
  private _backend_state: BackendState = "init";
  private _initialize_manager_already_done: any;
  private _kernel_state: any;
  private _manager_run_cell_queue: any;
  private _running_cells: { [id: string]: string };
  private _throttled_ensure_positions_are_unique: any;
  private run_all_loop?: RunAllLoop;
  private clear_kernel_error?: any;
  private running_manager_run_cell_process_queue: boolean = false;
  private last_ipynb_save: number = 0;
  protected _client: ClientFs; // this has filesystem access, etc.
  public blobs: DKV;

  private initBlobStore = async () => {
    this.blobs = await dkv(this.blobStoreOptions());
  };

  public run_cell(
    id: string,
    save: boolean = true,
    no_halt: boolean = false,
  ): void {
    if (this.store.get("read_only")) return;
    const cell = this.store.getIn(["cells", id]);
    if (cell == null) {
      // it is trivial to run a cell that does not exist -- nothing needs to be done.
      return;
    }
    const cell_type = cell.get("cell_type", "code");
    if (cell_type == "code") {
      // when the backend is running code, just don't worry about
      // trying to parse things like "foo?" out. We can't do
      // it without CodeMirror, and it isn't worth it for that
      // application.
      this.run_code_cell(id, save, no_halt);
    }
    if (save) {
      this.save_asap();
    }
  }

  private set_backend_state(backend_state: BackendState): void {
    this.dbg("set_backend_state")(backend_state);

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

        Going from ready to starting happens first when a code execution is requested.
        */

    // Check just in case Typescript doesn't catch something:
    if (
      ["init", "ready", "spawning", "starting", "running"].indexOf(
        backend_state,
      ) === -1
    ) {
      throw Error(`invalid backend state '${backend_state}'`);
    }
    if (backend_state == "init" && this._backend_state != "init") {
      // Do NOT allow changing the state to init from any other state.
      throw Error(
        `illegal state change '${this._backend_state}' --> '${backend_state}'`,
      );
    }
    this._backend_state = backend_state;

    if (this.isCellRunner()) {
      const stored_backend_state = this.syncdb
        .get_one({ type: "settings" })
        ?.get("backend_state");

      if (stored_backend_state != backend_state) {
        this._set({
          type: "settings",
          backend_state,
          last_backend_state: Date.now(),
        });
        this.save_asap();
      }

      // The following is to clear kernel_error if things are working only.
      if (backend_state == "running") {
        // clear kernel error if kernel successfully starts and stays
        // in running state for a while.
        this.clear_kernel_error = setTimeout(() => {
          this._set({
            type: "settings",
            kernel_error: "",
          });
        }, 3000);
      } else {
        // change to a different state; cancel attempt to clear kernel error
        if (this.clear_kernel_error) {
          clearTimeout(this.clear_kernel_error);
          delete this.clear_kernel_error;
        }
      }
    }
  }

  set_kernel_state = (state: any, save = false) => {
    if (!this.isCellRunner()) return;
    this._kernel_state = state;
    this._set({ type: "settings", kernel_state: state }, save);
  };

  // Called exactly once when the manager first starts up after the store is initialized.
  // Here we ensure everything is in a consistent state so that we can react
  // to changes later.
  async initialize_manager() {
    if (this._initialize_manager_already_done) {
      return;
    }
    const dbg = this.dbg("initialize_manager");
    dbg();
    this._initialize_manager_already_done = true;

    dbg("initialize Jupyter NATS api handler");
    await this.initNatsApi();

    dbg("initializing blob store");
    await this.initBlobStore();

    this.sync_exec_state = debounce(this.sync_exec_state, 2000);
    this._throttled_ensure_positions_are_unique = debounce(
      this.ensure_positions_are_unique,
      5000,
    );
    // Listen for changes...
    this.syncdb.on("change", this._backend_syncdb_change.bind(this));

    this.setState({
      // used by the kernel_info function of this.jupyter_kernel
      start_time: this._client.server_time().valueOf(),
    });

    // clear nbconvert start on init, since no nbconvert can be running yet
    this.syncdb.delete({ type: "nbconvert" });

    // Initialize info about available kernels, which is used e.g., for
    // saving to ipynb format.
    this.init_kernel_info();

    // We try once to load from disk.  If it fails, then
    // a record with type:'fatal'
    // is created in the database; if it succeeds, that record is deleted.
    // Try again only when the file changes.
    await this._first_load();

    // Listen for model state changes...
    if (this.syncdb.ipywidgets_state == null) {
      throw Error("syncdb's ipywidgets_state must be defined!");
    }
    this.syncdb.ipywidgets_state.on(
      "change",
      this.handle_ipywidgets_state_change,
    );

    this.syncdb.on("cursor_activity", this.checkForComputeServerStateChange);

    // initialize the websocket api
    if (false) {
      this.initWebsocketApi();
    }
  }

  private initNatsApi = async () => {
    const service = await initNatsService({
      project_id: this.project_id,
      path: this.path,
    });
    this.syncdb.on("closed", () => {
      service.close();
    });
  };

  private async _first_load() {
    const dbg = this.dbg("_first_load");
    dbg("doing load");
    if (this.is_closed()) {
      throw Error("actions must not be closed");
    }
    try {
      await this.loadFromDiskIfNewer();
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
  }

  private _init_after_first_load() {
    const dbg = this.dbg("_init_after_first_load");

    dbg("initializing");
    this.ensure_backend_kernel_setup(); // this may change the syncdb.

    this.init_file_watcher();

    this._state = "ready";
    this.ensure_there_is_a_cell();
  }

  _backend_syncdb_change = (changes: any) => {
    if (this.is_closed()) {
      return;
    }
    const dbg = this.dbg("_backend_syncdb_change");
    if (changes != null) {
      changes.forEach((key) => {
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
              if (record.get("backend_state") !== this._backend_state) {
                this.set_backend_state(this._backend_state);
              }

              if (record.get("run_all_loop_s")) {
                if (this.run_all_loop == null) {
                  this.run_all_loop = new RunAllLoop(
                    this,
                    record.get("run_all_loop_s"),
                  );
                } else {
                  // ensure interval is correct
                  this.run_all_loop.set_interval(record.get("run_all_loop_s"));
                }
              } else if (
                !record.get("run_all_loop_s") &&
                this.run_all_loop != null
              ) {
                // stop it.
                this.run_all_loop.close();
                delete this.run_all_loop;
              }
            }
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
    if (this.isDeleted()) {
      dbg("file is deleted");
      return;
    }

    const kernel = this.store.get("kernel");

    let current: string | undefined = undefined;
    if (this.jupyter_kernel != null) {
      current = this.jupyter_kernel.name;
      if (current == kernel && this.jupyter_kernel.get_state() != "closed") {
        dbg("everything is properly setup and working");
        return;
      }
    }

    dbg(`kernel='${kernel}', current='${current}'`);
    if (
      this.jupyter_kernel != null &&
      this.jupyter_kernel.get_state() != "closed"
    ) {
      if (current != kernel) {
        dbg("kernel changed -- kill running kernel to trigger switch");
        this.jupyter_kernel.close();
        return;
      } else {
        dbg("nothing to do");
        return;
      }
    }

    dbg("make a new kernel");

    // No kernel wrapper object setup at all. Make one.
    this.jupyter_kernel = createJupyterKernel({
      name: kernel,
      path: this.store.get("path"),
      actions: this,
    });

    if (this.syncdb.ipywidgets_state == null) {
      throw Error("syncdb's ipywidgets_state must be defined!");
    }
    this.syncdb.ipywidgets_state.clear();

    if (this.jupyter_kernel == null) {
      // to satisfy typescript.
      throw Error("jupyter_kernel must be defined");
    }

    // save so gets reported to frontend, and surfaced to user:
    // https://github.com/sagemathinc/cocalc/issues/4847
    this.jupyter_kernel.on("kernel_error", (error) => {
      this.set_kernel_error(error);
    });

    // Since we just made a new kernel, clearly no cells are running on the backend.
    this._running_cells = {};
    this.clear_all_cell_run_state();

    this.restartKernelOnClose = () => {
      // When the kernel closes, make sure a new kernel gets setup.
      if (this.store == null || this._state !== "ready") {
        // This event can also happen when this actions is being closed,
        // in which case obviously we shouldn't make a new kernel.
        return;
      }
      dbg("kernel closed -- make new one.");
      this.ensure_backend_kernel_setup();
    };

    this.jupyter_kernel.once("closed", this.restartKernelOnClose);

    // Track backend state changes other than closing, so they
    // are visible to user etc.
    // TODO: Maybe all these need to move to ephemeral table?
    // There's a good argument that recording these is useful though, so when
    // looking at time travel or debugging, you know what was going on.
    this.jupyter_kernel.on("state", (state) => {
      dbg("jupyter_kernel state --> ", state);
      switch (state) {
        case "off":
        case "closed":
          // things went wrong.
          this._running_cells = {};
          this.clear_all_cell_run_state();
          this.set_backend_state("ready");
          this.jupyter_kernel?.close();
          this.running_manager_run_cell_process_queue = false;
          delete this.jupyter_kernel;
          return;
        case "spawning":
        case "starting":
          this.set_connection_file(); // yes, fall through
        case "running":
          this.set_backend_state(state);
      }
    });

    this.jupyter_kernel.on("execution_state", this.set_kernel_state);

    this.handle_all_cell_attachments();
    this.set_backend_state("ready");
  };

  set_connection_file = () => {
    const connection_file = this.jupyter_kernel?.get_connection_file() ?? "";
    this._set({
      type: "settings",
      connection_file,
    });
  };

  init_kernel_info = async () => {
    let kernels0 = this.store.get("kernels");
    if (kernels0 != null) {
      return;
    }
    const dbg = this.dbg("init_kernel_info");
    dbg("getting");
    let kernels;
    try {
      kernels = await get_kernel_data();
      dbg("success");
    } catch (err) {
      dbg(`FAILED to get kernel info: ${err}`);
      // TODO: what to do??  Saving will be broken...
      return;
    }
    this.setState({
      kernels: immutable.fromJS(kernels),
    });
  };

  async ensure_backend_kernel_is_running() {
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
  }

  // onCellChange is called after a cell change has been
  // incorporated into the store after the syncdb change event.
  // - If we are responsible for running cells, then it ensures
  //   that cell gets computed.
  // - We also handle attachments for markdown cells.
  protected onCellChange(id: string, new_cell: any, old_cell: any) {
    const dbg = this.dbg(`onCellChange(id='${id}')`);
    dbg();
    // this logging could be expensive due to toJS, so only uncomment
    // if really needed
    // dbg("new_cell=", new_cell?.toJS(), "old_cell", old_cell?.toJS());

    if (
      new_cell?.get("state") === "start" &&
      old_cell?.get("state") !== "start" &&
      this.isCellRunner()
    ) {
      this.manager_run_cell_enqueue(id);
      // attachments below only happen for markdown cells, which don't get run,
      // we can return here:
      return;
    }

    const attachments = new_cell?.get("attachments");
    if (attachments != null && attachments !== old_cell?.get("attachments")) {
      this.handle_cell_attachments(new_cell);
    }
  }

  protected __syncdb_change_post_hook(doInit: boolean) {
    if (doInit) {
      if (this.isCellRunner()) {
        // Since just opening the actions in the project, definitely the kernel
        // isn't running so set this fact in the shared database.  It will make
        // things always be in the right initial state.
        this.syncdb.set({
          type: "settings",
          backend_state: "init",
          kernel_state: "idle",
          kernel_usage: { memory: 0, cpu: 0 },
        });
        this.syncdb.commit();
      }

      // Also initialize the execution manager, which runs cells that have been
      // requested to run.
      this.initialize_manager();
    }
    if (this.store.get("kernel")) {
      this.manager_run_cell_process_queue();
    }
  }

  // Ensure that the cells listed as running *are* exactly the
  // ones actually running or queued up to run.
  sync_exec_state = () => {
    // sync_exec_state is debounced, so it is *expected* to get called
    // after actions have been closed.
    if (this.store == null || this._state !== "ready") {
      // not initialized, so we better not
      // mess with cell state (that is somebody else's responsibility).
      return;
    }
    //  we are not the cell runner
    if (!this.isCellRunner()) {
      return;
    }

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
          state != "done" &&
          state != "start" && // regarding "start", see https://github.com/sagemathinc/cocalc/issues/5467
          !this._running_cells?.[id]
        ) {
          dbg(`set cell ${id} with state "${state}" to done`);
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
      for (const id in this._running_cells) {
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
    if (this._running_cells == null || this.jupyter_kernel == null) return;
    const identity = this._running_cells[id];
    if (identity == null) return;
    if (this.jupyter_kernel.identity == identity) {
      dbg("canceling");
      this.jupyter_kernel.cancel_execute(id);
    } else {
      dbg("not canceling since wrong identity");
    }
  };

  // Note that there is a request to run a given cell.
  // You must call manager_run_cell_process_queue for them to actually start running.
  protected manager_run_cell_enqueue(id: string) {
    if (this._running_cells?.[id]) {
      return;
    }
    if (this._manager_run_cell_queue == null) {
      this._manager_run_cell_queue = {};
    }
    this._manager_run_cell_queue[id] = true;
  }

  // properly start running -- in order -- the cells that have been requested to run
  protected async manager_run_cell_process_queue() {
    if (this.running_manager_run_cell_process_queue) {
      return;
    }
    this.running_manager_run_cell_process_queue = true;
    try {
      const dbg = this.dbg("manager_run_cell_process_queue");
      const queue = this._manager_run_cell_queue;
      if (queue == null) {
        //dbg("queue is null");
        return;
      }
      delete this._manager_run_cell_queue;
      const v: any[] = [];
      for (const id in queue) {
        if (!this._running_cells?.[id]) {
          v.push(this.store.getIn(["cells", id]));
        }
      }

      if (v.length == 0) {
        dbg("no non-running cells");
        return; // nothing to do
      }

      v.sort((a, b) =>
        misc.cmp(
          a != null ? a.get("start") : undefined,
          b != null ? b.get("start") : undefined,
        ),
      );

      dbg(
        `found ${v.length} non-running cell that should be running, so ensuring kernel is running...`,
      );
      this.ensure_backend_kernel_setup();
      try {
        await this.ensure_backend_kernel_is_running();
        if (this._state == "closed") return;
      } catch (err) {
        // if this fails, give up on evaluation.
        return;
      }

      dbg(
        `kernel is now running; requesting that each ${v.length} cell gets executed`,
      );
      for (const cell of v) {
        if (cell != null) {
          this.manager_run_cell(cell.get("id"));
        }
      }

      if (this._manager_run_cell_queue != null) {
        // run it again to process additional entries.
        setTimeout(this.manager_run_cell_process_queue, 1);
      }
    } finally {
      this.running_manager_run_cell_process_queue = false;
    }
  }

  // returns new output handler for this cell.
  protected _output_handler(cell) {
    const dbg = this.dbg(`_output_handler(id='${cell.id}')`);
    if (
      this.jupyter_kernel == null ||
      this.jupyter_kernel.get_state() == "closed"
    ) {
      throw Error("jupyter kernel must exist and not be closed");
    }
    this.reset_more_output(cell.id);

    const handler = new OutputHandler({
      cell,
      max_output_length: this.store.get("max_output_length"),
      max_output_messages: MAX_OUTPUT_MESSAGES,
      report_started_ms: 250,
      dbg,
    });

    dbg("setting up jupyter_kernel.once('closed', ...) handler");
    const handleKernelClose = () => {
      dbg("output handler -- closing due to jupyter kernel closed");
      handler.close();
    };
    this.jupyter_kernel.once("closed", handleKernelClose);
    // remove the "closed" handler we just defined above once
    // we are done waiting for output from this cell.
    // The output handler removes all listeners whenever it is
    // finished, so we don't have to remove this listener for done.
    handler.once("done", () =>
      this.jupyter_kernel?.removeListener("closed", handleKernelClose),
    );

    handler.on("more_output", (mesg, mesg_length) => {
      this.set_more_output(cell.id, mesg, mesg_length);
    });

    handler.on("process", (mesg) => {
      // Do not enable -- mesg often very large!
      //        dbg("handler.on('process')", mesg);
      if (
        this.jupyter_kernel == null ||
        this.jupyter_kernel.get_state() == "closed"
      ) {
        return;
      }
      this.jupyter_kernel.process_output(mesg);
      //  dbg("handler -- after processing ", mesg);
    });

    return handler;
  }

  manager_run_cell = (id: string) => {
    const dbg = this.dbg(`manager_run_cell(id='${id}')`);
    dbg(JSON.stringify(misc.keys(this._running_cells)));

    if (this._running_cells == null) {
      this._running_cells = {};
    }

    if (this._running_cells[id]) {
      dbg("cell already queued to run in kernel");
      return;
    }

    // It's important to set this._running_cells[id] to be true so that
    // sync_exec_state doesn't declare this cell done.  The kernel identity
    // will get set properly below in case it changes.
    this._running_cells[id] = this.jupyter_kernel?.identity ?? "none";

    const orig_cell = this.store.get("cells").get(id);
    if (orig_cell == null) {
      // nothing to do -- cell deleted
      return;
    }

    let input: string | undefined = orig_cell.get("input", "");
    if (input == null) {
      input = "";
    } else {
      input = input.trim();
    }

    const halt_on_error: boolean = !orig_cell.get("no_halt", false);

    if (this.jupyter_kernel == null) {
      throw Error("bug -- this is guaranteed by the above");
    }
    this._running_cells[id] = this.jupyter_kernel.identity;

    const cell: any = {
      id,
      type: "cell",
      kernel: this.store.get("kernel"),
    };

    dbg(`using max_output_length=${this.store.get("max_output_length")}`);
    const handler = this._output_handler(cell);

    // exponentiallyThrottledSaved calls this.syncdb?.save, but
    // it throttles the calls, and does so using exponential backoff
    // up to MAX_OUTPUT_SAVE_DELAY milliseconds.   Basically every
    // time exponentiallyThrottledSaved is called it increases the
    // interval used for throttling by multiplying saveThrottleMs by 1.3
    // until saveThrottleMs gets to MAX_OUTPUT_SAVE_DELAY.  There is no
    // need at all to do a trailing call, since other code handles that.
    let saveThrottleMs = 1;
    let lastCall = 0;
    const exponentiallyThrottledSaved = () => {
      const now = Date.now();
      if (now - lastCall < saveThrottleMs) {
        return;
      }
      lastCall = now;
      saveThrottleMs = Math.min(1.3 * saveThrottleMs, MAX_OUTPUT_SAVE_DELAY);
      this.syncdb?.save();
    };

    handler.on("change", (save) => {
      if (!this.store.getIn(["cells", id])) {
        // The cell was deleted, but we just got some output
        // NOTE: client shouldn't allow deleting running or queued
        // cells, but we still want to do something useful/sensible.
        // We put cell back where it was with same input.
        cell.input = orig_cell.get("input");
        cell.pos = orig_cell.get("pos");
      }
      this.syncdb.set(cell);
      // This is potentially very verbose -- don't due it unless
      // doing low level debugging:
      //dbg(`change (save=${save}): cell='${JSON.stringify(cell)}'`);
      if (save) {
        exponentiallyThrottledSaved();
      }
    });

    handler.once("done", () => {
      dbg("handler is done");
      this.store.removeListener("cell_change", cell_change);
      exec.close();
      if (this._running_cells != null) {
        delete this._running_cells[id];
      }
      this.syncdb?.save();
      setTimeout(() => this.syncdb?.save(), 100);
    });

    if (this.jupyter_kernel == null) {
      handler.error("Unable to start Jupyter");
      return;
    }

    const get_password = (): string => {
      if (this.jupyter_kernel == null) {
        dbg("get_password", id, "no kernel");
        return "";
      }
      const password = this.jupyter_kernel.store.get(id);
      dbg("get_password", id, password);
      this.jupyter_kernel.store.delete(id);
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

    const exec = this.jupyter_kernel.execute_code({
      code: input,
      id,
      stdin: handler.stdin,
      halt_on_error,
    });

    exec.on("output", (mesg) => {
      // uncomment only for specific low level debugging -- see https://github.com/sagemathinc/cocalc/issues/7022
      // dbg(`got mesg='${JSON.stringify(mesg)}'`);  // !!!☡ ☡ ☡  -- EXTREME DANGER ☡ ☡ ☡ !!!!

      if (mesg == null) {
        // can't possibly happen, of course.
        const err = "empty mesg";
        dbg(`got error='${err}'`);
        handler.error(err);
        return;
      }
      if (mesg.done) {
        // done is a special internal cocalc message.
        handler.done();
        return;
      }
      if (mesg.content?.transient?.display_id != null) {
        // See https://github.com/sagemathinc/cocalc/issues/2132
        // We find any other outputs in the document with
        // the same transient.display_id, and set their output to
        // this mesg's output.
        this.handleTransientUpdate(mesg);
        if (mesg.msg_type == "update_display_data") {
          // don't also create a new output
          return;
        }
      }

      if (mesg.msg_type === "clear_output") {
        handler.clear(mesg.content.wait);
        return;
      }

      if (mesg.content.comm_id != null) {
        // ignore any comm/widget related messages
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
        if (mesg.content.payload.length > 0) {
          // payload shell message:
          // Despite https://ipython.org/ipython-doc/3/development/messaging.html#payloads saying
          // ""Payloads are considered deprecated, though their replacement is not yet implemented."
          // we fully have to implement them, since they are used to implement (crazy, IMHO)
          // things like %load in the python2 kernel!
          mesg.content.payload.map((p) => handler.payload(p));
          return;
        }
      } else {
        // Normal iopub output message
        handler.message(mesg.content);
        return;
      }
    });

    exec.on("error", (err) => {
      dbg(`got error='${err}'`);
      handler.error(err);
    });
  };

  reset_more_output = (id: string) => {
    if (id == null) {
      this.store._more_output = {};
    }
    if (this.store._more_output[id] != null) {
      delete this.store._more_output[id];
    }
  };

  set_more_output = (id: string, mesg: object, length: number): void => {
    if (this.store._more_output[id] == null) {
      this.store._more_output[id] = {
        length: 0,
        messages: [],
        lengths: [],
        discarded: 0,
        truncated: 0,
      };
    }
    const output = this.store._more_output[id];

    output.length += length;
    output.lengths.push(length);
    output.messages.push(mesg);

    const goal_length = 10 * this.store.get("max_output_length");
    while (output.length > goal_length) {
      let need: any;
      let did_truncate = false;

      // check if there is a text field, which we can truncate
      let len = output.messages[0].text?.length;
      if (len != null) {
        need = output.length - goal_length + 50;
        if (len > need) {
          // Instead of throwing this message away, let's truncate its text part.  After
          // doing this, the message is at least shorter than it was before.
          output.messages[0].text = misc.trunc(
            output.messages[0].text,
            len - need,
          );
          did_truncate = true;
        }
      }

      // check if there is a text/plain field, which we can thus also safely truncate
      if (!did_truncate && output.messages[0].data != null) {
        for (const field in output.messages[0].data) {
          if (field === "text/plain") {
            const val = output.messages[0].data[field];
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
      output.discarded += 1;
    }
  };

  private init_file_watcher() {
    const dbg = this.dbg("file_watcher");
    dbg();
    this._file_watcher = this._client.watch_file({
      path: this.store.get("path"),
      debounce: 1000,
    });

    this._file_watcher.on("change", async () => {
      if (!this.isCellRunner()) {
        return;
      }
      dbg("change");
      try {
        await this.loadFromDiskIfNewer();
      } catch (err) {
        dbg("failed to load on change", err);
      }
    });
  }

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

  // Load file from disk if it is  newer than
  // the last we saved to disk.
  private loadFromDiskIfNewer = async () => {
    const dbg = this.dbg("loadFromDiskIfNewer");
    // Get mtime of last .ipynb file that we explicitly saved.

    // TODO: breaking the syncdb typescript data hiding.  The
    // right fix will be to move
    // this info to a new ephemeral state table.
    const last_ipynb_save = await this.get_last_ipynb_save();
    dbg(`syncdb last_ipynb_save=${last_ipynb_save}`);
    let file_changed;
    if (last_ipynb_save == 0) {
      // we MUST load from file the first time, of course.
      file_changed = true;
      dbg("file changed because FIRST TIME");
    } else {
      const path = this.store.get("path");
      let stats;
      try {
        stats = await callback2(this._client.path_stat, { path });
        dbg(`stats.mtime = ${stats.mtime}`);
      } catch (err) {
        // This err just means the file doesn't exist.
        // We set the 'last load' to now in this case, since
        // the frontend clients need to know that we
        // have already scanned the disk.
        this.set_last_load();
        return;
      }
      const mtime = stats.mtime.getTime();
      file_changed = mtime > last_ipynb_save;
      dbg({ mtime, last_ipynb_save });
    }
    if (file_changed) {
      dbg(".ipynb disk file changed ==> loading state from disk");
      try {
        await this.load_ipynb_file();
      } catch (err) {
        dbg("failed to load on change", err);
      }
    } else {
      dbg("disk file NOT changed: NOT loading");
    }
  };

  // if also set load is true, we also set the "last_ipynb_save" time.
  set_last_load = (alsoSetLoad: boolean = false) => {
    const last_load = new Date().getTime();
    this.syncdb.set({
      type: "file",
      last_load,
    });
    if (alsoSetLoad) {
      // yes, load v save is inconsistent!
      this.syncdb.set({ type: "settings", last_ipynb_save: last_load });
    }
    this.syncdb.commit();
  };

  /* Determine timestamp of aux .ipynb file, and record it here,
     so we know that we do not have to load exactly that file
     back from disk. */
  private set_last_ipynb_save = async () => {
    let stats;
    try {
      stats = await callback2(this._client.path_stat, {
        path: this.store.get("path"),
      });
    } catch (err) {
      // no-op -- nothing to do.
      this.dbg("set_last_ipynb_save")(`WARNING -- issue in path_stat ${err}`);
      return;
    }

    // This is ugly (i.e., how we get access), but I need to get this done.
    // This is the RIGHT place to save the info though.
    // TODO: move this state info to new ephemeral table.
    try {
      const last_ipynb_save = stats.mtime.getTime();
      this.last_ipynb_save = last_ipynb_save;
      this._set({
        type: "settings",
        last_ipynb_save,
      });
      this.dbg("stats.mtime.getTime()")(
        `set_last_ipynb_save = ${last_ipynb_save}`,
      );
    } catch (err) {
      this.dbg("set_last_ipynb_save")(
        `WARNING -- issue in set_last_ipynb_save ${err}`,
      );
      return;
    }
  };

  private get_last_ipynb_save = async () => {
    const x =
      this.syncdb.get_one({ type: "settings" })?.get("last_ipynb_save") ?? 0;
    return Math.max(x, this.last_ipynb_save);
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
        maxsize_MB: MAX_SIZE_IPYNB_MB,
      });
    } catch (err) {
      // possibly file doesn't exist -- set notebook to empty.
      const exists = await callback2(this._client.path_exists, {
        path,
      });
      if (!exists) {
        content = "";
      } else {
        // It would be better to have a button to push instead of
        // suggesting running a command in the terminal, but
        // adding that took 1 second.  Better than both would be
        // making it possible to edit huge files :-).
        const error = `Error reading ipynb file '${path}': ${err.toString()}.  Fix this to continue.  You can delete all output by typing cc-jupyter-no-output [filename].ipynb in a terminal.`;
        this.syncdb.set({ type: "fatal", error });
        throw Error(error);
      }
    }
    if (content.length === 0) {
      // Blank file, e.g., when creating in CoCalc.
      // This is good, works, etc. -- just clear state, including error.
      this.syncdb.delete();
      this.set_last_load(true);
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
    await this.set_to_ipynb(parsed_content);
    this.set_last_load(true);
  };

  save_ipynb_file = async () => {
    const dbg = this.dbg("save_ipynb_file");
    if (!this.isCellRunner()) {
      dbg("not cell runner, so NOT saving ipynb file to disk");
      return;
    }
    dbg("saving to file");

    // Check first if file was deleted, in which case instead of saving to disk,
    // we should terminate and clean up everything.
    if (this.isDeleted()) {
      dbg("ipynb file is deleted, so NOT saving to disk and closing");
      this.close({ noSave: true });
      return;
    }

    if (this.jupyter_kernel == null) {
      // The kernel is needed to get access to the blob store, which
      // may be needed to save to disk.
      this.ensure_backend_kernel_setup();
      if (this.jupyter_kernel == null) {
        // still not null?  This would happen if no kernel is set at all,
        // in which case it's OK that saving isn't possible.
        throw Error("no kernel so cannot save");
      }
    }
    if (this.store.get("kernels") == null) {
      await this.init_kernel_info();
      if (this.store.get("kernels") == null) {
        // This should never happen, but maybe could in case of a very
        // messed up compute environment where the kernelspecs can't be listed.
        throw Error(
          "kernel info not known and can't be determined, so can't save",
        );
      }
    }
    dbg("going to try to save: getting ipynb object...");
    const blob_store = this.jupyter_kernel.get_blob_store();
    let ipynb = this.store.get_ipynb(blob_store);
    if (this.store.get("kernel")) {
      // if a kernel is set, check that it was sufficiently known that
      // we can fill in data about it --
      //   see https://github.com/sagemathinc/cocalc/issues/7286
      if (ipynb?.metadata?.kernelspec?.name == null) {
        dbg("kernelspec not known -- try loading kernels again");
        await this.fetch_jupyter_kernels();
        // and again grab the ipynb
        ipynb = this.store.get_ipynb(blob_store);
        if (ipynb?.metadata?.kernelspec?.name == null) {
          dbg("kernelspec STILL not known: metadata will be incomplete");
        }
      }
    }
    dbg("got ipynb object");
    // We use json_stable (and indent 1) to be more diff friendly to user,
    // and more consistent with official Jupyter.
    const data = json_stable(ipynb, { space: 1 });
    if (data == null) {
      dbg("failed -- ipynb not defined yet");
      throw Error("ipynb not defined yet; can't save");
    }
    dbg("converted ipynb to stable JSON string", data?.length);
    //dbg(`got string version '${data}'`)
    try {
      dbg("writing to disk...");
      await callback2(this._client.write_file, {
        path: this.store.get("path"),
        data,
      });
      dbg("succeeded at saving");
      await this.set_last_ipynb_save();
    } catch (err) {
      const e = `error writing file: ${err}`;
      dbg(e);
      throw Error(e);
    }
  };

  ensure_there_is_a_cell = () => {
    if (this._state !== "ready") {
      return;
    }
    const cells = this.store.get("cells");
    if (cells == null || (cells.size === 0 && this.isCellRunner())) {
      this._set({
        type: "cell",
        id: this.new_id(),
        pos: 0,
        input: "",
      });
      // We are obviously contributing content to this (empty!) notebook.
      return this.set_trust_notebook(true);
    }
  };

  private handle_all_cell_attachments() {
    // Check if any cell attachments need to be loaded.
    const cells = this.store.get("cells");
    cells?.forEach((cell) => {
      this.handle_cell_attachments(cell);
    });
  }

  private handle_cell_attachments(cell) {
    if (this.jupyter_kernel == null) {
      // can't do anything
      return;
    }
    const dbg = this.dbg(`handle_cell_attachments(id=${cell.get("id")})`);
    dbg();

    const attachments = cell.get("attachments");
    if (attachments == null) return; // nothing to do
    attachments.forEach(async (x, name) => {
      if (x == null) return;
      if (x.get("type") === "load") {
        if (this.jupyter_kernel == null) return; // try later
        // need to load from disk
        this.set_cell_attachment(cell.get("id"), name, {
          type: "loading",
          value: null,
        });
        let sha1: string;
        try {
          sha1 = await this.jupyter_kernel.load_attachment(x.get("value"));
        } catch (err) {
          this.set_cell_attachment(cell.get("id"), name, {
            type: "error",
            value: `${err}`,
          });
          return;
        }
        this.set_cell_attachment(cell.get("id"), name, {
          type: "sha1",
          value: sha1,
        });
      }
    });
  }

  // handle_ipywidgets_state_change is called when the project ipywidgets_state
  // object changes, e.g., in response to a user moving a slider in the browser.
  // It crafts a comm message that is sent to the running Jupyter kernel telling
  // it about this change by calling send_comm_message_to_kernel.
  private handle_ipywidgets_state_change = (keys): void => {
    if (this.is_closed()) {
      return;
    }
    const dbg = this.dbg("handle_ipywidgets_state_change");
    dbg(keys);
    if (this.jupyter_kernel == null) {
      dbg("no kernel, so ignoring changes to ipywidgets");
      return;
    }
    if (this.syncdb.ipywidgets_state == null) {
      throw Error("syncdb's ipywidgets_state must be defined!");
    }
    for (const key of keys) {
      const [, model_id, type] = JSON.parse(key);
      dbg({ key, model_id, type });
      let data: any;
      if (type === "value") {
        const state = this.syncdb.ipywidgets_state.get_model_value(model_id);
        // Saving the buffers on change is critical since otherwise this breaks:
        //  https://ipywidgets.readthedocs.io/en/latest/examples/Widget%20List.html#file-upload
        // Note that stupidly the buffer (e.g., image upload) gets sent to the kernel twice.
        // But it does work robustly, and the kernel and nodejs server processes next to each
        // other so this isn't so bad.
        const { buffer_paths, buffers } =
          this.syncdb.ipywidgets_state.getKnownBuffers(model_id);
        data = { method: "update", state, buffer_paths };
        this.jupyter_kernel.send_comm_message_to_kernel({
          msg_id: misc.uuid(),
          target_name: "jupyter.widget",
          comm_id: model_id,
          data,
          buffers,
        });
      } else if (type === "buffers") {
        // TODO: we MIGHT need implement this... but MAYBE NOT.  An example where this seems like it might be
        // required is by the file upload widget, but actually that just uses the value type above, since
        // we explicitly fill in the widgets there; also there is an explicit comm upload message that
        // the widget sends out that updates the buffer, and in send_comm_message_to_kernel in jupyter/kernel/kernel.ts
        // when processing that message, we saves those buffers and make sure they are set in the
        // value case above (otherwise they would get removed).
        //    https://ipywidgets.readthedocs.io/en/latest/examples/Widget%20List.html#file-upload
        // which creates a buffer from the content of the file, then sends it to the backend,
        // which sees a change and has to write that buffer to the kernel (here) so that
        // the running python process can actually do something with the file contents (e.g.,
        // process data, save file to disk, etc).
        // We need to be careful though to not send buffers to the kernel that the kernel sent us,
        // since that would be a waste.
      } else if (type === "state") {
        // TODO: currently ignoring this, since it seems chatty and pointless,
        // and could lead to race conditions probably with multiple users, etc.
        // It happens right when the widget is created.
        /*
        const state = this.syncdb.ipywidgets_state.getModelSerializedState(model_id);
        data = { method: "update", state };
        this.jupyter_kernel.send_comm_message_to_kernel(
          misc.uuid(),
          model_id,
          data
        );
        */
      } else {
        const m = `Jupyter: unknown type '${type}'`;
        console.warn(m);
        dbg(m);
      }
    }
  };

  public async process_comm_message_from_kernel(mesg: any): Promise<void> {
    const dbg = this.dbg("process_comm_message_from_kernel");
    // serializing the full message could cause enormous load on the server, since
    // the mesg may contain large buffers.  Only do for low level debugging!
    // dbg(mesg); // EXTREME DANGER!
    // This should be safe:
    dbg(JSON.stringify(mesg.header));
    if (this.syncdb.ipywidgets_state == null) {
      throw Error("syncdb's ipywidgets_state must be defined!");
    }
    await this.syncdb.ipywidgets_state.process_comm_message_from_kernel(mesg);
  }

  public capture_output_message(mesg: any): boolean {
    if (this.syncdb.ipywidgets_state == null) {
      throw Error("syncdb's ipywidgets_state must be defined!");
    }
    return this.syncdb.ipywidgets_state.capture_output_message(mesg);
  }

  public close_project_only() {
    const dbg = this.dbg("close_project_only");
    dbg();
    if (this.run_all_loop) {
      this.run_all_loop.close();
      delete this.run_all_loop;
    }
    // this stops the kernel and cleans everything up
    // so no resources are wasted and next time starting
    // is clean
    (async () => {
      try {
        await removeJupyterRedux(this.store.get("path"), this.project_id);
      } catch (err) {
        dbg("WARNING -- issue removing jupyter redux", err);
      }
    })();

    this.blobs?.close();
  }

  // not actually async...
  public async signal(signal = "SIGINT"): Promise<void> {
    this.jupyter_kernel?.signal(signal);
  }

  public handle_nbconvert_change(oldVal, newVal): void {
    nbconvertChange(this, oldVal?.toJS(), newVal?.toJS());
  }

  protected isCellRunner = (): boolean => {
    if (this.is_closed()) {
      // it's closed, so obviously not the cell runner.
      return false;
    }
    const dbg = this.dbg("isCellRunner");
    let id;
    try {
      id = this.getComputeServerId();
    } catch (_) {
      // normal since debounced,
      // and anyways if anything like syncdb that getComputeServerId
      // depends on doesn't work, then we are clearly
      // not the cell runner
      return false;
    }
    dbg("id = ", id);
    if (id == 0 && this.is_project) {
      dbg("yes we are the cell runner (the project)");
      // when no remote compute servers are configured, the project is
      // responsible for evaluating code.
      return true;
    }
    if (this.is_compute_server) {
      // a remote compute server is supposed to be responsible. Are we it?
      try {
        const myId = decodeUUIDtoNum(this.syncdb.client_id());
        const isRunner = myId == id;
        dbg(isRunner ? "Yes, we are cell runner" : "NOT cell runner");
        return isRunner;
      } catch (err) {
        dbg(err);
      }
    }
    dbg("NO we are not the cell runner");
    return false;
  };

  private lastComputeServerId = 0;
  private checkForComputeServerStateChange = (client_id) => {
    if (this.is_closed()) {
      return;
    }
    if (!isEncodedNumUUID(client_id)) {
      return;
    }
    const id = this.getComputeServerId();
    if (id != this.lastComputeServerId) {
      // reset all run state
      this.halt();
      this.clear_all_cell_run_state();
    }
    this.lastComputeServerId = id;
  };

  /*
  WebSocket API

  1. Handles api requests from the user via the generic websocket message channel
     provided by the syncdb.

  2. In case a remote compute server connects and registers to handle api messages,
     then those are proxied to the remote server, handled there, and proxied back.
  */

  private initWebsocketApi = () => {
    if (this.is_project) {
      // only the project receives these messages from clients.
      this.syncdb.on("message", this.handleMessageFromClient);
    } else if (this.is_compute_server) {
      // compute servers receive messages from the project,
      // proxying an api request from a client.
      this.syncdb.on("message", this.handleMessageFromProject);
    }
  };

  private remoteApiHandler: null | {
    spark: any; // the spark channel connection between project and compute server
    id: number; // this is a sequential id used for request/response pairing
    // when get response from computer server, one of these callbacks gets called:
    responseCallbacks: { [id: number]: (err: any, response: any) => void };
  } = null;

  private handleMessageFromClient = async ({ data, spark }) => {
    // This is call in the project to handle api requests.
    // It either handles them directly, or if there is a remote
    // compute server, it forwards them to the remote compute server,
    // then proxies the response back to the client.

    const dbg = this.dbg("handleMessageFromClient");
    dbg();
    // WARNING: potentially very verbose
    dbg(data);
    switch (data.event) {
      case "register-to-handle-api": {
        if (this.remoteApiHandler?.spark?.id == spark.id) {
          dbg(
            "register-to-handle-api -- it's the current one so nothing to do",
          );
          return;
        }
        if (this.remoteApiHandler?.spark != null) {
          dbg("register-to-handle-api -- remove existing handler");
          this.remoteApiHandler.spark.removeAllListeners();
          this.remoteApiHandler.spark.end();
          this.remoteApiHandler = null;
        }
        // a compute server client is volunteering to handle all api requests until they disconnect
        this.remoteApiHandler = { spark, id: 0, responseCallbacks: {} };
        dbg("register-to-handle-api -- spark.id = ", spark.id);
        spark.on("end", () => {
          dbg(
            "register-to-handle-api -- spark ended, spark.id = ",
            spark.id,
            " and this.remoteApiHandler?.spark.id=",
            this.remoteApiHandler?.spark.id,
          );
          if (this.remoteApiHandler?.spark.id == spark.id) {
            this.remoteApiHandler = null;
          }
        });
        return;
      }

      case "api-request": {
        // browser client made an api request.  This will get handled
        // either locally or via a remote compute server, depending on
        // whether this.remoteApiHandler is set (via the
        // register-to-handle-api event above).
        spark.write({
          event: "message",
          data: { event: "error", error: "USE THE NEW NATS API!", id: data.id },
        });
        return;
      }

      case "api-response": {
        // handling api request that we proxied to a remote compute server.
        // We are handling the response from the remote compute server.
        if (this.remoteApiHandler == null) {
          dbg("WARNING: api-response event but there is no remote api handler");
          // api-response event can't be handled because no remote api handler is registered
          // This should only happen if the requesting spark just disconnected, so there's no way to
          // responsd anyways.
          return;
        }
        const cb = this.remoteApiHandler.responseCallbacks[data.id];
        if (cb != null) {
          delete this.remoteApiHandler.responseCallbacks[data.id];
          cb(undefined, data);
        } else {
          dbg("WARNING: api-response event for unknown id", data.id);
        }
        return;
      }

      case "save-blob-to-project": {
        // TODO: this should be DEPRECATED in favor of NATS!!
        if (!this.is_project) {
          throw Error(
            "message save-blob-to-project should only be sent to the project",
          );
        }
        // A compute server sent the project a blob to store
        // in the local blob store.
        const blobStore = this.jupyter_kernel?.get_blob_store();
        if (blobStore == null) {
          throw Error("blob store not available");
        }
        blobStore.saveBase64(data.data);
        return;
      }

      default: {
        // unknown event so send back error
        spark.write({
          event: "message",
          data: {
            event: "error",
            message: `unknown event ${data.event}`,
            id: data.id,
          },
        });
      }
    }
  };

  // this should only be called on a compute server.
  public saveBlobToProject = (data: string, type: string, ipynb?: string) => {
    if (!this.is_compute_server) {
      throw Error(
        "saveBlobToProject should only be called on a compute server",
      );
    }
    const dbg = this.dbg("saveBlobToProject");
    if (this.is_closed()) {
      dbg("called AFTER closed");
      return;
    }
    // This is call on a compute server whenever something is
    // written to its local blob store.  TODO: We do not wait for
    // confirmation that blob was sent yet though.
    dbg();
    this.syncdb.sendMessageToProject({
      event: "save-blob-to-project",
      data,
      type,
      ipynb,
    });
  };

  private handleMessageFromProject = async (data) => {
    const dbg = this.dbg("handleMessageFromProject");
    if (this.is_closed()) {
      dbg("called AFTER closed");
      return;
    }
    // This is call on the remote compute server to handle api requests.
    dbg();
    // output could be very BIG:
    // dbg(data);
    if (data.event == "api-request") {
      try {
        await this.syncdb.sendMessageToProject({
          event: "api-response",
          id: data.id,
          response: { error: "USE THE NEW NATS API!" },
        });
      } catch (err) {
        // this happens when the websocket is disconnected
        dbg(`WARNING -- issue responding to message ${err}`);
      }
      return;
    }
  };

  // Handle transient cell messages.
  handleTransientUpdate = (mesg) => {
    const display_id = mesg.content?.transient?.display_id;
    if (!display_id) {
      return false;
    }

    let matched = false;
    // are there any transient outputs in the entire document that
    // have this display_id?  search to find them.
    // TODO: we could use a clever data structure to make
    // this faster and more likely to have bugs.
    const cells = this.syncdb.get({ type: "cell" });
    for (let cell of cells) {
      let output = cell.get("output");
      if (output != null) {
        for (const [n, val] of output) {
          if (val.getIn(["transient", "display_id"]) == display_id) {
            // found a match -- replace it
            output = output.set(n, immutable.fromJS(mesg.content));
            this.syncdb.set({ type: "cell", id: cell.get("id"), output });
            matched = true;
          }
        }
      }
    }
    if (matched) {
      this.syncdb.commit();
    }
  };
  // End Websocket API
}
