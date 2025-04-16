/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Jupyter actions -- these are the actions for the underlying document structure.
This can be used both on the frontend and the backend.
*/

// This was 10000 for a while and that caused regular noticeable problems:
//    https://github.com/sagemathinc/cocalc/issues/4590
const DEFAULT_MAX_OUTPUT_LENGTH = 250000;
//const DEFAULT_MAX_OUTPUT_LENGTH = 1000;

// Maximum number of output messages total.  If nmore, you have to click
// "Fetch additional output" to see them.
export const MAX_OUTPUT_MESSAGES = 500;
//export const MAX_OUTPUT_MESSAGES = 5;

// Limit blob store to 100 MB. This means you can have at most this much worth
// of recents images displayed in notebooks.  E.g, if you had a single
// notebook with more than this much in images, the oldest ones would
// start vanishing from output.  Also, this impacts time travel.
// WARNING: It is *not* at all difficult to hit fairly large sizes, e.g., 50MB+
// when working with a notebook, by just drawing a bunch of large plots.
const MAX_BLOB_STORE_SIZE = 100 * 1000000;

declare const localStorage: any;

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import * as immutable from "immutable";
import { Actions } from "@cocalc/util/redux/Actions";
import { three_way_merge } from "@cocalc/sync/editor/generic/util";
import { callback2, retry_until_success } from "@cocalc/util/async-utils";
import * as misc from "@cocalc/util/misc";
import { delay } from "awaiting";
import * as cell_utils from "@cocalc/jupyter/util/cell-utils";
import { JupyterStore, JupyterStoreState } from "@cocalc/jupyter/redux/store";
import { Cell, KernelInfo } from "@cocalc/jupyter/types";
import { IPynbImporter } from "@cocalc/jupyter/ipynb/import-from-ipynb";
import type { JupyterKernelInterface } from "@cocalc/jupyter/types/project-interface";
import {
  char_idx_to_js_idx,
  codemirror_to_jupyter_pos,
  js_idx_to_char_idx,
} from "@cocalc/jupyter/util/misc";
import { SyncDB } from "@cocalc/sync/editor/db/sync";
import type { Client } from "@cocalc/sync/client/types";
import latexEnvs from "@cocalc/util/latex-envs";
import { jupyterApiClient } from "@cocalc/nats/service/jupyter";
import { type AKV, akv } from "@cocalc/nats/sync/akv";

const { close, required, defaults } = misc;

/*
The actions -- what you can do with a jupyter notebook, and also the
underlying synchronized state.
*/

// no worries, they don't break react rendering even when they escape
const CellWriteProtectedException = new Error("CellWriteProtectedException");
const CellDeleteProtectedException = new Error("CellDeleteProtectedException");

type State = "init" | "load" | "ready" | "closed";

export abstract class JupyterActions extends Actions<JupyterStoreState> {
  public is_project: boolean;
  public is_compute_server?: boolean;
  readonly path: string;
  readonly project_id: string;
  private _last_start?: number;
  public jupyter_kernel?: JupyterKernelInterface;
  private last_cursor_move_time: Date = new Date(0);
  private _cursor_locs?: any;
  private _introspect_request?: any;
  protected set_save_status: any;
  protected _client: Client;
  protected _file_watcher: any;
  protected _state: State;
  protected restartKernelOnClose?: (...args: any[]) => void;
  public asyncBlobStore: AKV;

  public _complete_request?: number;
  public store: JupyterStore;
  public syncdb: SyncDB;
  private labels?: {
    math: { [label: string]: { tag: string; id: string } };
    fig: { [label: string]: { tag: string; id: string } };
  };

