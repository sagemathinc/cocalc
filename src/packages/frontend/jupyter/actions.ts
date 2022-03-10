/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Jupyter actions -- these are the actions for the underlying document structure.
This can be used both on the frontend and the backend.
*/

// This was 10000 for a while and that caused regular noticeable problems:
//    https://github.com/sagemathinc/cocalc/issues/4590
// It seems like 50000 provides a better tradeoff.  With 10000 we got about
// four support messages *per year* about this...
const DEFAULT_MAX_OUTPUT_LENGTH = 100000;

declare const localStorage: any;

import * as immutable from "immutable";
import { reuseInFlight } from "async-await-utils/hof";
import { debounce } from "lodash";

import { callback2, retry_until_success } from "@cocalc/util/async-utils";
import * as misc from "@cocalc/util/misc";
const { close, required, defaults } = misc;
import * as awaiting from "awaiting";
import { three_way_merge } from "@cocalc/sync/editor/generic/util";
import { Cell, KernelInfo } from "./types";
import { Syntax } from "@cocalc/util/code-formatter";

import { Actions } from "../app-framework";
import {
  JupyterStoreState,
  JupyterStore,
  show_kernel_selector_reasons,
} from "./store";
import * as parsing from "./parsing";
import * as cell_utils from "./cell-utils";
import { cm_options } from "./cm_options";

// map project_id (string) -> kernels (immutable)
import { Kernels, Kernel } from "./util";
let jupyter_kernels = immutable.Map<string, Kernels>();

import { IPynbImporter } from "./import-from-ipynb";

import { JupyterKernelInterface } from "./project-interface";

import { parse_headings } from "./contents";

import {
  codemirror_to_jupyter_pos,
  js_idx_to_char_idx,
  char_idx_to_js_idx,
} from "./util";

import { Config as FormatterConfig } from "@cocalc/project/formatters";

import { SyncDB } from "@cocalc/sync/editor/db/sync";
import { get_local_storage, set_local_storage } from "../misc/local-storage";

/*
The actions -- what you can do with a jupyter notebook, and also the
underlying synchronized state.
*/

// no worries, they don't break react rendering even when they escape
const CellWriteProtectedException = new Error("CellWriteProtectedException");
const CellDeleteProtectedException = new Error("CellDeleteProtectedException");

export class JupyterActions extends Actions<JupyterStoreState> {
  private is_project: boolean;
  protected path: string;
  public project_id: string;
  private _last_start?: number;
  public jupyter_kernel?: JupyterKernelInterface;
  private last_cursor_move_time: Date = new Date(0);

  public _account_id: string; // Note: this is used in test

  private _cursor_locs?: any;
  private _introspect_request?: any;
  protected set_save_status: any;
  private project_conn: any;

  protected _client: any;
  protected _file_watcher: any;
  protected _state: any;

  public _complete_request?: any;
  public _output_handler?: any;
  public ensure_backend_kernel_setup?: any;
  public initialize_manager: any;
  public manager_on_cell_change: any;
  public manager_run_cell_process_queue: any;
  public store: any;
  public syncdb: SyncDB;

  public _init(
    project_id: string,
    path: string,
    syncdb: SyncDB,
    store: any,
    client: any
  ): void {
    if (project_id == null || path == null) {
      // typescript should ensure this, but just in case.
      throw Error("type error -- project_id and path can't be null");
      return;
    }
    store.dbg = (f) => {
      return client.dbg(`JupyterStore('${store.get("path")}').${f}`);
    };
    this._state = "init"; // 'init', 'load', 'ready', 'closed'
    this.store = store;
    this.project_id = project_id;
    this.path = path;
    store.syncdb = syncdb;
    this.syncdb = syncdb;
    this._client = client;
    this.update_contents = debounce(this.update_contents.bind(this), 2000);
    // the project client is designated to manage execution/conflict, etc.
    this.is_project = client.is_project();
    store._is_project = this.is_project;
    this._account_id = client.client_id(); // project or account's id

    let font_size: any = this.store.get_local_storage("font_size");
    if (font_size == null) {
      const account = this.redux.getStore<JupyterStoreState, JupyterStore>(
        "account"
      );
      if (account != null) {
        font_size = account.get("font_size");
      }
    }
    if (font_size == null) {
      font_size = 14;
    }

    let directory: any;
    const split_path = misc.path_split(path);
    if (split_path != null) {
      directory = split_path.head;
    }

    this.setState({
      error: undefined,
      cur_id: this.store.get_local_storage("cur_id"),
      toolbar: !this.store.get_local_storage("hide_toolbar"),
      has_unsaved_changes: false,
      sel_ids: immutable.Set(), // immutable set of selected cells
      md_edit_ids: immutable.Set(), // set of ids of markdown cells in edit mode
      mode: "escape",
      font_size,
      project_id,
      directory,
      path,
      max_output_length: DEFAULT_MAX_OUTPUT_LENGTH,
      cell_toolbar: this.store.get_local_storage("cell_toolbar"),
    });

    this.syncdb.on("change", this._syncdb_change);

    if (!this.is_project) {
      this.init_client_only();
    }
  }

  // Only use this on the frontend, of course.
  protected getFrameActions() {
    return this.redux.getEditorActions(this.project_id, this.path);
  }

  protected init_client_only(): void {
    throw Error("must define in a derived class");
  }

  protected async set_kernel_after_load(): Promise<void> {
    // Browser Client: Wait until the .ipynb file has actually been parsed into
    // the (hidden, e.g. .a.ipynb.sage-jupyter2) syncdb file,
    // then set the kernel, if necessary.
    try {
      await this.syncdb.wait((s) => !!s.get_one({ type: "file" }), 600);
    } catch (err) {
      if (this._state != "ready") {
        // Probably user just closed the notebook before it finished
        // loading, so we don't need to set the kernel.
        return;
      }
      throw Error("error waiting for ipynb file to load");
    }
    this._syncdb_init_kernel();
  }

  sync_read_only = (): void => {
    if (this._state == "closed") return;
    const a = this.store.get("read_only");
    const b = this.syncdb != null ? this.syncdb.is_read_only() : undefined;
    if (a !== b) {
      this.setState({ read_only: b });
      this.set_cm_options();
    }
  };

  init_project_conn = reuseInFlight(async (): Promise<any> => {
    // this cannot (and does not need to be) be imported from within the project.
    // TODO: move to browser-actions.ts
    const { connection_to_project } = require("../project/websocket/connect");
    return (this.project_conn = await connection_to_project(
      this.store.get("project_id")
    ));
  });

  protected async api_call(
    endpoint: string,
    query?: any,
    timeout_ms?: number
  ): Promise<any> {
    if (this._state === "closed") {
      throw Error("closed");
    }
    return await (
      await this.init_project_conn()
    ).api.jupyter(this.path, endpoint, query, timeout_ms);
  }

  public dbg(f: string): (...args) => void {
    return this._client.dbg(`JupyterActions('${this.store.get("path")}').${f}`);
  }

  protected close_client_only(): void {
    throw Error("must define in derived client class");
  }

  public is_closed(): boolean {
    return this._state === "closed";
  }

  public async close(): Promise<void> {
    if (this.is_closed()) {
      return;
    }
    // ensure save to disk happens:
    //   - it will automatically happen for the sync-doc file, but
    //     we also need it for the ipynb file... as ipynb is unique
    //     in having two formats.
    await this.save();

    this.set_local_storage("cur_id", this.store.get("cur_id"));
    if (this.syncdb != null) {
      this.syncdb.close();
    }
    if (this._file_watcher != null) {
      this._file_watcher.close();
    }
    if (!this.is_project) {
      this.close_client_only();
    } else {
      this.close_project_only();
    }
    close(this);
    this._state = "closed";
  }

  public close_project_only() {
    // real version is in derived class that project runs.
  }

  fetch_jupyter_kernels = async (): Promise<void> => {
    let data;
    try {
      data = await this.api_call("kernels");
      if (this._state === "closed") return;
    } catch (err) {
      if (this._state === "closed") return;
      this.set_error(err);
      return;
    }
    // we filter kernels that are disabled for the cocalc notebook – motivated by a broken GAP kernel
    const kernels = immutable
      .fromJS(data)
      .filter((k) => !k.getIn(["metadata", "cocalc", "disabled"], false));
    const key = this.store.jupyter_kernel_key();
    jupyter_kernels = jupyter_kernels.set(key, kernels); // global
    this.setState({ kernels });
    // We must also update the kernel info (e.g., display name), now that we
    // know the kernels (e.g., maybe it changed or is now known but wasn't before).
    const kernel_info = this.store.get_kernel_info(this.store.get("kernel"));
    this.setState({ kernel_info });
  };

  set_jupyter_kernels = async () => {
    const kernels = jupyter_kernels.get(this.store.jupyter_kernel_key());
    if (kernels != null) {
      this.setState({ kernels });
    } else {
      await this.fetch_jupyter_kernels();
    }
    this.update_select_kernel_data();
    this.check_select_kernel();
  };

  set_error = (err: any): void => {
    if (this._state === "closed") return;
    if (err == null) {
      this.setState({ error: undefined }); // delete from store
      return;
    }
    if (typeof err != "string") {
      err = `${err}`;
    }
    const cur = this.store.get("error");
    // don't show the same error more than once
    if ((cur != null ? cur.indexOf(err) : undefined) >= 0) {
      return;
    }
    if (cur) {
      err = err + "\n\n" + cur;
    }
    this.setState({ error: err });
  };

