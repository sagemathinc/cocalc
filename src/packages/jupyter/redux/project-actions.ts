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
import { JupyterActions as JupyterActions0 } from "@cocalc/jupyter/redux/actions";
import { callback2, once } from "@cocalc/util/async-utils";
import * as misc from "@cocalc/util/misc";
import { RunAllLoop } from "./run-all-loop";
import nbconvertChange from "./handle-nbconvert-change";
import type { ClientFs } from "@cocalc/sync/client/types";
import { kernel as createJupyterKernel } from "@cocalc/jupyter/kernel";
import { removeJupyterRedux } from "@cocalc/jupyter/kernel";
import { initConatService } from "@cocalc/jupyter/kernel/conat-service";
import { type DKV, dkv } from "@cocalc/conat/sync/dkv";
import { computeServerManager } from "@cocalc/conat/compute/manager";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

// refuse to open an ipynb that is bigger than this:
const MAX_SIZE_IPYNB_MB = 150;

type BackendState = "init" | "ready" | "spawning" | "starting" | "running";

export class JupyterActions extends JupyterActions0 {
  private _backend_state: BackendState = "init";
  private lastSavedBackendState?: BackendState;
  private _initialize_manager_already_done: any;
  private _kernel_state: any;
  private _running_cells: { [id: string]: string };
  private _throttled_ensure_positions_are_unique: any;
  private run_all_loop?: RunAllLoop;
  private clear_kernel_error?: any;
  private last_ipynb_save: number = 0;
  protected _client: ClientFs; // this has filesystem access, etc.
  public blobs: DKV;
  private computeServers?;

  private initBlobStore = async () => {
    this.blobs = await dkv(this.blobStoreOptions());
  };

  // uncomment for verbose logging of everything here to the console.
  //   dbg(f: string) {
  //     return (...args) => console.log(f, args);
  //   }