  public _init(
    project_id: string,
    path: string,
    syncdb: SyncDB,
    store: any,
    client: Client,
  ): void {
    this._client = client;
    const dbg = this.dbg("_init");
    dbg("Initializing Jupyter Actions");
    if (project_id == null || path == null) {
      // typescript should ensure this, but just in case.
      throw Error("type error -- project_id and path can't be null");
    }
    store.dbg = (f) => {
      return client.dbg(`JupyterStore('${store.get("path")}').${f}`);
    };
    this._state = "init"; // 'init', 'load', 'ready', 'closed'
    this.store = store;
    // @ts-ignore
    this.project_id = project_id;
    // @ts-ignore
    this.path = path;
    store.syncdb = syncdb;
    this.syncdb = syncdb;
    // the project client is designated to manage execution/conflict, etc.
    this.is_project = client.is_project();
    if (this.is_project) {
      this.syncdb.on("first-load", () => {
        dbg("handling first load of syncdb in project");
        // Clear settings the first time the syncdb is ever
        // loaded, since it has settings like "ipynb last save"
        // and trust, which shouldn't be initialized to
        // what they were before. Not doing this caused
        // https://github.com/sagemathinc/cocalc/issues/7074
        this.syncdb.delete({ type: "settings" });
        this.syncdb.commit();
      });
    }
    this.is_compute_server = client.is_compute_server();

    let directory: any;
    const split_path = misc.path_split(path);
    if (split_path != null) {
      directory = split_path.head;
    }

    this.setState({
      error: undefined,
      has_unsaved_changes: false,
      sel_ids: immutable.Set(), // immutable set of selected cells
      md_edit_ids: immutable.Set(), // set of ids of markdown cells in edit mode
      mode: "escape",
      project_id,
      directory,
      path,
      max_output_length: DEFAULT_MAX_OUTPUT_LENGTH,
    });

    this.syncdb.on("change", this._syncdb_change);

    this.syncdb.on("close", this.close);

    this.asyncBlobStore = akv(this.blobStoreOptions());

    // Hook for additional initialization.
    this.init2();
  }

  protected blobStoreOptions = () => {
    return {
      name: `jupyter:${this.path}`,
      project_id: this.project_id,
      valueType: "binary",
      limits: {
        max_bytes: MAX_BLOB_STORE_SIZE,
      },
    } as const;
  };

  // default is to do nothing, but e.g., frontend browser client
  // does overload this to do a lot of additional init.
  protected init2(): void {
    // this can be overloaded in a derived class
  }

  // Only use this on the frontend, of course.
  protected getFrameActions() {
    return this.redux.getEditorActions(this.project_id, this.path);
  }

  sync_read_only = (): void => {
    if (this._state == "closed") return;
    const a = this.store.get("read_only");
    const b = this.syncdb?.is_read_only();
    if (a !== b) {
      this.setState({ read_only: b });
      this.set_cm_options();
    }
  };

  protected api = (opts: { timeout?: number } = {}) => {
    return jupyterApiClient({
      project_id: this.project_id,
      path: this.path,
      timeout: opts.timeout,
    });
  };

  protected dbg(f: string) {
    if (this.is_closed()) {
      // calling dbg after the actions are closed is possible; this.store would
      // be undefined, and then this log message would crash, which sucks.  It happened to me.
      // See https://github.com/sagemathinc/cocalc/issues/6788
      return (..._) => {};
    }
    return this._client.dbg(`JupyterActions("${this.path}").${f}`);
  }

  protected close_client_only(): void {
    // no-op: this can be defined in a derived class. E.g., in the frontend, it removes
    // an account_change listener.
  }

  public is_closed(): boolean {
    return this._state === "closed" || this._state === undefined;
  }

  public async close({ noSave }: { noSave?: boolean } = {}): Promise<void> {
    if (this.is_closed()) {
      return;
    }
    // ensure save to disk happens:
    //   - it will automatically happen for the sync-doc file, but
    //     we also need it for the ipynb file... as ipynb is unique
    //     in having two formats.
    if (!noSave) {
      await this.save();
    }
    if (this.is_closed()) {
      return;
    }

    if (this.syncdb != null) {
      this.syncdb.close();
    }
    if (this._file_watcher != null) {
      this._file_watcher.close();
    }
    if (this.is_project || this.is_compute_server) {
      this.close_project_only();
    } else {
      this.close_client_only();
    }
    // We *must* destroy the action before calling close,
    // since otherwise this.redux and this.name are gone,
    // which makes destroying the actions properly impossible.
    this.destroy();
    this.store.destroy();
    close(this);
    this._state = "closed";
  }