  // Set the input of the given cell in the syncdb, which will also change the store.
  // Might throw a CellWriteProtectedException
  public set_cell_input(id: string, input: string, save = true): void {
    if (this.check_edit_protection(id, "changing input")) {
      return;
    }
    this._set(
      {
        type: "cell",
        id,
        input,
        start: null,
        end: null,
      },
      save
    );
  }

  set_cell_output = (id: string, output: any, save = true) => {
    this._set(
      {
        type: "cell",
        id,
        output,
      },
      save
    );
  };

  clear_selected_outputs = () => {
    this.deprecated("clear_selected_outputs");
  };

  // Clear output in the list of cell id's.
  // NOTE: clearing output *is* allowed for non-editable cells, since the definition
  // of editable is that the *input* is editable.
  // See https://github.com/sagemathinc/cocalc/issues/4805
  public clear_outputs(cell_ids: string[], save: boolean = true): void {
    const cells = this.store.get("cells");
    if (cells == null) return; // nothing to do
    for (const id of cell_ids) {
      const cell = cells.get(id);
      if (cell.get("output") != null || cell.get("exec_count")) {
        this._set({ type: "cell", id, output: null, exec_count: null }, false);
      }
    }
    if (save) {
      this._sync();
    }
  }

  public clear_all_outputs(save: boolean = true): void {
    this.clear_outputs(this.store.get_cell_list().toJS(), save);
  }

  private show_not_xable_error(x: string, n: number, reason?: string): void {
    if (n <= 0) return;
    const verb: string = n === 1 ? "is" : "are";
    const noun: string = misc.plural(n, "cell");
    this.set_error(
      `${n} ${noun} ${verb} protected from ${x}${
        reason ? " when " + reason : ""
      }.`
    );
  }

  private show_not_editable_error(reason?: string): void {
    this.show_not_xable_error("editing", 1, reason);
  }

  private show_not_deletable_error(n: number = 1): void {
    this.show_not_xable_error("deletion", n);
  }

  public toggle_output(id: string, property: "collapsed" | "scrolled"): void {
    this.toggle_outputs([id], property);
  }

  public toggle_outputs(
    cell_ids: string[],
    property: "collapsed" | "scrolled"
  ): void {
    const cells = this.store.get("cells");
    if (cells == null) {
      throw Error("cells not defined");
    }
    for (const id of cell_ids) {
      const cell = cells.get(id);
      if (cell == null) {
        throw Error(`no cell with id ${id}`);
      }
      if (cell.get("cell_type", "code") == "code") {
        this._set({ type: "cell", id, [property]: !cell.get(property) }, false);
      }
    }
    this._sync();
  }

  public toggle_all_outputs(property: "collapsed" | "scrolled"): void {
    this.toggle_outputs(this.store.get_cell_ids_list(), property);
  }

  public set_cell_pos(id: string, pos: number, save: boolean = true): void {
    this._set({ type: "cell", id, pos }, save);
  }

  public set_cell_type(
    id: string,
    cell_type: string = "code",
    save: boolean = true
  ): void {
    if (this.check_edit_protection(id, "changing cell type")) return;
    if (
      cell_type !== "markdown" &&
      cell_type !== "raw" &&
      cell_type !== "code"
    ) {
      throw Error(
        `cell type (='${cell_type}') must be 'markdown', 'raw', or 'code'`
      );
    }
    const obj: any = {
      type: "cell",
      id,
      cell_type,
    };
    if (cell_type !== "code") {
      // delete output and exec time info when switching to non-code cell_type
      obj.output = obj.start = obj.end = obj.collapsed = obj.scrolled = null;
    }
    this._set(obj, save);
  }

  public set_selected_cell_type(cell_type: string): void {
    this.deprecated("set_selected_cell_type", cell_type);
  }

  set_md_cell_editing = (id: string): void => {
    this.deprecated("set_md_cell_editing", id);
  };

  set_md_cell_not_editing = (id: string): void => {
    this.deprecated("set_md_cell_not_editing", id);
  };

  // Set which cell is currently the cursor.
  set_cur_id = (id: string): void => {
    this.deprecated("set_cur_id", id);
  };

  protected deprecated(f: string, ...args): void {
    const s = "DEPRECATED JupyterActions(" + this.path + ")." + f;
    console.warn(s, ...args);
  }

  private set_cell_list(): void {
    const cells = this.store.get("cells");
    if (cells == null) {
      return;
    }
    const cell_list = cell_utils.sorted_cell_list(cells);
    if (!cell_list.equals(this.store.get_cell_list())) {
      this.setState({ cell_list });
      this.store.emit("cell-list-recompute");
    }
  }

  private syncdb_cell_change(id: string, new_cell: any): boolean {
    const cells: immutable.Map<
      string,
      immutable.Map<string, any>
    > = this.store.get("cells");
    if (cells == null) throw Error("BUG -- cells must have been initialized!");
    let cell_list_needs_recompute = false;
    //@dbg("_syncdb_cell_change")("#{id} #{JSON.stringify(new_cell?.toJS())}")
    let old_cell = cells.get(id);
    if (new_cell == null) {
      // delete cell
      this.reset_more_output(id); // free up memory locally
      if (old_cell != null) {
        const cell_list = this.store.get_cell_list().filter((x) => x !== id);
        this.setState({ cells: cells.delete(id), cell_list });
      }
    } else {
      // change or add cell
      old_cell = cells.get(id);
      if (new_cell.equals(old_cell)) {
        return false; // nothing to do
      }
      if (old_cell != null && new_cell.get("start") !== old_cell.get("start")) {
        // cell re-evaluated so any more output is no longer valid.
        this.reset_more_output(id);
      }
      if (old_cell == null || old_cell.get("pos") !== new_cell.get("pos")) {
        cell_list_needs_recompute = true;
      }
      // preserve cursor info if happen to have it, rather than just letting
      // it get deleted whenever the cell changes.
      if (old_cell?.has("cursors")) {
        new_cell = new_cell.set("cursors", old_cell.get("cursors"));
      }
      this.setState({ cells: cells.set(id, new_cell) });
      if (this.store.getIn(["edit_cell_metadata", "id"]) === id) {
        this.edit_cell_metadata(id); // updates the state during active editing.
      }
    }

    if (this.is_project) {
      this.manager_on_cell_change(id, new_cell, old_cell);
    }
    this.store.emit("cell_change", id, new_cell, old_cell);

    return cell_list_needs_recompute;
  }

  _syncdb_change = (changes: any) => {
    if (this.syncdb == null) return;
    this.store.emit("syncdb-before-change");
    this.__syncdb_change(changes);
    this.store.emit("syncdb-after-change");
    if (this.set_save_status != null) {
      this.set_save_status();
    }
  };