  async runCells(
    _ids: string[],
    _opts: { noHalt?: boolean } = {},
  ): Promise<void> {
    throw Error("DEPRECATED");
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

    if (this.lastSavedBackendState != backend_state) {
      this._set({
        type: "settings",
        backend_state,
        last_backend_state: Date.now(),
      });
      this.save_asap();
      this.lastSavedBackendState = backend_state;
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

  set_kernel_state = (state: any, save = false) => {
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

    dbg("initialize Jupyter Conat api handler");
    await this.initConatApi();

    dbg("initializing blob store");
    await this.initBlobStore();

    this._throttled_ensure_positions_are_unique = debounce(
      this.ensure_positions_are_unique,
      5000,
    );
    // Listen for changes...
    this.syncdb.on("change", this.backendSyncdbChange);

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
  }

  private conatService?;
  private initConatApi = reuseInFlight(async () => {
    if (this.conatService != null) {
      this.conatService.close();
      this.conatService = null;
    }
    const service = (this.conatService = await initConatService({
      project_id: this.project_id,
      path: this.path,
    }));
    this.syncdb.on("closed", () => {
      service.close();
    });
  });

  private _first_load = async () => {
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
  };

  private _init_after_first_load = () => {
    const dbg = this.dbg("_init_after_first_load");

    dbg("initializing");
    // this may change the syncdb.
    this.ensure_backend_kernel_setup();

    this.init_file_watcher();

    this._state = "ready";
  };

  private backendSyncdbChange = (changes: any) => {
    if (this.is_closed()) {
      return;
    }
    const dbg = this.dbg("backendSyncdbChange");
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
  };

  // ensure_backend_kernel_setup ensures that we have a connection
  // to the selected Jupyter kernel, if any.
  ensure_backend_kernel_setup = () => {
    const dbg = this.dbg("ensure_backend_kernel_setup");
    if (this.isDeleted()) {
      dbg("file is deleted");
      return;
    }

    const kernel = this.store.get("kernel");
    dbg("ensure_backend_kernel_setup", { kernel });

    let current: string | undefined = undefined;
    if (this.jupyter_kernel != null) {
      current = this.jupyter_kernel.name;
      if (current == kernel) {
        const state = this.jupyter_kernel.get_state();
        if (state == "error") {
          dbg("kernel is broken");
          // nothing to do -- let user ponder the error they should see.
          return;
        }
        if (state != "closed") {
          dbg("everything is properly setup and working");
          return;
        }
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
    dbg("kernel created -- installing handlers");

    // save so gets reported to frontend, and surfaced to user:
    // https://github.com/sagemathinc/cocalc/issues/4847
    this.jupyter_kernel.on("kernel_error", (error) => {
      this.set_kernel_error(error);
    });

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
          this.set_backend_state("ready");
          this.jupyter_kernel?.close();
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
    dbg("ready");
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
      if (this._state === "closed") {
        return true;
      }
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

  protected __syncdb_change_post_hook(doInit: boolean) {
    if (doInit) {
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

      // Also initialize the execution manager, which runs cells that have been
      // requested to run.
      this.initialize_manager();
    }
  }

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

  private init_file_watcher = () => {
    const dbg = this.dbg("file_watcher");
    dbg();
    this._file_watcher = this._client.watch_file({
      path: this.store.get("path"),
      debounce: 1000,
    });

    this._file_watcher.on("change", async () => {
      dbg("change");
      try {
        await this.loadFromDiskIfNewer();
      } catch (err) {
        dbg("failed to load on change", err);
      }
    });
  };

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
      const error = `Error parsing the ipynb file '${path}': ${err}.  You must fix the ipynb file somehow before continuing, or use TimeTravel to revert to a recent version.`;
      dbg(error);
      this.syncdb.set({ type: "fatal", error });
      throw Error(error);
    }
    this.syncdb.delete({ type: "fatal" });
    await this.set_to_ipynb(parsed_content);
    this.set_last_load(true);
  };

  private fetch_jupyter_kernels = async () => {
    const data = await get_kernel_data();
    const kernels = immutable.fromJS(data as any);
    this.setState({ kernels });
  };

  save_ipynb_file = async ({
    version = 0,
    timeout = 15000,
  }: {
    // if version is given, waits (up to timeout ms) for syncdb to
    // contain that exact version before writing the ipynb to disk.
    // This may be needed to ensure that ipynb saved to disk
    // reflects given frontend state.  This comes up, e.g., in
    // generating the nbgrader version of a document.
    version?: number;
    timeout?: number;
  } = {}) => {
    const dbg = this.dbg("save_ipynb_file");
    if (version && !this.syncdb.hasVersion(version)) {
      dbg(`frontend needs ${version}, which we do not yet have`);
      const start = Date.now();
      while (true) {
        if (this.is_closed()) {
          return;
        }
        if (Date.now() - start >= timeout) {
          dbg("timed out waiting");
          break;
        }
        try {
          dbg(`waiting for version ${version}`);
          await once(this.syncdb, "change", timeout - (Date.now() - start));
        } catch {
          dbg("timed out waiting");
          break;
        }
        if (this.syncdb.hasVersion(version)) {
          dbg("now have the version");
          break;
        }
      }
    }
    if (this.is_closed()) {
      return;
    }
    dbg("saving to file");

    // Check first if file was deleted, in which case instead of saving to disk,
    // we should terminate and clean up everything.
    if (this.isDeleted()) {
      dbg("ipynb file is deleted, so NOT saving to disk and closing");
      this.close();
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
    if (cells == null || cells.size === 0) {
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

  async process_comm_message_from_kernel(mesg: any): Promise<void> {
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

  capture_output_message(mesg: any): boolean {
    if (this.syncdb.ipywidgets_state == null) {
      throw Error("syncdb's ipywidgets_state must be defined!");
    }
    return this.syncdb.ipywidgets_state.capture_output_message(mesg);
  }

  close_project_only() {
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
  async signal(signal = "SIGINT"): Promise<void> {
    this.jupyter_kernel?.signal(signal);
  }

  handle_nbconvert_change(oldVal, newVal): void {
    nbconvertChange(this, oldVal?.toJS(), newVal?.toJS());
  }

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

  getComputeServers = () => {
    // we don't bother worrying about freeing this since it is only
    // run in the project or compute server, which needs the underlying
    // dkv for its entire lifetime anyways.
    if (this.computeServers == null) {
      this.computeServers = computeServerManager({
        project_id: this.project_id,
      });
    }
    return this.computeServers;
  };

  getComputeServerIdSync = (): number => {
    const c = this.getComputeServers();
    return c.get(this.syncdb.path) ?? 0;
  };

  getComputeServerId = async (): Promise<number> => {
    const c = this.getComputeServers();
    return (await c.getServerIdForPath(this.syncdb.path)) ?? 0;
  };
}