  public close_project_only() {
    // real version is in derived class that project runs.
  }

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
    if ((cur?.indexOf(err) ?? -1) >= 0) {
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
    if (!this.store) return;
    if (this.store.getIn(["cells", id, "input"]) == input) {
      // nothing changed.   Note, I tested doing the above check using
      // both this.syncdb and this.store, and this.store is orders of magnitude faster.
      return;
    }
    if (this.check_edit_protection(id, "changing input")) {
      // note -- we assume above that there was an actual change before checking
      // for edit protection.  Thus the above check is important.
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
      save,
    );
  }

  set_cell_output = (id: string, output: any, save = true) => {
    this._set(
      {
        type: "cell",
        id,
        output,
      },
      save,
    );
  };

  setCellId = (id: string, newId: string, save = true) => {
    let cell = this.store.getIn(["cells", id])?.toJS();
    if (cell == null) {
      return;
    }
    cell.id = newId;
    this.syncdb.delete({ type: "cell", id });
    this.syncdb.set(cell);
    if (save) {
      this.syncdb.commit();
    }
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
      if (cell == null) continue;
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
      }.`,
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
    property: "collapsed" | "scrolled",
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
        this._set(
          {
            type: "cell",
            id,
            [property]: !cell.get(
              property,
              property == "scrolled" ? false : true, // default scrolled to false
            ),
          },
          false,
        );
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

  public moveCell(
    oldIndex: number,
    newIndex: number,
    save: boolean = true,
  ): void {
    if (oldIndex == newIndex) return; // nothing to do
    // Move the cell that is currently at position oldIndex to
    // be at position newIndex.
    const cell_list = this.store.get_cell_list();
    const newPos = cell_utils.moveCell({
      oldIndex,
      newIndex,
      size: cell_list.size,
      getPos: (index) =>
        this.store.getIn(["cells", cell_list.get(index) ?? "", "pos"]) ?? 0,
    });
    this.set_cell_pos(cell_list.get(oldIndex) ?? "", newPos, save);
  }

  public set_cell_type(
    id: string,
    cell_type: string = "code",
    save: boolean = true,
  ): void {
    if (this.check_edit_protection(id, "changing cell type")) return;
    if (
      cell_type !== "markdown" &&
      cell_type !== "raw" &&
      cell_type !== "code"
    ) {
      throw Error(
        `cell type (='${cell_type}') must be 'markdown', 'raw', or 'code'`,
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

  private syncdb_cell_change = (id: string, new_cell: any): boolean => {
    const cells: immutable.Map<
      string,
      immutable.Map<string, any>
    > = this.store.get("cells");
    if (cells == null) {
      throw Error("BUG -- cells must have been initialized!");
    }

    let cell_list_needs_recompute = false;
    //this.dbg("_syncdb_cell_change")("#{id} #{JSON.stringify(new_cell?.toJS())}")
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
      if (
        old_cell != null &&
        new_cell.get("start") > old_cell.get("start") &&
        !this.is_project &&
        !this.is_compute_server
      ) {
        // cell re-evaluated so any more output is no longer valid -- clear frontend state
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

    this.onCellChange(id, new_cell, old_cell);
    this.store.emit("cell_change", id, new_cell, old_cell);

    return cell_list_needs_recompute;
  };

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
    const doInit = this._state === "init";
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
              last_backend_state: record.get("last_backend_state"),
              kernel_state: record.get("kernel_state"),
              metadata: record.get("metadata"), // extra custom user-specified metadata
              max_output_length: bounded_integer(
                record.get("max_output_length"),
                100,
                250000,
                DEFAULT_MAX_OUTPUT_LENGTH,
              ),
            };
            if (kernel !== orig_kernel) {
              obj.kernel = kernel;
              obj.kernel_info = this.store.get_kernel_info(kernel);
              obj.backend_kernel_info = undefined;
            }
            this.setState(obj);
            if (
              !this.is_project &&
              !this.is_compute_server &&
              orig_kernel !== kernel
            ) {
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
            if (this.is_project || this.is_compute_server) {
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
            const orig_kernel = this.store.get("kernel", null);
            const kernel = record.get("kernel");
            const obj: any = {
              trust: !!record.get("trust"), // case to boolean
              backend_state: record.get("backend_state"),
              last_backend_state: record.get("last_backend_state"),
              kernel_state: record.get("kernel_state"),
              kernel_error: record.get("kernel_error"),
              metadata: record.get("metadata"), // extra custom user-specified metadata
              connection_file: record.get("connection_file") ?? "",
              max_output_length: bounded_integer(
                record.get("max_output_length"),
                100,
                250000,
                DEFAULT_MAX_OUTPUT_LENGTH,
              ),
            };
            if (kernel !== orig_kernel) {
              obj.kernel = kernel;
              obj.kernel_info = this.store.get_kernel_info(kernel);
              obj.backend_kernel_info = undefined;
            }
            const prev_backend_state = this.store.get("backend_state");
            this.setState(obj);
            if (!this.is_project && !this.is_compute_server) {
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

    this.__syncdb_change_post_hook(doInit);
  };

  protected __syncdb_change_post_hook(_doInit: boolean) {
    // no-op in base class -- does interesting and different
    // things in project, browser, etc.
  }

  protected onCellChange(_id: string, _new_cell: any, _old_cell: any) {
    // no-op in base class.  This is a hook though
    // for potentially doing things when any cell changes.
  }

  ensure_backend_kernel_setup() {
    // nontrivial in the project, but not in client or here.
  }

  protected _output_handler(_cell: any) {
    throw Error("define in a derived class.");
  }

  /*
  WARNING: Changes via set that are made when the actions
  are not 'ready' or the syncdb is not ready are ignored.
  These might happen right now if the user were to try to do
  some random thing at the exact moment they are closing the
  notebook. See https://github.com/sagemathinc/cocalc/issues/4274
  */
  _set = (obj: any, save: boolean = true) => {
    if (
      // _set is called during initialization, so don't
      // require this._state to be 'ready'!
      this._state === "closed" ||
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
      immutable.fromJS([misc.copy_with(obj, ["id", "type"])]),
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
    if (this.store.get("read_only") || this.isDeleted()) {
      // can't save when readonly or deleted
      return;
    }
    if (this.store.get("mode") === "edit") {
      this._get_cell_input();
    }
    // Save the .ipynb file to disk.  Note that this
    // *changes* the syncdb by updating the last save time.
    try {
      // Make sure syncdb content is all sent to the project.
      // This does not actually save the syncdb file to disk.
      // This "save" means save state to backend.
      await this.syncdb.save();
      if (this._state === "closed") return;

      // At this point we know the document is fully saved to the network,
      // but sadly we do not actually know it has been received and
      // processed by the project.  The save to ipynb that happens
      // on the backend assumes the document has been processed.
      // TODO: as a very temporary stopgap, we are just going to
      // wait a little.  Soon we'll change this to include a timestamp or
      // as a parameter to save_ipynb_file. In practice this works fine
      // since the save above is sent over the same channel as
      // the save_ipynb_file below, so it's likely that one happens
      // before the other (before NATS it always did).
      // **THIS IS TEMPORARY THOUGH.**
      await delay(500);
      // Export the ipynb file to disk.
      try {
        await this.api({ timeout: 30000 }).save_ipynb_file();
      } catch (err) {
        console.log(err);
        throw Error(
          "There was a problem writing the ipynb file to disk.  Please try again later.  You might need to restart your project.",
        );
      }
      if (this._state === ("closed" as State)) return;
      // Save our custom-format syncdb to disk.
      await this.syncdb.save_to_disk();
    } catch (err) {
      if (this._state === ("closed" as State)) return;
      if (err.toString().indexOf("no kernel with path") != -1) {
        // This means that the kernel simply hasn't been initialized yet.
        // User can try to save later, once it has.
        return;
      }
      if (err.toString().indexOf("unknown endpoint") != -1) {
        this.set_error(
          "You MUST restart your project to run the latest Jupyter server! Click 'Restart Project' in your project's settings.",
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
    id: string | undefined = undefined, // dangerous since could conflict (used by whiteboard)
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
      save,
    );
    return new_id; // violates CQRS... (this *is* used elsewhere)
  }

  // insert a cell adjacent to the cell with given id.
  // -1 = above and +1 = below.
  insert_cell_adjacent(
    id: string,
    delta: -1 | 1,
    save: boolean = true,
  ): string {
    const pos = cell_utils.new_cell_pos(
      this.store.get("cells"),
      this.store.get_cell_list(),
      id,
      delta,
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

  // Delete all blank code cells in the entire notebook.
  delete_all_blank_code_cells(sync: boolean = true): void {
    const cells: string[] = [];
    for (const id of this.store.get_cell_list()) {
      if (!this.store.is_cell_deletable(id)) {
        continue;
      }
      const cell = this.store.getIn(["cells", id]);
      if (cell == null) continue;
      if (
        cell.get("cell_type", "code") == "code" &&
        cell.get("input", "").trim() == "" &&
        cell.get("output", []).length == 0
      ) {
        cells.push(id);
      }
    }
    this.delete_cells(cells, sync);
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

  public run_code_cell(
    id: string,
    save: boolean = true,
    no_halt: boolean = false,
  ): void {
    const cell = this.store.getIn(["cells", id]);
    if (cell == null) {
      // it is trivial to run a cell that does not exist -- nothing needs to be done.
      return;
    }
    const kernel = this.store.get("kernel");
    if (kernel == null || kernel === "") {
      // just in case, we clear any "running" indicators
      this._set({ type: "cell", id, state: "done" });
      // don't attempt to run a code-cell if there is no kernel defined
      this.set_error(
        "No kernel set for running cells. Therefore it is not possible to run a code cell. You have to select a kernel!",
      );
      return;
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
        // time last evaluation took
        last:
          cell.get("start") != null && cell.get("end") != null
            ? cell.get("end") - cell.get("start")
            : cell.get("last"),
        output: null,
        exec_count: null,
        collapsed: null,
        no_halt: no_halt ? no_halt : null,
      },
      save,
    );
    this.set_trust_notebook(true, save);
  }

  clear_cell = (id: string, save = true) => {
    const cell = this.store.getIn(["cells", id]);

    this._set(
      {
        type: "cell",
        id,
        state: null,
        start: null,
        end: null,
        last:
          cell?.get("start") != null && cell?.get("end") != null
            ? cell?.get("end") - cell?.get("start")
            : (cell?.get("last") ?? null),
        output: null,
        exec_count: null,
        collapsed: null,
      },
      save,
    );
  };

  run_selected_cells = (): void => {
    this.deprecated("run_selected_cells");
  };

  public abstract run_cell(id: string, save?: boolean, no_halt?: boolean): void;

  run_all_cells = (no_halt: boolean = false): void => {
    this.store.get_cell_list().forEach((id) => {
      this.run_cell(id, false, no_halt);
    });
    this.save_asap();
  };

  clear_all_cell_run_state = (): void => {
    const { store } = this;
    if (!store) {
      return;
    }
    const cells = store.get("cells");
    for (const id of store.get_cell_list()) {
      const state = cells.getIn([id, "state"]);
      if (state && state != "done") {
        this._set(
          {
            type: "cell",
            id,
            state: "done",
          },
          false,
        );
      }
    }
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

    const output0 = cells.getIn([cell_id, "output"]) as any;
    const output1 = cells.getIn([next_id, "output"]) as any;
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
      save,
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
    save: boolean = true,
  ): void {
    this.requireToggleReadonly();
    this.toggle_metadata_boolean_on_cells(cell_ids, "editable", true, save);
  }

  set_metadata_on_cells = (
    cell_ids: string[],
    key: string,
    value,
    save: boolean = true,
  ) => {
    for (const id of cell_ids) {
      this.set_cell_metadata({
        id,
        metadata: { [key]: value },
        merge: true,
        save: false,
        bypass_edit_protection: true,
      });
    }
    if (save) {
      this.save_asap();
    }
  };

  public write_protect_cells(
    cell_ids: string[],
    protect: boolean,
    save: boolean = true,
  ) {
    this.set_metadata_on_cells(cell_ids, "editable", !protect, save);
  }

  public delete_protect_cells(
    cell_ids: string[],
    protect: boolean,
    save: boolean = true,
  ) {
    this.set_metadata_on_cells(cell_ids, "deletable", !protect, save);
  }

  // this prevents any cell from being deleted, either directly, or indirectly via a "merge"
  // example: teacher handout notebook and student should not be able to modify an instruction cell in any way
  public toggle_delete_protection_on_cells(
    cell_ids: string[],
    save: boolean = true,
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
    save: boolean = true,
  ): void {
    for (const id of cell_ids) {
      this.set_cell_metadata({
        id,
        metadata: {
          [key]: !this.store.getIn(
            ["cells", id, "metadata", key],
            default_value,
          ),
        },
        merge: true,
        save: false,
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
    save: boolean = true,
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
    save: boolean = true,
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
      cell_before_pasted_id = this.store.get_cell_id(-1, cell_ids[0]) ?? "";
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
        after_pos = cells.getIn([cell_ids[0], "pos"]) as number;
      } else {
        before_pos = cells.getIn([cell_before_pasted_id, "pos"]) as
          | number
          | undefined;
        after_pos = cells.getIn([
          this.store.get_cell_id(+1, cell_before_pasted_id),
          "pos",
        ]) as number;
      }
      const positions = cell_utils.positions_between(
        before_pos,
        after_pos,
        clipboard.size,
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
      this.store.get("project_id"),
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
  get_cell_input(id: string): string {
    return this.store.getIn(["cells", id, "input"], "");
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
    offset?: any,
  ): Promise<boolean> {
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
      complete = await this.api().complete({
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
    // I think the reason is e.g., a filename and a variable could be the same.   We're not
    // worrying about that now.
    complete.matches = Array.from(new Set(complete.matches));
    // sort in a way that matches how JupyterLab sorts completions, which
    // is case insensitive with % magics at the bottom
    complete.matches.sort((x, y) => {
      const c = misc.cmp(getCompletionGroup(x), getCompletionGroup(y));
      if (c) {
        return c;
      }
      return misc.cmp(x.toLowerCase(), y.toLowerCase());
    });
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
    complete?: immutable.Map<string, any>,
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
    save: boolean = true,
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
    pos: { ch: number; line: number },
  ): Promise<void> => {
    if (code === "") return; // no-op if there is no code (should never happen)
    await this.introspect(code, level, codemirror_to_jupyter_pos(code, pos));
  };

  introspect = async (
    code: string,
    level: 0 | 1,
    cursor_pos?: number,
  ): Promise<immutable.Map<string, any> | undefined> => {
    const req = (this._introspect_request =
      (this._introspect_request != null ? this._introspect_request : 0) + 1);

    if (cursor_pos == null) {
      cursor_pos = code.length;
    }
    cursor_pos = js_idx_to_char_idx(cursor_pos, code);

    let introspect;
    try {
      introspect = await this.api().introspect({
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
    const api = this.api({ timeout: 5000 });
    try {
      await api.signal(signal);
    } catch (err) {
      this.set_error(err);
    }
  }

  // Kill the running kernel and does NOT start it up again.
  halt = reuseInFlight(async (): Promise<void> => {
    if (this.restartKernelOnClose != null && this.jupyter_kernel != null) {
      this.jupyter_kernel.removeListener("closed", this.restartKernelOnClose);
      delete this.restartKernelOnClose;
    }
    this.clear_all_cell_run_state();
    await this.signal("SIGKILL");
    // Wait a little, since SIGKILL has to really happen on backend,
    // and server has to respond and change state.
    const not_running = (s): boolean => {
      if (this._state === "closed") return true;
      const t = s.get_one({ type: "settings" });
      return t != null && t.get("backend_state") != "running";
    };
    try {
      await this.syncdb.wait(not_running, 30);
      // worked -- and also no need to show "kernel got killed" message since this was intentional.
      this.set_error("");
    } catch (err) {
      // failed
      this.set_error(err);
    }
  });

  restart = reuseInFlight(async (): Promise<void> => {
    await this.halt();
    if (this._state === "closed") return;
    this.clear_all_cell_run_state();
    // Actually start it running again (rather than waiting for
    // user to do something), since this is called "restart".
    try {
      await this.set_backend_kernel_info(); // causes kernel to start
    } catch (err) {
      this.set_error(err);
    }
  });

  public shutdown = reuseInFlight(async (): Promise<void> => {
    if (this._state === ("closed" as State)) {
      return;
    }
    await this.signal("SIGKILL");
    if (this._state === ("closed" as State)) {
      return;
    }
    this.clear_all_cell_run_state();
    await this.save_asap();
  });

  set_backend_kernel_info = async (): Promise<void> => {
    if (this._state === "closed" || this.syncdb.is_read_only()) {
      return;
    }

    if (this.is_project || this.is_compute_server) {
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
          await this.jupyter_kernel.kernel_info(),
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
      const data = await this.api().kernel_info();
      this.setState({
        backend_kernel_info: immutable.fromJS(data),
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
    if (this._state == "closed") return;
    const a = this.redux.getProjectActions(this.project_id);
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
      await delay(0);
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
    const time = this._client.server_time().valueOf();
    try {
      const more_output = await this.api({ timeout: 60000 }).more_output(id);
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
    // this only does something in browser-actions.
  }

  set_trust_notebook = (trust: any, save: boolean = true) => {
    return this._set(
      {
        type: "settings",
        trust: !!trust,
      },
      save,
    ); // case to bool
  };

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
    value: any,
  ): Promise<void> => {
    try {
      await this.api().store({ key, value });
    } catch (err) {
      this.set_error(err);
    }
  };

  set_to_ipynb = async (
    ipynb: any,
    data_only: boolean = false,
  ): Promise<void> => {
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
    this.ensure_backend_kernel_setup();

    const importer = new IPynbImporter();

    // NOTE: Below we re-use any existing ids to make the patch that defines changing
    // to the contents of ipynb more efficient.   In case of a very slight change
    // on disk, this can be massively more efficient.

    importer.import({
      ipynb,
      existing_ids,
      new_id: this.new_id.bind(this),
      output_handler:
        this.jupyter_kernel != null
          ? this._output_handler.bind(this)
          : undefined, // undefined in client; defined in project
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
    this.ensure_backend_kernel_setup();
    this._state = "ready";
  };

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
    if (this._state != "ready" || this.store == null) {
      // because of debouncing, this ensure_positions_are_unique can
      // be called after jupyter actions are closed.
      return;
    }
    const changes = cell_utils.ensure_positions_are_unique(
      this.store.get("cells"),
    );
    if (changes != null) {
      for (const id in changes) {
        const pos = changes[id];
        this.set_cell_pos(id, pos, false);
      }
    }
    this._sync();
  }

  public set_default_kernel(kernel?: string): void {
    if (kernel == null || kernel === "") return;
    // doesn't make sense for project (right now at least)
    if (this.is_project || this.is_compute_server) return;
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
  }

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
    save: boolean = true,
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
      save,
    );
  }

  public async add_attachment_to_cell(id: string, path: string): Promise<void> {
    if (this.check_edit_protection(id, "adding an attachment")) {
      return;
    }
    let name: string = encodeURIComponent(
      misc.path_split(path).tail.toLowerCase(),
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
    await delay(10);
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
        "",
      ),
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
      save,
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
      save,
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
      immutable.Map(),
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
        save,
      );
      return;
    }

    if (merge) {
      const current = this.store.getIn(
        ["cells", id, "metadata"],
        immutable.Map(),
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
        false,
      );
    }
    // now set
    this._set(
      {
        type: "cell",
        id,
        metadata,
      },
      save,
    );
    if (this.store.getIn(["edit_cell_metadata", "id"]) === id) {
      this.edit_cell_metadata(id); // updates the state while editing
    }
  }

  set_raw_ipynb(): void {
    if (this._state != "ready") {
      // lies otherwise...
      return;
    }

    this.setState({
      raw_ipynb: immutable.fromJS(this.store.get_ipynb()),
    });
  }

  set_mode(mode: "escape" | "edit"): void {
    this.deprecated("set_mode", mode);
  }

  public focus(wait?: boolean): void {
    this.deprecated("focus", wait);
  }

  public blur(): void {
    this.deprecated("blur");
  }

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

  handle_nbconvert_change(_oldVal, _newVal): void {
    throw Error("define this in derived class");
  }

  set_kernel_error = (err) => {
    this._set({
      type: "settings",
      kernel_error: `${err}`,
    });
    this.save_asap();
  };

  // Returns true if the .ipynb file was explicitly deleted.
  // Returns false if it is NOT known to be explicitly deleted.
  // Returns undefined if not known or implemented.
  // NOTE: this is different than the file not being present on disk.
  protected isDeleted = () => {
    if (this.store == null || this._client == null) {
      return;
    }
    return this._client.is_deleted?.(this.store.get("path"), this.project_id);
    // [ ] TODO: we also need to do this on compute servers, but
    // they don't yet have the listings table.
  };

  processRenderedMarkdown = ({ value, id }: { value: string; id: string }) => {
    value = latexEnvs(value);

    const labelRegExp = /\s*\\label\{.*?\}\s*/g;
    const figLabelRegExp = /\s*\\figlabel\{.*?\}\s*/g;
    if (this.labels == null) {
      const labels = (this.labels = { math: {}, fig: {} });
      // do initial full document scan
      if (this.store == null) {
        return;
      }
      const cells = this.store.get("cells");
      if (cells == null) {
        return;
      }
      let mathN = 0;
      let figN = 0;
      for (const id of this.store.get_cell_ids_list()) {
        const cell = cells.get(id);
        if (cell?.get("cell_type") == "markdown") {
          const value = latexEnvs(cell.get("input") ?? "");
          value.replace(labelRegExp, (labelContent) => {
            const label = extractLabel(labelContent);
            mathN += 1;
            labels.math[label] = { tag: `${mathN}`, id };
            return "";
          });
          value.replace(figLabelRegExp, (labelContent) => {
            const label = extractLabel(labelContent);
            figN += 1;
            labels.fig[label] = { tag: `${figN}`, id };
            return "";
          });
        }
      }
    }
    const labels = this.labels;
    if (labels == null) {
      throw Error("bug");
    }
    value = value.replace(labelRegExp, (labelContent) => {
      const label = extractLabel(labelContent);
      if (labels.math[label] == null) {
        labels.math[label] = { tag: `${misc.len(labels.math) + 1}`, id };
      } else {
        // in case it moved to a different cell due to cut/paste
        labels.math[label].id = id;
      }
      return `\\tag{${labels.math[label].tag}}`;
    });
    value = value.replace(figLabelRegExp, (labelContent) => {
      const label = extractLabel(labelContent);
      if (labels.fig[label] == null) {
        labels.fig[label] = { tag: `${misc.len(labels.fig) + 1}`, id };
      } else {
        // in case it moved to a different cell due to cut/paste
        labels.fig[label].id = id;
      }
      return ` ${labels.fig[label].tag ?? "?"}`;
    });
    const refRegExp = /\\ref\{.*?\}/g;
    value = value.replace(refRegExp, (refContent) => {
      const label = extractLabel(refContent);
      if (labels.fig[label] == null && labels.math[label] == null) {
        // do not know the label
        return "?";
      }
      const { tag, id } = labels.fig[label] ?? labels.math[label];
      return `[${tag}](#id=${id})`;
    });

    return value;
  };

  // Update run progress, which is a number between 0 and 100,
  // giving the number of runnable cells that have been run since
  // the kernel was last set to the running state.
  // Currently only run in the browser, but could maybe be useful
  // elsewhere someday.
  updateRunProgress = () => {
    if (this.store == null) {
      return;
    }
    if (this.store.get("backend_state") != "running") {
      this.setState({ runProgress: 0 });
      return;
    }
    const cells = this.store.get("cells");
    if (cells == null) {
      return;
    }
    const last = this.store.get("last_backend_state");
    if (last == null) {
      // not supported yet, e.g., old backend, kernel never started
      return;
    }
    // count of number of cells that are runnable and
    // have start greater than last, and end set...
    // count a currently running cell as 0.5.
    let total = 0;
    let ran = 0;
    for (const [_, cell] of cells) {
      if (
        cell.get("cell_type", "code") != "code" ||
        !cell.get("input")?.trim()
      ) {
        // not runnable
        continue;
      }
      total += 1;
      if ((cell.get("start") ?? 0) >= last) {
        if (cell.get("end")) {
          ran += 1;
        } else {
          ran += 0.5;
        }
      }
    }
    this.setState({ runProgress: total > 0 ? (100 * ran) / total : 100 });
  };
}

function extractLabel(content: string): string {
  const i = content.indexOf("{");
  const j = content.lastIndexOf("}");
  return content.slice(i + 1, j);
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

function getCompletionGroup(x: string): number {
  switch (x[0]) {
    case "_":
      return 1;
    case "%":
      return 2;
    default:
      return 0;
  }
}