  __syncdb_change = (changes: any): void => {
    if (
      this.syncdb == null ||
      changes == null ||
      (changes != null && changes.size == 0)
    ) {
      return;
    }
    const do_init = this.is_project && this._state === "init";
    let cell_list_needs_recompute = false;

    if (changes == "all" || this.store.get("cells") == null) {
      // changes == 'all' is used by nbgrader to set the state...
      // First time initialization, rather than some small
      // update.  We could use the same code, e.g.,
      // calling syncdb_cell_change, but that SCALES HORRIBLY
      // as the number of cells gets large!

      // this.syncdb.get() returns an immutable.List of all the records
      // in the syncdb database.   These look like, e.g.,
      //    {type: "settings", backend_state: "running", trust: true, kernel: "python3", …}
      //    {type: "cell", id: "22cc3e", pos: 0, input: "# small copy", state: "done"}
      let cells: immutable.Map<string, Cell> = immutable.Map();
      this.syncdb.get().forEach((record) => {
        switch (record.get("type")) {
          case "cell":
            cells = cells.set(record.get("id"), record);
            break;
          case "settings":
            if (record == null) {
              return;
            }
            const orig_kernel = this.store.get("kernel");
            const kernel = record.get("kernel");
            const obj: any = {
              trust: !!record.get("trust"), // case to boolean
              backend_state: record.get("backend_state"),
              kernel_state: record.get("kernel_state"),
              metadata: record.get("metadata"), // extra custom user-specified metadata
              max_output_length: bounded_integer(
                record.get("max_output_length"),
                100,
                250000,
                DEFAULT_MAX_OUTPUT_LENGTH
              ),
            };
            if (kernel !== orig_kernel) {
              obj.kernel = kernel;
              obj.kernel_info = this.store.get_kernel_info(kernel);
              obj.backend_kernel_info = undefined;
            }
            this.setState(obj);
            if (!this.is_project && orig_kernel !== kernel) {
              this.set_cm_options();
            }

            break;
        }
      });

      this.setState({ cells, cell_list: cell_utils.sorted_cell_list(cells) });
      cell_list_needs_recompute = false;
    } else {
      changes.forEach((key) => {
        const type: string = key.get("type");
        const record = this.syncdb.get_one(key);
        switch (type) {
          case "cell":
            if (this.syncdb_cell_change(key.get("id"), record)) {
              cell_list_needs_recompute = true;
            }
            break;
          case "fatal":
            const error = record != null ? record.get("error") : undefined;
            this.setState({ fatal: error });
            // This check can be deleted in a few weeks:
            if (
              error != null &&
              error.indexOf("file is currently being read or written") !== -1
            ) {
              // No longer relevant -- see https://github.com/sagemathinc/cocalc/issues/1742
              this.syncdb.delete({ type: "fatal" });
              this.syncdb.commit();
            }
            break;
          case "nbconvert":
            if (this.is_project) {
              // before setting in store, let backend start reacting to change
              this.handle_nbconvert_change(this.store.get("nbconvert"), record);
            }
            // Now set in our store.
            this.setState({ nbconvert: record });
            break;
          case "settings":
            if (record == null) {
              return;
            }
            const orig_kernel = this.store.get("kernel");
            const kernel = record.get("kernel");
            const obj: any = {
              trust: !!record.get("trust"), // case to boolean
              backend_state: record.get("backend_state"),
              kernel_state: record.get("kernel_state"),
              kernel_error: record.get("kernel_error"),
              metadata: record.get("metadata"), // extra custom user-specified metadata
              connection_file: record.get("connection_file") ?? "",
              max_output_length: bounded_integer(
                record.get("max_output_length"),
                100,
                250000,
                DEFAULT_MAX_OUTPUT_LENGTH
              ),
            };
            if (kernel !== orig_kernel) {
              obj.kernel = kernel;
              obj.kernel_info = this.store.get_kernel_info(kernel);
              obj.backend_kernel_info = undefined;
            }
            const prev_backend_state = this.store.get("backend_state");
            this.setState(obj);
            if (!this.is_project) {
              // if the kernel changes or it just started running – we set the codemirror options!
              // otherwise, just when computing them without the backend information, only a crude
              // heuristic sets the values and we end up with "C" formatting for custom python kernels.
              // @see https://github.com/sagemathinc/cocalc/issues/5478
              const started_running =
                record.get("backend_state") === "running" &&
                prev_backend_state !== "running";
              if (orig_kernel !== kernel || started_running) {
                this.set_cm_options();
              }
            }

            break;
        }
      });
    }
    if (cell_list_needs_recompute) {
      this.set_cell_list();
    }

    if (this.is_project) {
      if (do_init) {
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
      if (this.store.get("kernel")) {
        this.manager_run_cell_process_queue();
      }
    } else {
      // client
      if (this._state === "init") {
        this._state = "ready";
      }
      this.check_select_kernel();

      this.update_contents();
    }
  };

  _syncdb_init_kernel = (): void => {
    // console.log("jupyter::_syncdb_init_kernel", this.store.get("kernel"));
    if (this.store.get("kernel") == null) {
      // Creating a new notebook with no kernel set
      if (!this.is_project) {
        // we either let the user select a kernel, or use a stored one
        let using_default_kernel = false;

        const account_store = this.redux.getStore("account") as any;
        const editor_settings = account_store.get("editor_settings") as any;
        if (
          editor_settings != null &&
          !editor_settings.get("ask_jupyter_kernel")
        ) {
          const default_kernel = editor_settings.getIn(["jupyter", "kernel"]);
          // TODO: check if kernel is actually known
          if (default_kernel != null) {
            this.set_kernel(default_kernel);
            using_default_kernel = true;
          }
        }

        if (!using_default_kernel) {
          // otherwise we let the user choose a kernel
          this.show_select_kernel("bad kernel");
        }
        // we also finalize the kernel selection check, because it doesn't switch to true
        // if there is no kernel at all.
        this.setState({ check_select_kernel_init: true });
      }
    } else {
      // Opening an existing notebook
      const default_kernel = this.store.get_default_kernel();
      if (default_kernel == null && this.store.get("kernel")) {
        // But user has no default kernel, since they never before explicitly set one.
        // So we set it.  This is so that a user's default
        // kernel is that of the first ipynb they
        // opened, which is very sensible in courses.
        this.set_default_kernel(this.store.get("kernel"));
      }
    }
  };

  /*
  WARNING: Changes via set that are made when the actions
  are not 'ready' or the syncdb is not ready are ignored.
  These might happen right now if the user were to try to do
  some random thing at the exact moment they are closing the
  notebook. See https://github.com/sagemathinc/cocalc/issues/4274
  */
  _set = (obj: any, save: boolean = true) => {
    if (
      this._state !== "ready" ||
      this.store.get("read_only") ||
      (this.syncdb != null && this.syncdb.get_state() != "ready")
    ) {
      // no possible way to do anything.
      return;
    }
    // check write protection regarding specific keys to be set
    if (
      obj.type === "cell" &&
      obj.id != null &&
      !this.store.is_cell_editable(obj.id)
    ) {
      for (const protected_key of ["input", "cell_type", "attachments"]) {
        if (misc.has_key(obj, protected_key)) {
          throw CellWriteProtectedException;
        }
      }
    }
    //@dbg("_set")("obj=#{misc.to_json(obj)}")
    this.syncdb.set(obj);
    if (save) {
      this.syncdb.commit();
    }
    // ensure that we update locally immediately for our own changes.
    this._syncdb_change(
      immutable.fromJS([misc.copy_with(obj, ["id", "type"])])
    );
  };

  // might throw a CellDeleteProtectedException
  _delete = (obj: any, save = true) => {
    if (this._state === "closed" || this.store.get("read_only")) {
      return;
    }
    // check: don't delete cells marked as deletable=false
    if (obj.type === "cell" && obj.id != null) {
      if (!this.store.is_cell_deletable(obj.id)) {
        throw CellDeleteProtectedException;
      }
    }
    this.syncdb.delete(obj);
    if (save) {
      this.syncdb.commit();
    }
    this._syncdb_change(immutable.fromJS([{ type: obj.type, id: obj.id }]));
  };

  public _sync = () => {
    if (this._state === "closed") {
      return;
    }
    this.syncdb.commit();
  };

  public save = async (): Promise<void> => {
    if (this.store.get("read_only")) {
      // can't save when readonly
      return;
    }
    if (this.store.get("mode") === "edit") {
      this._get_cell_input();
    }
    // Save the .ipynb file to disk.  Note that this
    // *changes* the syncdb by updating the last save time.
    try {
      // Make sure syncdb content is all sent to the project.
      await this.syncdb.save();
      if (this._state === "closed") return;
      // Export the ipynb file to disk.
      await this.api_call("save_ipynb_file", {});
      if (this._state === "closed") return;
      // Save our custom-format syncdb to disk.
      await this.syncdb.save_to_disk();
    } catch (err) {
      if (this._state === "closed") return;
      if (err.toString().indexOf("no kernel with path") != -1) {
        // This means that the kernel simply hasn't been initialized yet.
        // User can try to save later, once it has.
        return;
      }
      if (err.toString().indexOf("unknown endpoint") != -1) {
        this.set_error(
          "You MUST restart your project to run the latest Jupyter server! Click 'Restart Project' in your project's settings."
        );
        return;
      }
      this.set_error(err.toString());
    } finally {
      if (this._state === "closed") return;
      // And update the save status finally.
      if (typeof this.set_save_status === "function") {
        this.set_save_status();
      }
    }
  };

  save_asap = async (): Promise<void> => {
    if (this.syncdb != null) {
      await this.syncdb.save();
    }
  };

  private id_is_available(id: string): boolean {
    return this.store.getIn(["cells", id]) == null;
  }

  protected new_id(is_available?: (string) => boolean): string {
    while (true) {
      const id = misc.uuid().slice(0, 6);
      if (
        (is_available != null && is_available(id)) ||
        this.id_is_available(id)
      ) {
        return id;
      }
    }
  }

  insert_cell(delta: any): string {
    this.deprecated("insert-cell", delta);
    return "";
  }

  insert_cell_at(
    pos: number,
    save: boolean = true,
    id: string | undefined = undefined // dangerous since could conflict (used by whiteboard)
  ): string {
    if (this.store.get("read_only")) {
      throw Error("document is read only");
    }
    const new_id = id ?? this.new_id();
    this._set(
      {
        type: "cell",
        id: new_id,
        pos,
        input: "",
      },
      save
    );
    return new_id; // violates CQRS... (this *is* used elsewhere)
  }

  // insert a cell adjacent to the cell with given id.
  // -1 = above and +1 = below.
  insert_cell_adjacent(
    id: string,
    delta: -1 | 1,
    save: boolean = true
  ): string {
    const pos = cell_utils.new_cell_pos(
      this.store.get("cells"),
      this.store.get_cell_list(),
      id,
      delta
    );
    return this.insert_cell_at(pos, save);
  }

  delete_selected_cells = (sync = true): void => {
    this.deprecated("delete_selected_cells", sync);
  };

  delete_cells(cells: string[], sync: boolean = true): void {
    let not_deletable: number = 0;
    for (const id of cells) {
      if (this.store.is_cell_deletable(id)) {
        this._delete({ type: "cell", id }, false);
      } else {
        not_deletable += 1;
      }
    }
    if (sync) {
      this._sync();
    }
    if (not_deletable === 0) return;

    this.show_not_deletable_error(not_deletable);
  }

  move_selected_cells = (delta: number) => {
    this.deprecated("move_selected_cells", delta);
  };

  undo = (): void => {
    if (this.syncdb != null) {
      this.syncdb.undo();
    }
  };

  redo = (): void => {
    if (this.syncdb != null) {
      this.syncdb.redo();
    }
  };

  in_undo_mode(): boolean {
    return this.syncdb?.in_undo_mode() ?? false;
  }

  // in the future, might throw a CellWriteProtectedException.
  // for now, just running is ok.
  public run_cell(
    id: string,
    save: boolean = true,
    no_halt: boolean = false
  ): void {
    if (this.store.get("read_only")) return;
    const cell = this.store.getIn(["cells", id]);
    if (cell == null) {
      throw Error(`can't run cell ${id} since it does not exist`);
    }

    const cell_type = cell.get("cell_type", "code");
    switch (cell_type) {
      case "code":
        const code = this.get_cell_input(id).trim();
        if (this.is_project) {
          // when the backend is running code, just don't worry about
          // trying to parse things like "foo?" out. We can't do
          // it without CodeMirror, and it isn't worth it for that
          // application.
          this.run_code_cell(id, save, no_halt);
        } else {
          const cm_mode = this.store.getIn(["cm_options", "mode", "name"]);
          const language = this.store.get_kernel_language();
          switch (parsing.run_mode(code, cm_mode, language)) {
            case "show_source":
              this.introspect(code.slice(0, code.length - 2), 1);
              break;
            case "show_doc":
              this.introspect(code.slice(0, code.length - 1), 0);
              break;
            case "empty":
              this.clear_cell(id, save);
              break;
            case "execute":
              this.run_code_cell(id, save, no_halt);
              break;
          }
        }
        break;
    }
    if (save) {
      this.save_asap();
    }
  }

  public run_code_cell(
    id: string,
    save: boolean = true,
    no_halt: boolean = false
  ): void {
    const cell = this.store.getIn(["cells", id]);
    if (cell == null) {
      throw Error(`can't run cell ${id} since it does not exist`);
    }
    if (cell.get("state", "done") != "done") {
      // already running -- stop it first somehow if you want to run it again...
      return;
    }

    // We mark the start timestamp uniquely, so that the backend can sort
    // multiple cells with a simultaneous time to start request.

    let start: number = this._client.server_time().valueOf();
    if (this._last_start != null && start <= this._last_start) {
      start = this._last_start + 1;
    }
    this._last_start = start;
    this.set_jupyter_metadata(id, "outputs_hidden", undefined, false);

    this._set(
      {
        type: "cell",
        id,
        state: "start",
        start,
        end: null,
        output: null,
        exec_count: null,
        collapsed: null,
        no_halt: no_halt ? no_halt : null,
      },
      save
    );
    this.set_trust_notebook(true, save);
  }

  clear_cell = (id: string, save = true) => {
    return this._set(
      {
        type: "cell",
        id,
        state: null,
        start: null,
        end: null,
        output: null,
        exec_count: null,
        collapsed: null,
      },
      save
    );
  };

  clear_cell_run_state = (id: string, save = true) => {
    return this._set(
      {
        type: "cell",
        id,
        state: "done",
      },
      save
    );
  };

  run_selected_cells = (): void => {
    this.deprecated("run_selected_cells");
  };

  run_all_cells = (no_halt: boolean = false): void => {
    this.store.get_cell_list().forEach((id) => {
      this.run_cell(id, false, no_halt);
    });
    this.save_asap();
  };

  clear_all_cell_run_state = (): void => {
    this.store.get_cell_list().forEach((id) => {
      this.clear_cell_run_state(id, false);
    });
    this.save_asap();
  };

  // Run all cells strictly above the specified cell.
  run_all_above_cell(id: string): void {
    const i: number = this.store.get_cell_index(id);
    const v: string[] = this.store.get_cell_list().toJS();
    for (const id of v.slice(0, i)) {
      this.run_cell(id, false);
    }
    this.save_asap();
  }

  // Run all cells below (and *including*) the specified cell.
  public run_all_below_cell(id: string): void {
    const i: number = this.store.get_cell_index(id);
    const v: string[] = this.store.get_cell_list().toJS();
    for (const id of v.slice(i)) {
      this.run_cell(id, false);
    }
    this.save_asap();
  }

  public set_cursor_locs(locs: any[] = [], side_effect: boolean = false): void {
    this.last_cursor_move_time = new Date();
    if (this.syncdb == null) {
      // syncdb not always set -- https://github.com/sagemathinc/cocalc/issues/2107
      return;
    }
    if (locs.length === 0) {
      // don't remove on blur -- cursor will fade out just fine
      return;
    }
    this._cursor_locs = locs; // remember our own cursors for splitting cell
    this.syncdb.set_cursor_locs(locs, side_effect);
  }

  public split_cell(id: string, cursor: { line: number; ch: number }): void {
    if (this.check_edit_protection(id, "splitting cell")) {
      return;
    }
    // insert a new cell before the currently selected one
    const new_id: string = this.insert_cell_adjacent(id, -1, false);

    // split the cell content at the cursor loc
    const cell = this.store.get("cells").get(id);
    if (cell == null) {
      throw Error(`no cell with id=${id}`);
    }
    const cell_type = cell.get("cell_type");
    if (cell_type !== "code") {
      this.set_cell_type(new_id, cell_type, false);
    }
    const input = cell.get("input");
    if (input == null) {
      this.syncdb.commit();
      return; // very easy case.
    }

    const lines = input.split("\n");
    let v = lines.slice(0, cursor.line);
    const line: string | undefined = lines[cursor.line];
    if (line != null) {
      const left = line.slice(0, cursor.ch);
      if (left) {
        v.push(left);
      }
    }
    const top = v.join("\n");

    v = lines.slice(cursor.line + 1);
    if (line != null) {
      const right = line.slice(cursor.ch);
      if (right) {
        v = [right].concat(v);
      }
    }
    const bottom = v.join("\n");
    this.set_cell_input(new_id, top, false);
    this.set_cell_input(id, bottom, true);
  }

  // Copy content from the cell below the given cell into the currently
  // selected cell, then delete the cell below the given cell.
  public merge_cell_below_cell(cell_id: string, save: boolean = true): void {
    const next_id = this.store.get_cell_id(1, cell_id);
    if (next_id == null) {
      // no cell below given cell, so trivial.
      return;
    }
    for (const id of [cell_id, next_id]) {
      if (this.check_edit_protection(id, "merging cell")) return;
    }
    if (this.check_delete_protection(next_id)) return;

    const cells = this.store.get("cells");
    if (cells == null) {
      return;
    }

    const input: string =
      cells.getIn([cell_id, "input"], "") +
      "\n" +
      cells.getIn([next_id, "input"], "");

    const output0 = cells.getIn([cell_id, "output"]);
    const output1 = cells.getIn([next_id, "output"]);
    let output: any = undefined;
    if (output0 == null) {
      output = output1;
    } else if (output1 == null) {
      output = output0;
    } else {
      // both output0 and output1 are defined; need to merge.
      // This is complicated since output is a map from string numbers.
      output = output0;
      let n = output0.size;
      for (let i = 0; i < output1.size; i++) {
        output = output.set(`${n}`, output1.get(`${i}`));
        n += 1;
      }
    }

    this._delete({ type: "cell", id: next_id }, false);
    this._set(
      {
        type: "cell",
        id: cell_id,
        input,
        output: output != null ? output : null,
        start: null,
        end: null,
      },
      save
    );
  }

  // Merge the given cells into one cell, which replaces
  // the frist cell in cell_ids.
  // We also merge all output, instead of throwing away
  // all but first output (which jupyter does, and makes no sense).
  public merge_cells(cell_ids: string[]): void {
    const n = cell_ids.length;
    if (n <= 1) return; // trivial special case.
    for (let i = 0; i < n - 1; i++) {
      this.merge_cell_below_cell(cell_ids[0], i == n - 2);
    }
  }

  // Copy the list of cells into our internal clipboard
  public copy_cells(cell_ids: string[]): void {
    const cells = this.store.get("cells");
    let global_clipboard = immutable.List();
    for (const id of cell_ids) {
      global_clipboard = global_clipboard.push(cells.get(id));
    }
    this.store.set_global_clipboard(global_clipboard);
  }

  public studentProjectFunctionality() {
    return this.redux
      .getStore("projects")
      .get_student_project_functionality(this.project_id);
  }

  public requireToggleReadonly(): void {
    if (this.studentProjectFunctionality().disableJupyterToggleReadonly) {
      throw Error("Toggling of write protection is disabled in this project.");
    }
  }

  /* write protection disables any modifications, entering "edit"
     mode, and prohibits cell evaluations example: teacher handout
     notebook and student should not be able to modify an
     instruction cell in any way. */
  public toggle_write_protection_on_cells(
    cell_ids: string[],
    save: boolean = true
  ): void {
    this.requireToggleReadonly();
    this.toggle_metadata_boolean_on_cells(cell_ids, "editable", true, save);
  }

  // this prevents any cell from being deleted, either directly, or indirectly via a "merge"
  // example: teacher handout notebook and student should not be able to modify an instruction cell in any way
  public toggle_delete_protection_on_cells(
    cell_ids: string[],
    save: boolean = true
  ): void {
    this.requireToggleReadonly();
    this.toggle_metadata_boolean_on_cells(cell_ids, "deletable", true, save);
  }

  // This toggles the boolean value of given metadata field.
  // If not set, it is assumed to be true and toggled to false
  // For more than one cell, the first one is used to toggle
  // all cells to the inverted state
  private toggle_metadata_boolean_on_cells(
    cell_ids: string[],
    key: string,
    default_value: boolean, // default metadata value, if the metadata field is not set.
    save: boolean = true
  ): void {
    for (const id of cell_ids) {
      this.set_cell_metadata({
        id,
        metadata: {
          [key]: !this.store.getIn(
            ["cells", id, "metadata", key],
            default_value
          ),
        },
        merge: true,
        save,
        bypass_edit_protection: true,
      });
    }
    if (save) {
      this.save_asap();
    }
  }

  public toggle_jupyter_metadata_boolean(
    id: string,
    key: string,
    save: boolean = true
  ): void {
    const jupyter = this.store
      .getIn(["cells", id, "metadata", "jupyter"], immutable.Map())
      .toJS();
    jupyter[key] = !jupyter[key];
    this.set_cell_metadata({
      id,
      metadata: { jupyter },
      merge: true,
      save,
    });
  }

  public set_jupyter_metadata(
    id: string,
    key: string,
    value: any,
    save: boolean = true
  ): void {
    const jupyter = this.store
      .getIn(["cells", id, "metadata", "jupyter"], immutable.Map())
      .toJS();
    if (value == null && jupyter[key] == null) return; // nothing to do.
    if (value != null) {
      jupyter[key] = value;
    } else {
      delete jupyter[key];
    }
    this.set_cell_metadata({
      id,
      metadata: { jupyter },
      merge: true,
      save,
    });
  }

  // Paste cells from the internal clipboard; also
  //   delta = 0 -- replace cell_ids cells
  //   delta = 1 -- paste cells below last cell in cell_ids
  //   delta = -1 -- paste cells above first cell in cell_ids.
  public paste_cells_at(cell_ids: string[], delta: 0 | 1 | -1 = 1): void {
    const clipboard = this.store.get_global_clipboard();
    if (clipboard == null || clipboard.size === 0) {
      return; // nothing to do
    }

    if (cell_ids.length === 0) {
      // There are no cells currently selected.  This can
      // happen in an edge case with slow network -- see
      // https://github.com/sagemathinc/cocalc/issues/3899
      clipboard.forEach((cell, i) => {
        cell = cell.set("id", this.new_id()); // randomize the id of the cell
        cell = cell.set("pos", i);
        this._set(cell, false);
      });
      this.ensure_positions_are_unique();
      this._sync();
      return;
    }

    let cell_before_pasted_id: string;
    const cells = this.store.get("cells");
    if (delta === -1 || delta === 0) {
      // one before first selected
      cell_before_pasted_id = this.store.get_cell_id(-1, cell_ids[0]);
    } else if (delta === 1) {
      // last selected
      cell_before_pasted_id = cell_ids[cell_ids.length - 1];
    } else {
      // Typescript should prevent this, but just to be sure.
      throw Error(`delta (=${delta}) must be 0, -1, or 1`);
    }
    try {
      let after_pos: number, before_pos: number | undefined;
      if (delta === 0) {
        // replace, so delete cell_ids, unless just one, since
        // cursor cell_ids selection is confusing with Jupyter's model.
        if (cell_ids.length > 1) {
          this.delete_cells(cell_ids, false);
        }
      }
      // put the cells from the clipboard into the document, setting their positions
      if (cell_before_pasted_id == null) {
        // very top cell
        before_pos = undefined;
        after_pos = cells.getIn([cell_ids[0], "pos"]);
      } else {
        before_pos = cells.getIn([cell_before_pasted_id, "pos"]);
        after_pos = cells.getIn([
          this.store.get_cell_id(+1, cell_before_pasted_id),
          "pos",
        ]);
      }
      const positions = cell_utils.positions_between(
        before_pos,
        after_pos,
        clipboard.size
      );
      clipboard.forEach((cell, i) => {
        cell = cell.set("id", this.new_id()); // randomize the id of the cell
        cell = cell.set("pos", positions[i]);
        this._set(cell, false);
      });
    } finally {
      // very important that we save whatever is done above, so other viewers see it.
      this._sync();
    }
  }

  toggle_toolbar = () => {
    return this.set_toolbar_state(!this.store.get("toolbar"));
  };

  public set_toolbar_state(toolbar: boolean): void {
    // true = visible
    this.setState({ toolbar });
    this.set_local_storage("hide_toolbar", !toolbar);
  }

  public toggle_header(): void {
    (this.redux.getActions("page") as any).toggle_fullscreen();
  }

  public set_header_state(visible: boolean): void {
    (this.redux.getActions("page") as any).set_fullscreen(
      visible ? "default" : undefined
    );
  }

  set_line_numbers = (show: any): void => {
    this.set_local_storage("line_numbers", !!show);
    // unset the line_numbers property from all cells
    const cells = this.store
      .get("cells")
      .map((cell) => cell.delete("line_numbers"));
    if (!cells.equals(this.store.get("cells"))) {
      // actually changed
      this.setState({ cells });
    }
    // now cause cells to update
    this.set_cm_options();
  };

  set_local_storage = (key, value) => {
    if (localStorage == null) return;
    let current_str = get_local_storage(this.name);
    const current =
      current_str != null
        ? typeof current_str === "string"
          ? misc.from_json(current_str)
          : current_str
        : {};
    if (value === null) {
      delete current[key];
    } else {
      current[key] = value;
    }
    set_local_storage(this.name, misc.to_json(current));
  };

  // File --> Open: just show the file listing page.
  file_open = (): void => {
    if (this.redux == null) return;
    this.redux
      .getProjectActions(this.store.get("project_id"))
      .set_active_tab("files");
  };

  // File --> New: like open, but also show the create panel
  file_new = (): void => {
    if (this.redux == null) return;
    const project_actions = this.redux.getProjectActions(
      this.store.get("project_id")
    );
    project_actions.set_active_tab("new");
  };

  private _get_cell_input = (id?: string | undefined): string => {
    this.deprecated("_get_cell_input", id);
    return "";
  };

  // Version of the cell's input stored in store.
  // (A live codemirror editor could have a slightly
  // newer version, so this is only a fallback).
  private get_cell_input(id: string): string {
    return this.store.getIn(["cells", id, "input"], "");
  }

  set_kernel = (kernel: string) => {
    if (this.syncdb.get_state() != "ready") {
      console.warn("Jupyter syncdb not yet ready -- not setting kernel");
      return;
    }
    if (this.store.get("kernel") !== kernel) {
      this._set({
        type: "settings",
        kernel,
      });
    }
    if (this.store.get("show_kernel_selector")) {
      this.hide_select_kernel();
    }
  };

  public show_history_viewer(): void {
    const project_actions = this.redux.getProjectActions(this.project_id);
    if (project_actions == null) return;
    project_actions.open_file({
      path: misc.history_path(this.path),
      foreground: true,
    });
  }

  // Attempt to fetch completions for give code and cursor_pos
  // If successful, the completions are put in store.get('completions') and looks like
  // this (as an immutable map):
  //    cursor_end   : 2
  //    cursor_start : 0
  //    matches      : ['the', 'completions', ...]
  //    status       : "ok"
  //    code         : code
  //    cursor_pos   : cursor_pos
  //
  // If not successful, result is:
  //    status       : "error"
  //    code         : code
  //    cursor_pos   : cursor_pos
  //    error        : 'an error message'
  //
  // Only the most recent fetch has any impact, and calling
  // clear_complete() ensures any fetch made before that
  // is ignored.

  // Returns true if a dialog with options appears, and false otherwise.
  public async complete(
    code: string,
    pos?: { line: number; ch: number } | number,
    id?: string,
    offset?: any
  ): Promise<boolean> {
    if (this.project_conn === undefined) {
      this.setState({ complete: { error: "no project connection" } });
      return false;
    }

    let cursor_pos;
    const req = (this._complete_request =
      (this._complete_request != null ? this._complete_request : 0) + 1);

    this.setState({ complete: undefined });

    // pos can be either a {line:?, ch:?} object as in codemirror,
    // or a number.
    if (pos == null || typeof pos == "number") {
      cursor_pos = pos;
    } else {
      cursor_pos = codemirror_to_jupyter_pos(code, pos);
    }
    cursor_pos = js_idx_to_char_idx(cursor_pos, code);

    const start = new Date();
    let complete;
    try {
      complete = await this.api_call("complete", {
        code,
        cursor_pos,
      });
    } catch (err) {
      if (this._complete_request > req) return false;
      this.setState({ complete: { error: err } });
      // no op for now...
      throw Error(`ignore -- ${err}`);
      //return false;
    }

    if (this.last_cursor_move_time >= start) {
      // see https://github.com/sagemathinc/cocalc/issues/3611
      throw Error("ignore");
      //return false;
    }
    if (this._complete_request > req) {
      // future completion or clear happened; so ignore this result.
      throw Error("ignore");
      //return false;
    }

    if (complete.status !== "ok") {
      this.setState({
        complete: {
          error: complete.error ? complete.error : "completion failed",
        },
      });
      return false;
    }

    if (complete.matches == 0) {
      return false;
    }

    delete complete.status;
    complete.base = code;
    complete.code = code;
    complete.pos = char_idx_to_js_idx(cursor_pos, code);
    complete.cursor_start = char_idx_to_js_idx(complete.cursor_start, code);
    complete.cursor_end = char_idx_to_js_idx(complete.cursor_end, code);
    complete.id = id;
    // Set the result so the UI can then react to the change.
    if (offset != null) {
      complete.offset = offset;
    }
    // For some reason, sometimes complete.matches are not unique, which is annoying/confusing,
    // and breaks an assumption in our react code too.
    complete.matches = Array.from(new Set(complete.matches)).sort();
    const i_complete = immutable.fromJS(complete);
    if (complete.matches && complete.matches.length === 1 && id != null) {
      // special case -- a unique completion and we know id of cell in which completing is given.
      this.select_complete(id, complete.matches[0], i_complete);
      return false;
    } else {
      this.setState({ complete: i_complete });
      return true;
    }
  }

  clear_complete = (): void => {
    this._complete_request =
      (this._complete_request != null ? this._complete_request : 0) + 1;
    this.setState({ complete: undefined });
  };

  public select_complete(
    id: string,
    item: string,
    complete?: immutable.Map<string, any>
  ): void {
    if (complete == null) {
      complete = this.store.get("complete");
    }
    this.clear_complete();
    if (complete == null) {
      return;
    }
    const input = complete.get("code");
    if (input != null && complete.get("error") == null) {
      const starting = input.slice(0, complete.get("cursor_start"));
      const ending = input.slice(complete.get("cursor_end"));
      const new_input = starting + item + ending;
      const base = complete.get("base");
      this.complete_cell(id, base, new_input);
    }
  }

  complete_cell(id: string, base: string, new_input: string): void {
    this.merge_cell_input(id, base, new_input);
  }

  merge_cell_input(
    id: string,
    base: string,
    input: string,
    save: boolean = true
  ): void {
    const remote = this.store.getIn(["cells", id, "input"]);
    if (remote == null || base == null || input == null) {
      return;
    }
    const new_input = three_way_merge({
      base,
      local: input,
      remote,
    });
    this.set_cell_input(id, new_input, save);
  }

  complete_handle_key = (_: string, keyCode: number): void => {
    // User presses a key while the completions dialog is open.
    let complete = this.store.get("complete");
    if (complete == null) {
      return;
    }
    const c = String.fromCharCode(keyCode);
    complete = complete.toJS(); // code is ugly without just doing this - doesn't matter for speed
    const { code } = complete;
    const { pos } = complete;
    complete.code = code.slice(0, pos) + c + code.slice(pos);
    complete.cursor_end += 1;
    complete.pos += 1;
    const target = complete.code.slice(
      complete.cursor_start,
      complete.cursor_end
    );
    complete.matches = (() => {
      const result: any = [];
      for (const x of complete.matches) {
        if (misc.startswith(x, target)) {
          result.push(x);
        }
      }
      return result;
    })();
    if (complete.matches.length === 0) {
      this.clear_complete();
    } else {
      const orig_base = complete.base;
      complete.base = complete.code;
      this.setState({ complete: immutable.fromJS(complete) });
      this.complete_cell(complete.id, orig_base, complete.code);
    }
  };

  is_introspecting(): boolean {
    const actions = this.getFrameActions() as any;
    return actions?.store?.get("introspect") != null;
  }

  introspect_close = () => {
    if (this.is_introspecting()) {
      this.getFrameActions()?.setState({ introspect: undefined });
    }
  };

  introspect_at_pos = async (
    code: string,
    level: 0 | 1 = 0,
    pos: { ch: number; line: number }
  ): Promise<void> => {
    if (code === "") return; // no-op if there is no code (should never happen)
    await this.introspect(code, level, codemirror_to_jupyter_pos(code, pos));
  };

  introspect = async (
    code: string,
    level: 0 | 1,
    cursor_pos?: number
  ): Promise<immutable.Map<string, any> | undefined> => {
    const req = (this._introspect_request =
      (this._introspect_request != null ? this._introspect_request : 0) + 1);

    if (cursor_pos == null) {
      cursor_pos = code.length;
    }
    cursor_pos = js_idx_to_char_idx(cursor_pos, code);

    let introspect;
    try {
      introspect = await this.api_call("introspect", {
        code,
        cursor_pos,
        level,
      });
      if (introspect.status !== "ok") {
        introspect = { error: "completion failed" };
      }
      delete introspect.status;
    } catch (err) {
      introspect = { error: err };
    }
    if (this._introspect_request > req) return;
    const i = immutable.fromJS(introspect);
    this.getFrameActions()?.setState({
      introspect: i,
    });
    return i; // convenient / useful, e.g., for use by whiteboard.
  };

  clear_introspect = (): void => {
    this._introspect_request =
      (this._introspect_request != null ? this._introspect_request : 0) + 1;
    this.getFrameActions()?.setState({ introspect: undefined });
  };

  public async signal(signal = "SIGINT"): Promise<void> {
    // TODO: some setStates, awaits, and UI to reflect this happening...
    try {
      await this.api_call("signal", { signal: signal }, 5000);
    } catch (err) {
      this.set_error(err);
    }
  }

  halt = reuseInFlight(async (): Promise<void> => {
    await this.signal("SIGKILL");
    // Wait a little, since SIGKILL has to really happen on backend,
    // and server has to respond and change state.
    const not_running = (s): boolean => {
      if (this._state === "closed") return true;
      const t = s.get_one({ type: "settings" });
      return t != null && t.get("backend_state") != "running";
    };
    await this.syncdb.wait(not_running, 30);
  });

  restart = reuseInFlight(async (): Promise<void> => {
    await this.halt();
    if (this._state === "closed") return;
    // Actually start it running again (rather than waiting for
    // user to do something), since this is called "restart".
    await this.set_backend_kernel_info(); // causes kernel to start
  });

  public shutdown = reuseInFlight(async (): Promise<void> => {
    if (this._state === "closed") return;
    await this.signal("SIGKILL");
    if (this._state === "closed") return;
    this.clear_all_cell_run_state();
    await this.save_asap();
  });

  set_backend_kernel_info = async (): Promise<void> => {
    if (this._state === "closed" || this.syncdb.is_read_only()) {
      return;
    }

    if (this.is_project) {
      const dbg = this.dbg(`set_backend_kernel_info ${misc.uuid()}`);
      if (
        this.jupyter_kernel == null ||
        this.jupyter_kernel.get_state() == "closed"
      ) {
        dbg("no Jupyter kernel defined");
        return;
      }
      dbg("getting kernel_info...");
      let backend_kernel_info: KernelInfo;
      try {
        backend_kernel_info = immutable.fromJS(
          await this.jupyter_kernel.kernel_info()
        );
      } catch (err) {
        dbg(`error = ${err}`);
        return;
      }
      this.setState({ backend_kernel_info });
    } else {
      await this._set_backend_kernel_info_client();
    }
  };

  _set_backend_kernel_info_client = reuseInFlight(async (): Promise<void> => {
    await retry_until_success({
      max_time: 120000,
      start_delay: 1000,
      max_delay: 10000,
      f: this._fetch_backend_kernel_info_from_server,
      desc: "jupyter:_set_backend_kernel_info_client",
    });
  });

  _fetch_backend_kernel_info_from_server = async (): Promise<void> => {
    const f = async () => {
      if (this._state === "closed") {
        return;
      }
      const data = await this.api_call("kernel_info", {});
      this.setState({
        backend_kernel_info: data,
        // this is when the server for this doc started, not when kernel last started!
        start_time: data.start_time,
      });
    };
    try {
      await retry_until_success({
        max_time: 1000 * 60 * 30,
        start_delay: 500,
        max_delay: 3000,
        f,
        desc: "jupyter:_fetch_backend_kernel_info_from_server",
      });
    } catch (err) {
      this.set_error(err);
    }
    if (this.is_closed()) return;
    // Update the codemirror editor options.
    this.set_cm_options();
  };

  // Do a file action, e.g., 'compress', 'delete', 'rename', 'duplicate', 'move',
  // 'copy', 'share', 'download', 'open_file', 'close_file', 'reopen_file'
  // Each just shows
  // the corresponding dialog in
  // the file manager, so gives a step to confirm, etc.
  // The path may optionally be *any* file in this project.
  public async file_action(action_name: string, path?: string): Promise<void> {
    const a = this.redux.getProjectActions(this.store.get("project_id"));
    if (path == null) {
      path = this.store.get("path");
      if (path == null) {
        throw Error("path must be defined in the store to use default");
      }
    }
    if (action_name === "reopen_file") {
      a.close_file(path);
      // ensure the side effects from changing registered
      // editors in project_file.* finish happening
      await awaiting.delay(0);
      a.open_file({ path });
      return;
    }
    if (action_name === "close_file") {
      await this.syncdb.save();
      a.close_file(path);
      return;
    }
    if (action_name === "open_file") {
      a.open_file({ path });
      return;
    }
    if (action_name == "download") {
      a.download_file({ path });
      return;
    }
    const { head, tail } = misc.path_split(path);
    a.open_directory(head);
    a.set_all_files_unchecked();
    a.set_file_checked(path, true);
    return a.set_file_action(action_name, () => tail);
  }

  set_max_output_length = (n) => {
    return this._set({
      type: "settings",
      max_output_length: n,
    });
  };

  fetch_more_output = async (id: string): Promise<void> => {
    const time = this._client.server_time() - 0;
    try {
      const more_output = await this.api_call("more_output", { id: id }, 60000);
      if (!this.store.getIn(["cells", id, "scrolled"])) {
        // make output area scrolled, since there is going to be a lot of output
        this.toggle_output(id, "scrolled");
      }
      this.set_more_output(id, { time, mesg_list: more_output });
    } catch (err) {
      this.set_error(err);
    }
  };

  // NOTE: set_more_output on project-actions is different
  set_more_output = (id: string, more_output: any, _?: any): void => {
    if (this.store.getIn(["cells", id]) == null) {
      return;
    }
    const x = this.store.get("more_output", immutable.Map());
    this.setState({
      more_output: x.set(id, immutable.fromJS(more_output)),
    });
  };

  reset_more_output = (id?: any): void => {
    let left: any;
    const more_output =
      (left = this.store.get("more_output")) != null ? left : immutable.Map();
    if (more_output.has(id)) {
      this.setState({ more_output: more_output.delete(id) });
    }
  };

  protected set_cm_options(): void {
    const mode = this.store.get_cm_mode();
    const account = this.redux.getStore("account");
    if (account == null) return;
    const immutable_editor_settings = account.get("editor_settings");
    if (immutable_editor_settings == null) return;
    const editor_settings = immutable_editor_settings.toJS();
    const line_numbers =
      this.store.get_local_storage("line_numbers") ??
      immutable_editor_settings.get("jupyter_line_numbers") ??
      false;
    const read_only = this.store.get("read_only");
    const x = immutable.fromJS({
      options: cm_options(mode, editor_settings, line_numbers, read_only),
      markdown: cm_options(
        { name: "gfm2" },
        editor_settings,
        line_numbers,
        read_only
      ),
    });

    if (!x.equals(this.store.get("cm_options"))) {
      // actually changed
      this.setState({ cm_options: x });
    }
  }

  set_trust_notebook = (trust: any, save: boolean = true) => {
    return this._set(
      {
        type: "settings",
        trust: !!trust,
      },
      save
    ); // case to bool
  };

  public insert_image(id: string): void {
    if (this.check_edit_protection(id, "inserting an image")) {
      return;
    }
    if (this.store.get_cell_type(id) != "markdown") {
      throw Error("must be a markdown cell -- id " + id);
    }
    this.setState({ insert_image: id }); // causes a modal dialog to appear.
  }

  scroll(pos): any {
    this.deprecated("scroll", pos);
  }

  // submit input for a particular cell -- this is used by the
  // Input component output message type for interactive input.
  public async submit_input(id: string, value: string): Promise<void> {
    const output = this.store.getIn(["cells", id, "output"]);
    if (output == null) {
      return;
    }
    const n = `${output.size - 1}`;
    const mesg = output.get(n);
    if (mesg == null) {
      return;
    }

    if (mesg.getIn(["opts", "password"])) {
      // handle password input separately by first submitting to the backend.
      try {
        await this.submit_password(id, value);
      } catch (err) {
        this.set_error(`Error setting backend key/value store (${err})`);
        return;
      }
      const m = value.length;
      value = "";
      for (let i = 0; i < m; i++) {
        value == "●";
      }
      this.set_cell_output(id, output.set(n, mesg.set("value", value)), false);
      this.save_asap();
      return;
    }

    this.set_cell_output(id, output.set(n, mesg.set("value", value)), false);
    this.save_asap();
  }

  submit_password = async (id: string, value: any): Promise<void> => {
    await this.set_in_backend_key_value_store(id, value);
  };

  set_in_backend_key_value_store = async (
    key: any,
    value: any
  ): Promise<void> => {
    try {
      await this.api_call("store", { key, value });
    } catch (err) {
      this.set_error(err);
    }
  };

  public async set_to_ipynb(
    ipynb: any,
    data_only: boolean = false
  ): Promise<void> {
    /*
     * set_to_ipynb - set from ipynb object.  This is
     * mainly meant to be run on the backend in the project,
     * but is also run on the frontend too, e.g.,
     * for client-side nbviewer (in which case it won't remove images, etc.).
     *
     * See the documentation for load_ipynb_file in project-actions.ts for
     * documentation about the data_only input variable.
     */
    if (typeof ipynb != "object") {
      throw Error("ipynb must be an object");
    }

    this._state = "load";

    //dbg(misc.to_json(ipynb))

    // We try to parse out the kernel so we can use process_output below.
    // (TODO: rewrite so process_output is not associated with a specific kernel)
    let kernel: string | undefined;
    const ipynb_metadata = ipynb.metadata;
    if (ipynb_metadata != null) {
      const kernelspec = ipynb_metadata.kernelspec;
      if (kernelspec != null) {
        kernel = kernelspec.name;
      }
    }
    //dbg("kernel in ipynb: name='#{kernel}'")

    const existing_ids = this.store.get_cell_list().toJS();

    let set, trust;
    if (data_only) {
      trust = undefined;
      set = function () {};
    } else {
      if (typeof this.reset_more_output === "function") {
        this.reset_more_output();
        // clear the more output handler (only on backend)
      }
      // We delete all of the cells.
      // We do NOT delete everything, namely the last_loaded and
      // the settings entry in the database, because that would
      // throw away important information, e.g., the current kernel
      // and its state.  NOTe: Some of that extra info *should* be
      // moved to a different ephemeral table, but I haven't got
      // around to doing so.
      this.syncdb.delete({ type: "cell" });
      // preserve trust state across file updates/loads
      trust = this.store.get("trust");
      set = (obj) => {
        this.syncdb.set(obj);
      };
    }

    // Change kernel to what is in the file if necessary:
    set({ type: "settings", kernel });
    if (typeof this.ensure_backend_kernel_setup === "function") {
      this.ensure_backend_kernel_setup();
    }

    const importer = new IPynbImporter();

    // NOTE: Below we re-use any existing ids to make the patch that defines changing
    // to the contents of ipynb more efficient.   In case of a very slight change
    // on disk, this can be massively more efficient.

    importer.import({
      ipynb,
      existing_ids,
      new_id: this.new_id.bind(this),
      process_attachment:
        this.jupyter_kernel != null
          ? this.jupyter_kernel.process_attachment
          : undefined,
      output_handler:
        this.jupyter_kernel != null ? this._output_handler : undefined, // undefined in client; defined in project
    });

    if (data_only) {
      importer.close();
      return;
    }

    // Set all the cells
    const object = importer.cells();
    for (const _ in object) {
      const cell = object[_];
      set(cell);
    }

    // Set the settings
    set({ type: "settings", kernel: importer.kernel(), trust });

    // Set extra user-defined metadata
    const metadata = importer.metadata();
    if (metadata != null) {
      set({ type: "settings", metadata });
    }

    importer.close();

    this.syncdb.commit();
    await this.syncdb.save();
    if (typeof this.ensure_backend_kernel_setup === "function") {
      this.ensure_backend_kernel_setup();
    }
    this._state = "ready";
  }

  public set_cell_slide(id: string, value: any): void {
    if (!value) {
      value = null; // delete
    }
    if (this.check_edit_protection(id, "making a cell aslide")) {
      return;
    }
    this._set({
      type: "cell",
      id,
      slide: value,
    });
  }

  public ensure_positions_are_unique(): void {
    const changes = cell_utils.ensure_positions_are_unique(
      this.store.get("cells")
    );
    if (changes != null) {
      for (const id in changes) {
        const pos = changes[id];
        this.set_cell_pos(id, pos, false);
      }
    }
    this._sync();
  }

  set_default_kernel = (kernel: any): void => {
    // doesn't make sense for project (right now at least)
    if (this.is_project) return;
    const account_store = this.redux.getStore("account") as any;
    if (account_store == null) return;
    const cur: any = {};
    // if available, retain existing jupyter config
    const acc_jup = account_store.getIn(["editor_settings", "jupyter"]);
    if (acc_jup != null) {
      Object.assign(cur, acc_jup.toJS());
    }
    // set new kernel and save it
    cur.kernel = kernel;
    (this.redux.getTable("account") as any).set({
      editor_settings: { jupyter: cur },
    });
  };

  edit_attachments = (id: string): void => {
    this.setState({ edit_attachments: id });
  };

  _attachment_markdown = (name: any) => {
    return `![${name}](attachment:${name})`;
    // Don't use this because official Jupyter tooling can't deal with it. See
    //    https://github.com/sagemathinc/cocalc/issues/5055
    return `<img src="attachment:${name}" style="max-width:100%">`;
  };

  insert_input_at_cursor = (id: string, s: string, save: boolean = true) => {
    // TODO: this maybe doesn't make sense anymore...
    // TODO: redo this -- note that the input below is wrong, since it is
    // from the store, not necessarily from what is live in the cell.

    if (this.store.getIn(["cells", id]) == null) {
      return;
    }
    if (this.check_edit_protection(id, "inserting input")) {
      return;
    }
    let input = this.store.getIn(["cells", id, "input"], "");
    const cursor = this._cursor_locs != null ? this._cursor_locs[0] : undefined;
    if ((cursor != null ? cursor.id : undefined) === id) {
      const v = input.split("\n");
      const line = v[cursor.y];
      v[cursor.y] = line.slice(0, cursor.x) + s + line.slice(cursor.x);
      input = v.join("\n");
    } else {
      input += s;
    }
    return this._set({ type: "cell", id, input }, save);
  };

  // Sets attachments[name] = val
  public set_cell_attachment(
    id: string,
    name: string,
    val: any,
    save: boolean = true
  ): void {
    const cell = this.store.getIn(["cells", id]);
    if (cell == null) {
      throw Error(`no cell ${id}`);
    }
    if (this.check_edit_protection(id, "setting an attachment")) return;
    const attachments = cell.get("attachments", immutable.Map()).toJS();
    attachments[name] = val;
    this._set(
      {
        type: "cell",
        id,
        attachments,
      },
      save
    );
  }

  public async add_attachment_to_cell(id: string, path: string): Promise<void> {
    if (this.check_edit_protection(id, "adding an attachment")) {
      return;
    }
    let name: string = encodeURIComponent(
      misc.path_split(path).tail.toLowerCase()
    );
    name = name.replace(/\(/g, "%28").replace(/\)/g, "%29");
    this.set_cell_attachment(id, name, { type: "load", value: path });
    await callback2(this.store.wait, {
      until: () =>
        this.store.getIn(["cells", id, "attachments", name, "type"]) === "sha1",
      timeout: 0,
    });
    // This has to happen in the next render loop, since changing immediately
    // can update before the attachments props are updated.
    await awaiting.delay(10);
    this.insert_input_at_cursor(id, this._attachment_markdown(name), true);
  }

  delete_attachment_from_cell = (id: string, name: any) => {
    if (this.check_edit_protection(id, "deleting an attachment")) {
      return;
    }
    this.set_cell_attachment(id, name, null, false);
    this.set_cell_input(
      id,
      misc.replace_all(
        this._get_cell_input(id),
        this._attachment_markdown(name),
        ""
      )
    );
  };

  add_tag(id: string, tag: string, save: boolean = true): void {
    if (this.check_edit_protection(id, "adding a tag")) {
      return;
    }
    return this._set(
      {
        type: "cell",
        id,
        tags: { [tag]: true },
      },
      save
    );
  }

  remove_tag(id: string, tag: string, save: boolean = true): void {
    if (this.check_edit_protection(id, "removing a tag")) {
      return;
    }
    return this._set(
      {
        type: "cell",
        id,
        tags: { [tag]: null },
      },
      save
    );
  }

  toggle_tag(id: string, tag: string, save: boolean = true): void {
    const cell = this.store.getIn(["cells", id]);
    if (cell == null) {
      throw Error(`no cell with id ${id}`);
    }
    const tags = cell.get("tags");
    if (tags == null || !tags.get(tag)) {
      this.add_tag(id, tag, save);
    } else {
      this.remove_tag(id, tag, save);
    }
  }

  edit_cell_metadata = (id: string): void => {
    const metadata = this.store.getIn(
      ["cells", id, "metadata"],
      immutable.Map()
    );
    this.setState({ edit_cell_metadata: { id, metadata } });
  };

  public set_global_metadata(metadata: object, save: boolean = true): void {
    const cur = this.syncdb.get_one({ type: "settings" })?.toJS()?.metadata;
    if (cur) {
      metadata = {
        ...cur,
        ...metadata,
      };
    }
    this.syncdb.set({ type: "settings", metadata });
    if (save) {
      this.syncdb.commit();
    }
  }

  public set_cell_metadata(opts: {
    id: string;
    metadata?: object; // not given = delete it
    save?: boolean; // defaults to true if not given
    merge?: boolean; // defaults to false if not given, in which case sets metadata, rather than merge.  If true, does a SHALLOW merge.
    bypass_edit_protection?: boolean;
  }): void {
    let { id, metadata, save, merge, bypass_edit_protection } = (opts =
      defaults(opts, {
        id: required,
        metadata: required,
        save: true,
        merge: false,
        bypass_edit_protection: false,
      }));

    if (
      !bypass_edit_protection &&
      this.check_edit_protection(id, "editing cell metadata")
    ) {
      return;
    }
    // Special case: delete metdata (unconditionally)
    if (metadata == null || misc.len(metadata) === 0) {
      this._set(
        {
          type: "cell",
          id,
          metadata: null,
        },
        save
      );
      return;
    }

    if (merge) {
      const current = this.store.getIn(
        ["cells", id, "metadata"],
        immutable.Map()
      );
      metadata = current.merge(immutable.fromJS(metadata)).toJS();
    }

    // special fields
    // "collapsed", "scrolled", "slideshow", and "tags"
    if (metadata.tags != null) {
      for (const tag of metadata.tags) {
        this.add_tag(id, tag, false);
      }
      delete metadata.tags;
    }
    // important to not store redundant inconsistent fields:
    for (const field of ["collapsed", "scrolled", "slideshow"]) {
      if (metadata[field] != null) {
        delete metadata[field];
      }
    }

    if (!merge) {
      // first delete -- we have to do this due to shortcomings in syncdb, but it
      // can have annoying side effects on the UI
      this._set(
        {
          type: "cell",
          id,
          metadata: null,
        },
        false
      );
    }
    // now set
    this._set(
      {
        type: "cell",
        id,
        metadata,
      },
      save
    );
    if (this.store.getIn(["edit_cell_metadata", "id"]) === id) {
      this.edit_cell_metadata(id); // updates the state while editing
    }
  }

  public set_raw_ipynb(): void {
    if (this._state != "ready") {
      // lies otherwise...
      return;
    }

    this.setState({
      raw_ipynb: immutable.fromJS(this.store.get_ipynb()),
    });
  }

  private async api_call_formatter(
    str: string,
    config: FormatterConfig,
    timeout_ms?: number
  ): Promise<string | undefined> {
    if (this._state === "closed") {
      throw Error("closed");
    }
    return await (
      await this.init_project_conn()
    ).api.formatter_string(str, config, timeout_ms);
  }

  private async format_cell(id: string): Promise<void> {
    const cell = this.store.getIn(["cells", id]);
    if (cell == null) {
      throw new Error(`no cell with id ${id}`);
    }
    let code: string = cell.get("input", "").trim();
    let config: FormatterConfig;
    const cell_type: string = cell.get("cell_type", "code");
    switch (cell_type) {
      case "code":
        const syntax: Syntax = this.store.get_kernel_syntax();
        if (syntax == null) {
          return; // no-op on these.
        }
        config = { syntax: syntax };
        break;
      case "markdown":
        config = { syntax: "markdown" };
        break;
      default:
        // no-op -- do not format unknown cells
        return;
    }
    //  console.log("FMT", cell_type, options, code);
    let resp: string | undefined;
    try {
      code = parsing.process_magics(code, config.syntax, "escape");
      resp = await this.api_call_formatter(code, config);
      resp = parsing.process_magics(resp, config.syntax, "unescape");
    } catch (err) {
      this.set_error(err);
      // Do not process response (probably empty anyways) if
      // there is a problem
      return;
    }
    if (resp == null) return; // make everyone happy …
    // We additionally trim the output, because formatting code introduces
    // a trailing newline
    this.set_cell_input(id, JupyterActions.trim_code(resp), false);
  }

  private static trim_code(str: string): string {
    str = str.trim();
    if (str.length > 0 && str.slice(-1) == "\n") {
      return str.slice(0, -2);
    }
    return str;
  }

  public async format_cells(
    cell_ids: string[],
    sync: boolean = true
  ): Promise<void> {
    this.set_error(null);
    const jobs: string[] = cell_ids.filter((id) =>
      this.store.is_cell_editable(id)
    );

    try {
      await awaiting.map(jobs, 4, this.format_cell.bind(this));
    } catch (err) {
      this.set_error(err.message);
      return;
    }

    if (sync) {
      this._sync();
    }
  }

  public async format_all_cells(sync: boolean = true): Promise<void> {
    await this.format_cells(this.store.get_cell_ids_list(), sync);
  }

  private check_select_kernel(): void {
    const kernel = this.store.get("kernel");
    if (kernel == null) return;

    let unknown_kernel = false;
    if (this.store.get("kernels") != null)
      unknown_kernel = this.store.get_kernel_info(kernel) == null;

    // a kernel is set, but we don't know it
    if (unknown_kernel) {
      this.show_select_kernel("bad kernel");
    } else {
      // we got a kernel, close dialog if not requested by user
      if (
        this.store.get("show_kernel_selector") &&
        this.store.get("show_kernel_selector_reason") === "bad kernel"
      ) {
        this.hide_select_kernel();
      }
    }
    this.setState({ check_select_kernel_init: true });
  }

  update_select_kernel_data = (): void => {
    const kernels = jupyter_kernels.get(this.store.jupyter_kernel_key());
    if (kernels == null) return;
    const kernel_selection = this.store.get_kernel_selection(kernels);
    const [kernels_by_name, kernels_by_language] =
      this.store.get_kernels_by_name_or_language(kernels);
    const default_kernel = this.store.get_default_kernel();
    // do we have a similar kernel?
    let closestKernel: Kernel | undefined = undefined;
    const kernel = this.store.get("kernel");
    const kernel_info = this.store.get_kernel_info(kernel);
    // unknown kernel, we try to find a close match
    if (kernel_info == null && kernel != null) {
      // kernel & kernels must be defined
      closestKernel = misc.closest_kernel_match(kernel, kernels as any) as any;
      // TODO about that any above: closest_kernel_match should be moved here so it knows the typings
    }
    this.setState({
      kernel_selection,
      kernels_by_name,
      kernels_by_language,
      default_kernel,
      closestKernel,
    });
  };

  set_mode(mode: "escape" | "edit"): void {
    this.deprecated("set_mode", mode);
  }

  public focus(wait?: boolean): void {
    this.deprecated("focus", wait);
  }

  public blur(): void {
    this.deprecated("blur");
  }

  show_select_kernel = (reason: show_kernel_selector_reasons): void => {
    this.update_select_kernel_data();
    // we might not have the "kernels" data yet (but we will, once fetching it is complete)
    // the select dialog will show a loading spinner
    this.setState({
      show_kernel_selector_reason: reason,
      show_kernel_selector: true,
    });
  };

  hide_select_kernel = (): void => {
    this.setState({
      show_kernel_selector_reason: undefined,
      show_kernel_selector: false,
      kernel_selection: undefined,
      kernels_by_name: undefined,
    });
  };

  select_kernel = (kernel_name: string): void => {
    this.set_kernel(kernel_name);
    this.set_default_kernel(kernel_name);
    this.focus(true);
    this.hide_select_kernel();
  };

  kernel_dont_ask_again = (dont_ask: boolean): void => {
    // why is "as any" necessary?
    const account_table = this.redux.getTable("account") as any;
    account_table.set({
      editor_settings: { ask_jupyter_kernel: !dont_ask },
    });
  };

  public check_edit_protection(id: string, reason?: string): boolean {
    if (!this.store.is_cell_editable(id)) {
      this.show_not_editable_error(reason);
      return true;
    } else {
      return false;
    }
  }

  public check_delete_protection(id: string): boolean {
    if (!this.store.is_cell_deletable(id)) {
      this.show_not_deletable_error();
      return true;
    } else {
      return false;
    }
  }

  split_current_cell = () => {
    this.deprecated("split_current_cell");
  };

  public update_contents(): void {
    if (this._state == "closed") return;
    const cells = this.store.get("cells");
    if (cells == null) return;
    const cell_list = this.store.get("cell_list");
    if (cell_list == null) return;
    const contents = immutable.fromJS(parse_headings(cells, cell_list));
    this.setState({ contents });
  }

  handle_nbconvert_change(_oldVal, _newVal): void {
    throw Error("define this in derived class");
  }
}

function bounded_integer(n: any, min: any, max: any, def: any) {
  if (typeof n !== "number") {
    n = parseInt(n);
  }
  if (isNaN(n)) {
    return def;
  }
  n = Math.round(n);
  if (n < min) {
    return min;
  }
  if (n > max) {
    return max;
  }
  return n;
}
