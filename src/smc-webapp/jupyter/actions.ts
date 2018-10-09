/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS204: Change includes calls to have a more natural evaluation order
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

/*
Jupyter client

The goal here is to make a simple proof of concept editor for working with
Jupyter notebooks.  The goals are:
 1. to **look** like the normal jupyter notebook
 2. work like the normal jupyter notebook
 3. work perfectly regarding realtime sync and history browsing

*/

declare const $: any;
declare const window: any;
declare const localStorage: any;

import * as immutable from "immutable";
import * as underscore from "underscore";
import { reuseInFlight } from "async-await-utils/hof";
import { retry_until_success } from "../frame-editors/generic/async-utils";
import * as awaiting from "awaiting";

const misc = require("smc-util/misc");
const { required, defaults } = misc;
import { Actions } from "../app-framework";
import { JupyterStoreState, JupyterStore } from "./store";
const util = require("./util");
const parsing = require("./parsing");
const keyboard = require("./keyboard");
const commands = require("./commands");
const cell_utils = require("./cell-utils");
const { cm_options } = require("./cm_options");

// map project_id (string) -> kernels (immutable)
let jupyter_kernels = immutable.Map<string, immutable.Map<string, any>>();

const { IPynbImporter } = require("./import-from-ipynb");

// DEFAULT_KERNEL = 'python2'
// DEFAULT_KERNEL = "anaconda3";
const DEFAULT_KERNEL = "sagemath";

const syncstring = require("smc-util/syncstring");

const { instantiate_assistant } = require("../assistant/main");

import { JupyterKernelInterface } from "./project-interface";

import { connection_to_project } from "../project/websocket/connect";

/*
The actions -- what you can do with a jupyter notebook, and also the
underlying synchronized state.
*/

// no worries, they don't break react rendering even when they escape
const CellWriteProtectedException = new Error("CellWriteProtectedException");
const CellDeleteProtectedException = new Error("CellDeleteProtectedException");

export class JupyterActions extends Actions<JupyterStoreState> {
  // TODO: type these
  private _account_change_editor_settings: any;
  private _blur_lock: any;
  private _commands: any;
  private _cursor_locs?: any;
  private _hook_after_change: any;
  private _hook_before_change: any;
  private _input_editors?: any;
  private _introspect_request?: any;
  private _is_project: any;
  private _key_handler: any;
  private _last_cursors?: any;
  private _last_start?: any;
  private assistant_actions: any;
  private path: any;
  private project_id: any;
  private set_save_status: any;
  private update_keyboard_shortcuts: any;
  private project_conn: any;

  protected _client: any;
  protected _file_watcher: any;
  protected _jupyter_kernel?: JupyterKernelInterface;
  protected _state: any;

  public _account_id: any; // Note: this is used in test
  public _complete_request?: any;
  public _output_handler?: any;
  public ensure_backend_kernel_setup?: any;
  public initialize_manager: any;
  public manager_on_cell_change: any;
  public manager_run_cell_process_queue: any;
  public nbconvert_change: any;
  public store: any;
  public syncdb: any;
  public util: any; // TODO: check if this is used publicly

  _init = (
    project_id: any,
    path: any,
    syncdb: any,
    store: any,
    client: any
  ) => {
    store.dbg = f => {
      return client.dbg(`JupyterStore('${store.get("path")}').${f}`);
    };
    this.util = util; // TODO: for debugging only
    this._state = "init"; // 'init', 'load', 'ready', 'closed'
    this.store = store;
    this.project_id = project_id;
    this.path = path;
    store.syncdb = syncdb;
    this.syncdb = syncdb;
    this._client = client;
    this._is_project = client.is_project(); // the project client is designated to manage execution/conflict, etc.
    store._is_project = this._is_project;
    this._account_id = client.client_id(); // project or account's id

    // this initializes actions+store for the assistant -- are "sub-actions" a thing?
    if (!this._is_project) {
      // this is also only a UI specific action
      this.assistant_actions = instantiate_assistant(project_id, path);
    }

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
    let split_path = misc.path_split(path);
    if (split_path != null) {
      directory = split_path.head;
    }

    this.setState({
      view_mode: "normal",
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
      is_focused: false, // whether or not the editor is focused.
      max_output_length: 10000
    });

    if (this._client) {
      const do_set = () => {
        return this.setState({
          has_unsaved_changes:
            this.syncdb != null ? this.syncdb.has_unsaved_changes() : undefined,
          has_uncommitted_changes:
            this.syncdb != null
              ? this.syncdb.has_uncommitted_changes()
              : undefined
        });
      };
      const f = () => {
        do_set();
        return setTimeout(do_set, 3000);
      };
      this.set_save_status = underscore.debounce(f, 1500);
      this.syncdb.on("metadata-change", this.set_save_status);
      this.syncdb.on("connected", this.set_save_status);

      // Also maintain read_only state.
      this.syncdb.on("metadata-change", this.sync_read_only);
      this.syncdb.on("connected", this.sync_read_only);

      // Browser Client: Wait until the .ipynb file has actually been parsed into
      // the (hidden, e.g. .a.ipynb.sage-jupyter2) syncdb file,
      // then set the kernel, if necessary.
      this.syncdb.wait({
        until: s => !!s.get_one({ type: "file" }),
        cb: () => this._syncdb_init_kernel()
      });
    }

    this.syncdb.on("change", this._syncdb_change);

    if (!client.is_project()) {
      // Only run this code when used on the frontend.
      this.init_project_conn();

      // Put an entry in the project log once the jupyter notebook gets opened.
      // NOTE: Obviously, the project does NOT need to put entries in the log.
      this.syncdb.once("change", () =>
        this.redux.getProjectActions(project_id).log_opened_time(path)
      );
      // project doesn't care about cursors
      this.syncdb.on("cursor_activity", this._syncdb_cursor_activity);
    }

    if (
      !client.is_project() &&
      (typeof window !== "undefined" && window !== null
        ? (window as any).$
        : undefined) != null
    ) {
      // frontend browser client with jQuery
      this.set_jupyter_kernels(); // must be after setting project_id above.

      // set codemirror editor options whenever account editor_settings change.
      const account_store = this.redux.getStore("account") as any; // TODO: check if ever is undefined
      account_store.on("change", this._account_change);
      this._account_change_editor_settings = account_store.get(
        "editor_settings"
      );
      this._commands = commands.commands(this);

      return this.init_scroll_pos_hook();
    }
  };

  sync_read_only = (): void => {
    const a = this.store.get("read_only");
    const b = this.syncdb != null ? this.syncdb.is_read_only() : undefined;
    if (a !== b) {
      this.setState({ read_only: b });
      this.set_cm_options();
    }
  };

  init_project_conn = reuseInFlight(
    async (): Promise<any> => {
      return (this.project_conn = await connection_to_project(
        this.store.get("project_id")
      ));
    }
  );

  // private api call function
  _api_call = async (
    endpoint: string,
    query?: any,
    timeout_ms?: number
  ): Promise<any> => {
    if (this._state === "closed") {
      throw Error("closed");
    }
    const path = this.store.get("path");
    if (!path) throw Error("path unknown");
    return await (await this.init_project_conn()).api.jupyter(
      path,
      endpoint,
      query,
      timeout_ms
    );
  };

  init_scroll_pos_hook = () => {
    // maintain scroll hook on change; critical for multiuser editing
    let after: any;
    let before: any = (after = undefined);
    this._hook_before_change = () => {
      return (before = __guard__(
        $(".cocalc-jupyter-hook").offset(),
        x => x.top
      ));
    };
    return (this._hook_after_change = () => {
      after = __guard__($(".cocalc-jupyter-hook").offset(), x => x.top);
      if (before != null && after != null && before !== after) {
        return this.scroll(after - before);
      }
    });
  };

  _account_change = (state: any): void => {
    // TODO: this is just an ugly hack until we implement redux change listeners for particular keys.
    if (
      !state.get("editor_settings").equals(this._account_change_editor_settings)
    ) {
      const new_settings = state.get("editor_settings");
      if (
        this._account_change_editor_settings.get(
          "jupyter_keyboard_shortcuts"
        ) !== new_settings.get("jupyter_keyboard_shortcuts")
      ) {
        this.update_keyboard_shortcuts();
      }

      this._account_change_editor_settings = new_settings;
      this.set_cm_options();
    }
  };

  dbg = (f: any) => {
    return this._client.dbg(`JupyterActions('${this.store.get("path")}').${f}`);
  };

  close = (): void => {
    if (this._state === "closed") {
      return;
    }
    this.set_local_storage("cur_id", this.store.get("cur_id"));
    this._state = "closed";
    this.syncdb.close();
    delete this.syncdb;
    delete this._commands;
    if (this._key_handler != null) {
      (this.redux.getActions("page") as any).erase_active_key_handler(
        this._key_handler
      );
      delete this._key_handler;
    }
    if (this._file_watcher != null) {
      this._file_watcher.close();
      delete this._file_watcher;
    }
    if (!this._is_project) {
      const account = this.redux.getStore("account");
      if (account != null) {
        account.removeListener("change", this._account_change);
      }
    }
  };

  enable_key_handler = () => {
    if (this._state === "closed") {
      return;
    }
    if (this._key_handler == null) {
      this._key_handler = keyboard.create_key_handler(this);
    }
    return (this.redux.getActions("page") as any).set_active_key_handler(
      this._key_handler,
      this.project_id,
      this.path
    );
  };

  disable_key_handler = () => {
    return (this.redux.getActions("page") as any).erase_active_key_handler(
      this._key_handler
    );
  };

  fetch_jupyter_kernels = async (): Promise<void> => {
    let data;
    try {
      data = await this._api_call("kernels");
    } catch (err) {
      this.set_error(err);
      return;
    }
    const kernels = immutable.fromJS(data);
    const key = this.store.jupyter_kernel_key();
    jupyter_kernels = jupyter_kernels.set(key, kernels); // global
    this.setState({ kernels });
    // We must also update the kernel info (e.g., display name), now that we
    // know the kernels (e.g., maybe it changed or is now known but wasn't before).
    this.setState({
      kernel_info: this.store.get_kernel_info(this.store.get("kernel"))
    });
  };

  set_jupyter_kernels = () => {
    const kernels = jupyter_kernels.get(this.store.jupyter_kernel_key());
    if (kernels != null) {
      this.setState({ kernels });
    } else {
      this.fetch_jupyter_kernels();
    }
  };

  set_error = (err: any): void => {
    if (err == null) {
      this.setState({ error: undefined }); // delete from store
      return;
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
  set_cell_input = (id: string, input: any, save = true) => {
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    return this._set(
      {
        type: "cell",
        id,
        input,
        start: null,
        end: null
      },
      save
    );
  };

  set_cell_output = (id: any, output: any, save = true) => {
    return this._set(
      {
        type: "cell",
        id,
        output
      },
      save
    );
  };

  clear_selected_outputs = () => {
    const cells = this.store.get("cells");
    const v = this.store.get_selected_cell_ids_list();
    for (let id of v) {
      const cell = cells.get(id);
      if (!this.store.is_cell_editable(id)) {
        if (v.length === 1) {
          this.show_edit_protection_error();
        }
        continue;
      }
      if (cell.get("output") != null || cell.get("exec_count")) {
        this._set({ type: "cell", id, output: null, exec_count: null }, false);
      }
    }
    return this._sync();
  };

  clear_all_outputs = (): void => {
    let not_editable = 0;
    this.store.get("cells").forEach((cell, id) => {
      if (cell.get("output") != null || cell.get("exec_count")) {
        if (!this.store.is_cell_editable(id)) {
          not_editable += 1;
        } else {
          this._set(
            { type: "cell", id, output: null, exec_count: null },
            false
          );
        }
      }
    });
    this._sync();
    if (not_editable > 0) {
      this.set_error("One or more cells are protected from editing.");
    }
  };

  // prop can be: 'collapsed', 'scrolled'
  toggle_output = (id: any, prop: any) => {
    const cell_type = this.store.getIn(["cells", id, "cell_type"]);
    if (cell_type == null || cell_type == "code") {
      this._set({
        type: "cell",
        id,
        [prop]: !this.store.getIn(["cells", id, prop])
      });
    }
  };

  toggle_selected_outputs = (prop: any) => {
    const cells = this.store.get("cells");
    for (let id of this.store.get_selected_cell_ids_list()) {
      var left;
      const cell = cells.get(id);
      if ((left = cell.get("cell_type")) != null ? left : "code" === "code") {
        this._set({ type: "cell", id, [prop]: !cell.get(prop) }, false);
      }
    }
    return this._sync();
  };

  toggle_all_outputs = (prop: any) => {
    this.store.get("cells").forEach((cell, id) => {
      let left: any;
      if ((left = cell.get("cell_type")) != null ? left : "code" === "code") {
        this._set({ type: "cell", id, [prop]: !cell.get(prop) }, false);
      }
    });
    return this._sync();
  };

  set_cell_pos = (id: any, pos: any, save = true) => {
    return this._set({ type: "cell", id, pos }, save);
  };

  set_cell_type = (id, cell_type = "code") => {
    if (
      cell_type !== "markdown" &&
      cell_type !== "raw" &&
      cell_type !== "code"
    ) {
      throw Error(
        `cell type (='${cell_type}') must be 'markdown', 'raw', or 'code'`
      );
    }
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    const obj: any = {
      type: "cell",
      id,
      cell_type
    };
    if (cell_type !== "code") {
      // delete output and exec time info when switching to non-code cell_type
      obj.output = obj.start = obj.end = obj.collapsed = obj.scrolled = null;
    }
    return this._set(obj);
  };

  set_selected_cell_type = (cell_type: any) => {
    const sel_ids = this.store.get("sel_ids");
    const cur_id = this.store.get("cur_id");
    if (sel_ids.size === 0) {
      if (cur_id != null) {
        return this.set_cell_type(cur_id, cell_type);
      }
    } else {
      return sel_ids.forEach(id => {
        this.set_cell_type(id, cell_type);
      });
    }
  };

  // Might throw a CellWriteProtectedException
  set_md_cell_editing = (id: any): void => {
    const md_edit_ids = this.store.get("md_edit_ids");
    if (md_edit_ids.contains(id)) {
      return;
    }
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    this.setState({ md_edit_ids: md_edit_ids.add(id) });
  };

  set_md_cell_not_editing = (id: any): void => {
    const md_edit_ids = this.store.get("md_edit_ids");
    if (!md_edit_ids.contains(id)) {
      return;
    }
    this.setState({ md_edit_ids: md_edit_ids.delete(id) });
  };

  change_cell_to_heading = (id: any, n = 1) => {
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    this.set_md_cell_editing(id);
    this.set_cell_type(id, "markdown");
    let input = misc.lstrip(this._get_cell_input(id));
    let i = 0;
    while (i < input.length && input[i] === "#") {
      i += 1;
    }
    input =
      __range__(0, n, false)
        .map(_ => "#")
        .join("") +
      (!misc.is_whitespace(input[i]) ? " " : "") +
      input.slice(i);
    return this.set_cell_input(id, input);
  };

  // Set which cell is currently the cursor.
  set_cur_id = (id: any): void => {
    if (
      this.store.getIn(["cells", id, "cell_type"]) === "markdown" &&
      this.store.get("mode") === "edit"
    ) {
      if (this.store.is_cell_editable(id)) {
        this.set_md_cell_editing(id);
      }
    }
    this.setState({ cur_id: id });
  };

  set_cur_id_from_index = (i?: any): void => {
    if (i == null) {
      return;
    }
    const cell_list = this.store.get("cell_list");
    if (cell_list == null) {
      return;
    }
    if (i < 0) {
      i = 0;
    } else if (i >= cell_list.size) {
      i = cell_list.size - 1;
    }
    this.set_cur_id(cell_list.get(i));
  };

  select_cell = (id: any): void => {
    const sel_ids = this.store.get("sel_ids");
    if (sel_ids.contains(id)) {
      return;
    }
    this.setState({ sel_ids: sel_ids.add(id) });
  };

  unselect_cell = (id: any): void => {
    const sel_ids = this.store.get("sel_ids");
    if (!sel_ids.contains(id)) {
      return;
    }
    this.setState({ sel_ids: sel_ids.remove(id) });
  };

  unselect_all_cells = (): void => {
    this.setState({ sel_ids: immutable.Set() });
  };

  select_all_cells = (): void => {
    this.setState({ sel_ids: this.store.get("cell_list").toSet() });
  };

  // select all cells from the currently focused one (where the cursor is -- cur_id)
  // to the cell with the given id, then set the cursor to be at id.
  select_cell_range = (id: any): void => {
    let endpoint0, endpoint1, x;
    let i;
    const cur_id = this.store.get("cur_id");
    if (cur_id == null) {
      // no range -- just select the new id
      this.set_cur_id(id);
      return;
    }
    let sel_ids = this.store.get("sel_ids");
    if (cur_id === id) {
      // little to do...
      if (sel_ids.size > 0) {
        this.setState({ sel_ids: immutable.Set() }); // empty (cur_id always included)
      }
      return;
    }
    const v = this.store.get("cell_list").toJS();
    for ([i, x] of misc.enumerate(v)) {
      if (x === id) {
        endpoint0 = i;
      }
      if (x === cur_id) {
        endpoint1 = i;
      }
    }
    sel_ids = immutable.Set(
      (() => {
        let asc, end;
        const result: any[] = [];
        for (
          i = endpoint0, end = endpoint1, asc = endpoint0 <= end;
          asc ? i <= end : i >= end;
          asc ? i++ : i--
        ) {
          result.push(v[i]);
        }
        return result;
      })()
    );
    return this.setState({
      sel_ids,
      cur_id: id
    });
  };

  extend_selection = (delta: any): void => {
    const cur_id = this.store.get("cur_id");
    this.move_cursor(delta);
    const target_id = this.store.get("cur_id");
    if (cur_id === target_id) {
      // no move
      return;
    }
    const sel_ids = this.store.get("sel_ids");
    if (sel_ids != null ? sel_ids.get(target_id) : undefined) {
      // moved cursor onto a selected cell
      if (sel_ids.size <= 2) {
        // selection clears if shrinks to 1
        this.unselect_all_cells();
        return;
      } else {
        this.unselect_cell(cur_id);
        return;
      }
    } else {
      // moved onto a not-selected cell
      this.select_cell(cur_id);
      this.select_cell(target_id);
    }
  };

  set_mode = (mode: any) => {
    if (mode === "escape") {
      if (this.store.get("mode") === "escape") {
        return;
      }
      // switching from edit to escape mode.
      // save code being typed
      this._get_cell_input();
      // Now switch.
      this.setState({ mode });
      return this.set_cursor_locs([]); // none
    } else if (mode === "edit") {
      // switch to focused
      this.focus_unlock();
      if (this.store.get("mode") === "edit") {
        return;
      }
      // from escape to edit
      const id = this.store.get("cur_id");
      if (!this.store.is_cell_editable(id)) {
        //@set_error("This cell is protected from being edited.")
      } else {
        this.setState({ mode });
        const type = this.store.getIn(["cells", id, "cell_type"]);
        if (type === "markdown") {
          return this.set_md_cell_editing(id);
        }
      }
    } else {
      return this.set_error(`unknown mode '${mode}'`);
    }
  };

  set_cell_list = (): void => {
    const cells = this.store.get("cells");
    if (cells == null) {
      return;
    }
    const cell_list = cell_utils.sorted_cell_list(cells);
    if (!cell_list.equals(this.store.get("cell_list"))) {
      this.setState({ cell_list });
    }
  };

  _syncdb_cell_change = (id: any, new_cell: any) => {
    let left, obj;
    if (typeof id !== "string") {
      console.warn(`ignoring cell with invalid id='${JSON.stringify(id)}'`);
      return;
    }
    const cells =
      (left = this.store.get("cells")) != null ? left : immutable.Map();
    let cell_list_needs_recompute = false;
    //@dbg("_syncdb_cell_change")("#{id} #{JSON.stringify(new_cell?.toJS())}")
    let old_cell = cells.get(id);
    if (new_cell == null) {
      // delete cell
      this.reset_more_output(id); // free up memory locally
      if (old_cell != null) {
        obj = { cells: cells.delete(id) };
        const cell_list = this.store.get("cell_list");
        if (cell_list != null) {
          obj.cell_list = cell_list.filter(x => x !== id);
        }
        this.setState(obj);
      }
    } else {
      // change or add cell
      old_cell = cells.get(id);
      if (new_cell.equals(old_cell)) {
        return; // nothing to do
      }
      if (old_cell != null && new_cell.get("start") !== old_cell.get("start")) {
        // cell re-evaluated so any more output is no longer valid.
        this.reset_more_output(id);
      }
      obj = { cells: cells.set(id, new_cell) };
      if (old_cell == null || old_cell.get("pos") !== new_cell.get("pos")) {
        cell_list_needs_recompute = true;
      }
      this.setState(obj);
      if (this.store.getIn(["edit_cell_metadata", "id"]) === id) {
        this.edit_cell_metadata(id); // updates the state during active editing.
      }
    }

    if (this._is_project) {
      this.manager_on_cell_change(id, new_cell, old_cell);
    }
    this.store.emit("cell_change", id, new_cell, old_cell);

    return cell_list_needs_recompute;
  };

  _syncdb_change = (changes: any) => {
    if (typeof this._hook_before_change === "function") {
      this._hook_before_change();
    }
    this.__syncdb_change(changes);
    if (typeof this._hook_after_change === "function") {
      this._hook_after_change();
    }
    return typeof this.set_save_status === "function"
      ? this.set_save_status()
      : undefined;
  };

  __syncdb_change = (changes: any): void => {
    const do_init = this._is_project && this._state === "init";
    //@dbg("_syncdb_change")(JSON.stringify(changes?.toJS()))
    let cell_list_needs_recompute = false;
    if (changes != null) {
      changes.forEach(key => {
        const record = this.syncdb.get_one(key);
        switch (key.get("type")) {
          case "cell":
            if (this._syncdb_cell_change(key.get("id"), record)) {
              cell_list_needs_recompute = true;
            }
            break;
          case "fatal":
            var error = record != null ? record.get("error") : undefined;
            this.setState({ fatal: error });
            // This check can be deleted in a few weeks:
            if (
              error != null &&
              error.indexOf("file is currently being read or written") !== -1
            ) {
              // No longer relevant -- see https://github.com/sagemathinc/cocalc/issues/1742
              this.syncdb.delete({ type: "fatal" });
            }
            break;
          case "nbconvert":
            if (this._is_project) {
              // before setting in store, let backend react to change
              this.nbconvert_change(this.store.get("nbconvert"), record);
            }
            // Now set in our store.
            this.setState({ nbconvert: record });
            break;
          case "settings":
            if (record == null) {
              return;
            }
            // TODO: var?
            var orig_kernel = this.store.get("kernel");
            var kernel = record.get("kernel");
            var obj: any = {
              trust: !!record.get("trust"), // case to boolean
              backend_state: record.get("backend_state"),
              kernel_state: record.get("kernel_state"),
              kernel_usage: record.get("kernel_usage"),
              metadata: record.get("metadata"), // extra custom user-specified metadata
              max_output_length: bounded_integer(
                record.get("max_output_length"),
                100,
                100000,
                20000
              )
            };
            if (kernel !== orig_kernel) {
              obj.kernel = kernel;
              obj.kernel_info = this.store.get_kernel_info(kernel);
              obj.backend_kernel_info = undefined;
            }
            this.setState(obj);
            if (!this._is_project && orig_kernel !== kernel) {
              this.set_backend_kernel_info();
              this.set_cm_options();
            }
            break;
        }
      });
    }
    if (cell_list_needs_recompute) {
      this.set_cell_list();
    }
    const cur_id = this.store.get("cur_id");
    if (cur_id == null || this.store.getIn(["cells", cur_id]) == null) {
      this.set_cur_id(__guard__(this.store.get("cell_list"), x => x.get(0)));
    }

    if (this._is_project) {
      if (do_init) {
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

      if (this.store.get("view_mode") === "raw") {
        this.set_raw_ipynb();
      }
    }
  };

  _syncdb_init_kernel = (): void => {
    const account = this.redux.getStore("account");
    const default_kernel =
      account != null
        ? // TODO: getIn types
          account.getIn(
            ["editor_settings", "jupyter", "kernel"] as any,
            DEFAULT_KERNEL
          )
        : undefined;
    if (this.store.get("kernel") == null) {
      // Creating a new notebook with no kernel set
      const kernel = default_kernel || DEFAULT_KERNEL;
      this.set_kernel(kernel);
    } else {
      // Opening an existing notebook
      if (default_kernel == null) {
        // But user has no default kernel, since they never before explicitly set one.
        // So we set it.  This is so that a user's default
        // kernel is that of the first ipynb they
        // opened, which is very sensible in courses.
        this.set_default_kernel(this.store.get("kernel"));
      }
    }
  };

  _syncdb_cursor_activity = (): void => {
    let cells_before;
    let cells = (cells_before = this.store.get("cells"));
    const next_cursors = this.syncdb.get_cursors();
    next_cursors.forEach((info, account_id) => {
      const last_info =
        this._last_cursors != null
          ? this._last_cursors.get(account_id)
          : undefined;
      if (last_info != null ? last_info.equals(info) : undefined) {
        // no change for this particular users, so nothing further to do
        return;
      }
      // delete old cursor locations
      if (last_info != null) {
        last_info.get("locs").forEach(loc => {
          let left: any;
          const id = loc.get("id");
          const cell = cells.get(id);
          if (cell == null) {
            return;
          }
          const cursors =
            (left = cell.get("cursors")) != null ? left : immutable.Map();
          if (cursors.has(account_id)) {
            cells = cells.set(
              id,
              cell.set("cursors", cursors.delete(account_id))
            );
            return false; // nothing further to do
          }
        });
      }

      // set new cursors
      return info.get("locs").forEach(loc => {
        let left, left1;
        const id = loc.get("id");
        let cell = cells.get(id);
        if (cell == null) {
          return;
        }
        let cursors =
          (left = cell.get("cursors")) != null ? left : immutable.Map();
        loc = loc.set("time", info.get("time")).delete("id");
        const locs = ((left1 = cursors.get(account_id)) != null
          ? left1
          : immutable.List()
        ).push(loc);
        cursors = cursors.set(account_id, locs);
        cell = cell.set("cursors", cursors);
        cells = cells.set(id, cell);
      });
    });

    this._last_cursors = next_cursors;

    if (cells !== cells_before) {
      this.setState({ cells });
    }
  };

  _set = (obj: any, save = true) => {
    if (this._state === "closed") {
      return;
    }
    // check write protection regarding specific keys to be set
    if (
      obj.type === "cell" &&
      obj.id != null &&
      !this.store.is_cell_editable(obj.id)
    ) {
      for (let protected_key of ["input", "cell_type", "attachments"]) {
        if (misc.has_key(protected_key)) {
          throw CellWriteProtectedException;
        }
      }
    }
    //@dbg("_set")("obj=#{misc.to_json(obj)}")
    this.syncdb.set(obj, save);
    // ensure that we update locally immediately for our own changes.
    return this._syncdb_change(
      immutable.fromJS([misc.copy_with(obj, ["id", "type"])])
    );
  };

  // might throw a CellDeleteProtectedException
  _delete = (obj: any, save = true) => {
    if (this._state === "closed") {
      return;
    }
    // check: don't delete cells marked as deletable=false
    if (obj.type === "cell" && obj.id != null) {
      if (!this.store.is_cell_deletable(obj.id)) {
        throw CellDeleteProtectedException;
      }
    }
    this.syncdb.delete(obj, save);
    return this._syncdb_change(
      immutable.fromJS([{ type: obj.type, id: obj.id }])
    );
  };

  _sync = () => {
    if (this._state === "closed") {
      return;
    }
    return this.syncdb.sync();
  };

  save = () => {
    if (this.store.get("read_only")) {
      // can't save when readonly
      return;
    }
    if (this.store.get("mode") === "edit") {
      this._get_cell_input();
    }
    // Saves our customer format sync doc-db to disk; the backend will
    // also save the normal ipynb file to disk right after.
    this.syncdb.save(() => {
      return typeof this.set_save_status === "function"
        ? this.set_save_status()
        : undefined;
    });
    return typeof this.set_save_status === "function"
      ? this.set_save_status()
      : undefined;
  };

  save_asap = (): void => {
    if (this.syncdb != null) {
      this.syncdb.save_asap(err => {
        if (err) {
          setTimeout(
            () => (this.syncdb != null ? this.syncdb.save_asap() : undefined),
            50
          );
        }
      });
    }
  };

  _id_is_available = (id: any) => {
    return this.store.getIn(["cells", id]) == null;
  };

  _new_id = (is_available?: any) => {
    if (is_available == null) {
      is_available = this._id_is_available;
    }
    while (true) {
      const id = misc.uuid().slice(0, 6);
      if (is_available(id)) {
        return id;
      }
    }
  };

  insert_cell = (delta: any) => {
    // delta = -1 (above) or +1 (below)
    const pos = cell_utils.new_cell_pos(
      this.store.get("cells"),
      this.store.get("cell_list"),
      this.store.get("cur_id"),
      delta
    );
    const new_id = this._new_id();
    this._set({
      type: "cell",
      id: new_id,
      pos,
      input: ""
    });
    this.set_cur_id(new_id);
    return new_id; // violates CQRS... (this *is* used elsewhere)
  };

  delete_selected_cells = (sync = true): void => {
    const selected = this.store.get_selected_cell_ids_list();
    if (selected.length === 0) {
      return;
    }
    let id = this.store.get("cur_id");
    this.move_cursor_after(selected[selected.length - 1]);
    if (this.store.get("cur_id") === id) {
      this.move_cursor_before(selected[0]);
    }
    let not_deletable = 0;
    for (id of selected) {
      if (!this.store.is_cell_deletable(id)) {
        not_deletable += 1;
      } else {
        this._delete({ type: "cell", id }, false);
      }
    }
    if (sync) {
      this._sync();
    }
    if (not_deletable > 0) {
      if (selected.length === 1) {
        this.show_delete_protection_error();
        this.move_cursor_to_cell(id);
      } else {
        const verb = not_deletable === 1 ? "is" : "are";
        this.set_error(
          `${not_deletable} ${misc.plural(
            not_deletable,
            "cell"
          )} ${verb} protected from deletion.`
        );
      }
    }
  };

  move_selected_cells = (delta: any) => {
    // Move all selected cells delta positions up or down, e.g., delta = +1 or delta = -1
    // This action changes the pos attributes of 0 or more cells.
    if (delta === 0) {
      return;
    }
    const v = __guard__(this.store.get("cell_list"), x => x.toJS());
    const w = cell_utils.move_selected_cells(
      v,
      this.store.get_selected_cell_ids(),
      delta
    );
    if (w == null) {
      return;
    }
    // now w is a complete list of the id's of the whole worksheet in the proper order; use it to set pos
    if (underscore.isEqual(v, w)) {
      // no change
      return;
    }
    const cells = this.store.get("cells");
    // const changes = immutable.Set(); // TODO: unused
    for (
      let pos = 0, end = w.length, asc = 0 <= end;
      asc ? pos < end : pos > end;
      asc ? pos++ : pos--
    ) {
      const id = w[pos];
      if (cells.get(id).get("pos") !== pos) {
        this.set_cell_pos(id, pos, false);
      }
    }
    return this._sync();
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

  // in the future, might throw a CellWriteProtectedException. for now, just running is ok.
  run_cell = (id: any): void => {
    let left: any;
    const cell = this.store.getIn(["cells", id]);
    if (cell == null) {
      return;
    }

    this.unselect_all_cells(); // for whatever reason, any running of a cell deselects in official jupyter

    const cell_type = (left = cell.get("cell_type")) != null ? left : "code";
    switch (cell_type) {
      case "code":
        var code = this._get_cell_input(id).trim();
        var cm_mode = this.store.getIn(["cm_options", "mode", "name"]);
        var language = this.store.get_kernel_language();
        switch (parsing.run_mode(code, cm_mode, language)) {
          case "show_source":
            this.introspect(code.slice(0, code.length - 2), 1);
            break;
          case "show_doc":
            this.introspect(code.slice(0, code.length - 1), 0);
            break;
          case "empty":
            this.clear_cell(id);
            break;
          case "execute":
            this.run_code_cell(id);
            break;
        }
        break;
      case "markdown":
        this.set_md_cell_not_editing(id);
        break;
    }
    this.save_asap();
  };

  run_code_cell = (id: any, save = true) => {
    // We mark the start timestamp uniquely, so that the backend can sort
    // multiple cells with a simultaneous time to start request.

    let start = this._client.server_time() - 0;
    if (this._last_start != null && start <= this._last_start) {
      start = this._last_start + 1;
    }
    this._last_start = start;

    this._set(
      {
        type: "cell",
        id,
        state: "start",
        start,
        end: null,
        output: null,
        exec_count: null,
        collapsed: null
      },
      save
    );
    return this.set_trust_notebook(true);
  };

  clear_cell = (id: any, save = true) => {
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    return this._set(
      {
        type: "cell",
        id,
        state: null,
        start: null,
        end: null,
        output: null,
        exec_count: null,
        collapsed: null
      },
      save
    );
  };

  run_selected_cells = (): void => {
    const v = this.store.get_selected_cell_ids_list();
    for (let id of v) {
      this.run_cell(id);
    }
    this.save_asap();
  };

  // Run the selected cells, by either clicking the play button or
  // press shift+enter.  Note that this has somewhat weird/inconsitent
  // behavior in official Jupyter for usability reasons and due to
  // their "modal" approach.
  // In paricular, if the selections goes to the end of the document, we
  // create a new cell and set it the mode to edit; otherwise, we advance
  // the cursor and switch to escape mode.
  shift_enter_run_selected_cells = () => {
    const v = this.store.get_selected_cell_ids_list();
    if (v.length === 0) {
      return;
    }
    const last_id = v[v.length - 1];

    this.run_selected_cells();

    const cell_list = this.store.get("cell_list");
    if (
      (cell_list != null ? cell_list.get(cell_list.size - 1) : undefined) ===
      last_id
    ) {
      this.set_cur_id(last_id);
      const new_id = this.insert_cell(1);
      // this is ugly, but I don't know a better way; when the codemirror editor of
      // the current cell unmounts, it blurs, which happens after right now.
      // So we just change the mode back to edit slightly in the future.
      return setTimeout(() => {
        this.set_cur_id(new_id);
        return this.set_mode("edit");
      }, 1);
    } else {
      this.set_mode("escape");
      return this.move_cursor(1);
    }
  };

  run_cell_and_insert_new_cell_below = () => {
    let needle, new_id;
    const v = this.store.get_selected_cell_ids_list();
    this.run_selected_cells();
    if (((needle = this.store.get("cur_id")), v.indexOf(needle) > -1)) {
      new_id = this.insert_cell(1);
    } else {
      new_id = this.insert_cell(-1);
    }
    // Set mode back to edit in the next loop since something above
    // sets it to escape.  See https://github.com/sagemathinc/cocalc/issues/2372
    const f = () => {
      this.set_cur_id(new_id);
      this.set_mode("edit");
      return this.scroll("cell visible");
    };
    return setTimeout(f, 0);
  };

  run_all_cells = (): void => {
    this.store.get("cell_list").forEach(id => {
      this.run_cell(id);
    });
    this.save_asap();
  };

  // Run all cells strictly above the current cursor position.
  run_all_above = (): void => {
    const i = this.store.get_cur_cell_index();
    if (i == null) {
      return;
    }
    for (let id of __guard__(this.store.get("cell_list"), x =>
      x.toJS().slice(0, i)
    )) {
      this.run_cell(id);
    }
  };

  // Run all cells below (and *including*) the current cursor position.
  run_all_below = (): void => {
    const i = this.store.get_cur_cell_index();
    if (i == null) {
      return;
    }
    for (let id of __guard__(this.store.get("cell_list"), x =>
      x.toJS().slice(i)
    )) {
      this.run_cell(id);
    }
  };

  move_cursor_after_selected_cells = (): void => {
    const v = this.store.get_selected_cell_ids_list();
    if (v.length > 0) {
      this.move_cursor_after(v[v.length - 1]);
    }
  };

  move_cursor_to_last_selected_cell = (): void => {
    const v = this.store.get_selected_cell_ids_list();
    if (v.length > 0) {
      this.set_cur_id(v[v.length - 1]);
    }
  };

  // move cursor delta positions from current position
  move_cursor = (delta: any): void => {
    this.set_cur_id_from_index(this.store.get_cur_cell_index() + delta);
  };

  move_cursor_after = (id: any): void => {
    const i = this.store.get_cell_index(id);
    if (i == null) {
      return;
    }
    this.set_cur_id_from_index(i + 1);
  };

  move_cursor_before = (id: any): void => {
    const i = this.store.get_cell_index(id);
    if (i == null) {
      return;
    }
    this.set_cur_id_from_index(i - 1);
  };

  move_cursor_to_cell = (id: any): void => {
    const i = this.store.get_cell_index(id);
    if (i == null) {
      return;
    }
    this.set_cur_id_from_index(i);
  };

  set_cursor_locs = (locs: any = [], side_effect?: any) => {
    if (locs.length === 0) {
      // don't remove on blur -- cursor will fade out just fine
      return;
    }
    this._cursor_locs = locs; // remember our own cursors for splitting cell
    // syncdb not always set -- https://github.com/sagemathinc/cocalc/issues/2107
    return this.syncdb != null
      ? this.syncdb.set_cursor_locs(locs, side_effect)
      : undefined;
  };

  split_current_cell = (): void => {
    const cursor = this._cursor_locs != null ? this._cursor_locs[0] : undefined;
    if (cursor == null) {
      return;
    }
    const cur_id = this.store.get("cur_id");
    if (cursor.id !== cur_id) {
      // cursor isn't in currently selected cell, so don't know how to split
      return;
    }
    if (this.store.check_edit_protection(cur_id, this)) {
      return;
    }
    // insert a new cell before the currently selected one
    const new_id = this.insert_cell(-1);

    // split the cell content at the cursor loc
    const cell = this.store.get("cells").get(cursor.id);
    if (cell == null) {
      return; // this would be a bug?
    }
    const cell_type = cell.get("cell_type");
    if (cell_type !== "code") {
      this.set_cell_type(new_id, cell_type);
      // newly inserted cells are always editable
      this.set_md_cell_editing(new_id);
    }
    const input = cell.get("input");
    if (input == null) {
      return;
    }

    const lines = input.split("\n");
    let v = lines.slice(0, cursor.y);
    const line = lines[cursor.y];
    const left = line.slice(0, cursor.x);
    if (left) {
      v.push(left);
    }
    const top = v.join("\n");

    v = lines.slice(cursor.y + 1);
    const right = line.slice(cursor.x);
    if (right) {
      v = [right].concat(v);
    }
    const bottom = v.join("\n");
    this.set_cell_input(new_id, top, false);
    this.set_cell_input(cursor.id, bottom, true);
    return this.set_cur_id(cursor.id);
  };

  // Copy content from the cell below the current cell into the currently
  // selected cell, then delete the cell below the current cell.s
  merge_cell_below = (save = true): void => {
    let end, left, left1;
    const cur_id = this.store.get("cur_id");
    if (cur_id == null) {
      return;
    }
    const next_id = this.store.get_cell_id(1);
    if (next_id == null) {
      return;
    }
    for (let cell_id of [cur_id, next_id]) {
      // TODO/WARNING: this doesn't look correct:
      cell_id = cell_id; // TODO: use?
      if (!this.store.is_cell_editable(cur_id)) {
        this.set_error("Cells protected from editing cannot be merged.");
        return;
      }
      if (!this.store.is_cell_deletable(cur_id)) {
        this.set_error("Cells protected from deletion cannot be merged.");
        return;
      }
    }
    const cells = this.store.get("cells");
    if (cells == null) {
      return;
    }
    const input =
      ((left = __guard__(cells.get(cur_id), x => x.get("input"))) != null
        ? left
        : "") +
      "\n" +
      ((left1 = __guard__(cells.get(next_id), x1 => x1.get("input"))) != null
        ? left1
        : "");

    let output: any = undefined;
    const output0 = __guard__(cells.get(cur_id), x2 => x2.get("output"));
    const output1 = __guard__(cells.get(next_id), x3 => x3.get("output"));
    if (output0 == null) {
      output = output1;
    } else if (output1 == null) {
      output = output0;
    } else {
      // both output0 and output1 are defined; need to merge.
      // This is complicated since output is a map from string numbers.
      let asc, i;
      output = output0;
      let n = output0.size;
      for (
        i = 0, end = output1.size, asc = 0 <= end;
        asc ? i < end : i > end;
        asc ? i++ : i--
      ) {
        output = output.set(`${n}`, output1.get(`${i}`));
        n += 1;
      }
    }

    // we checked above that cell is deletable
    this._delete({ type: "cell", id: next_id }, false);
    this._set(
      {
        type: "cell",
        id: cur_id,
        input,
        output: output != null ? output : null,
        start: null,
        end: null
      },
      save
    );
  };

  merge_cell_above = (): void => {
    this.move_cursor(-1);
    this.merge_cell_below();
  };

  // Merge all selected cells into one cell.
  // We also merge all output, instead of throwing away
  // all but first output (which jupyter does, and makes no sense).
  merge_cells = () => {
    const v = this.store.get_selected_cell_ids_list();
    const n = v != null ? v.length : undefined;
    if (n == null || n <= 1) {
      return;
    }
    this.set_cur_id(v[0]);
    return __range__(0, n - 1, false).map(i =>
      this.merge_cell_below(i === n - 2)
    );
  };

  // Copy all currently selected cells into our internal clipboard
  copy_selected_cells = (): void => {
    const cells = this.store.get("cells");
    let global_clipboard = immutable.List();
    for (let id of this.store.get_selected_cell_ids_list()) {
      global_clipboard = global_clipboard.push(cells.get(id));
    }
    this.store.set_global_clipboard(global_clipboard);
  };

  // Cut currently selected cells, putting them in internal clipboard
  cut_selected_cells = (): void => {
    this.copy_selected_cells();
    this.delete_selected_cells();
  };

  // write protection disables any modifications, entering "edit" mode, and prohibits cell evaluations
  // example: teacher handout notebook and student should not be able to modify an instruction cell in any way
  toggle_write_protection = (): void => {
    // also make sure to switch to escape mode and eval markdown cells
    this.set_mode("escape");
    const f = id => {
      const type = this.store.getIn(["cells", id, "cell_type"]);
      if (type === "markdown") {
        return this.set_md_cell_not_editing(id);
      }
    };
    this.toggle_metadata_boolean("editable", f);
  };

  // this prevents any cell from being deleted, either directly, or indirectly via a "merge"
  // example: teacher handout notebook and student should not be able to modify an instruction cell in any way
  toggle_delete_protection = (): void => {
    this.toggle_metadata_boolean("deletable");
  };

  show_edit_protection_error = (): void => {
    this.set_error("This cell is protected from editing.");
  };

  show_delete_protection_error = (): void => {
    this.set_error("This cell is protected from deletion.");
  };

  // This toggles the boolean value of given metadata field.
  // If not set, it is assumed to be true and toggled to false
  // For more than one cell, the first one is used to toggle all cells to the inverted state
  toggle_metadata_boolean = (key: any, extra_processing?: any): void => {
    let new_value: any = undefined;
    for (let id of this.store.get_selected_cell_ids_list()) {
      if (new_value == null) {
        var left;
        const current_value =
          (left = this.store.getIn(["cells", id, "metadata", key])) != null
            ? left
            : true;
        new_value = !current_value;
      }
      if (typeof extra_processing === "function") {
        extra_processing(id);
      }
      this.set_cell_metadata({
        id,
        metadata: { [key]: new_value },
        merge: true,
        save: true
      });
    }
    this.save_asap();
  };

  // Paste cells from the internal clipboard; also
  //   delta = 0 -- replace currently selected cells
  //   delta = 1 -- paste cells below last selected cell
  //   delta = -1 -- paste cells above first selected cell
  paste_cells = (delta = 1) => {
    let cell_before_pasted_id;
    const cells = this.store.get("cells");
    const v = this.store.get_selected_cell_ids_list();
    if (v.length === 0) {
      return; // no selected cells
    }
    if (delta === 0 || delta === -1) {
      cell_before_pasted_id = this.store.get_cell_id(-1, v[0]); // one before first selected
    } else if (delta === 1) {
      cell_before_pasted_id = v[v.length - 1]; // last selected
    } else {
      console.warn(`paste_cells: invalid delta=${delta}`);
      return;
    }
    try {
      let after_pos, before_pos;
      if (delta === 0) {
        // replace, so delete currently selected, unless just the cursor, since
        // cursor vs selection is confusing with Jupyer's model.
        if (v.length > 1) {
          this.delete_selected_cells(false);
        }
      }
      const clipboard = this.store.get_global_clipboard();
      if (clipboard == null || clipboard.size === 0) {
        return; // nothing more to do
      }
      // put the cells from the clipboard into the document, setting their positions
      if (cell_before_pasted_id == null) {
        // very top cell
        before_pos = undefined;
        after_pos = cells.getIn([v[0], "pos"]);
      } else {
        before_pos = cells.getIn([cell_before_pasted_id, "pos"]);
        after_pos = cells.getIn([
          this.store.get_cell_id(+1, cell_before_pasted_id),
          "pos"
        ]);
      }
      const positions = cell_utils.positions_between(
        before_pos,
        after_pos,
        clipboard.size
      );
      return clipboard.forEach((cell, i) => {
        cell = cell.set("id", this._new_id()); // randomize the id of the cell
        cell = cell.set("pos", positions[i]);
        this._set(cell, false);
      });
    } finally {
      // very important that we save whatever is done above, so other viewers see it.
      this._sync();
    }
  };

  toggle_toolbar = () => {
    return this.set_toolbar_state(!this.store.get("toolbar"));
  };

  set_toolbar_state = (val: any) => {
    // val = true = visible
    this.setState({ toolbar: val });
    return this.set_local_storage("hide_toolbar", !val);
  };

  toggle_header = () => {
    return this.redux != null
      ? (this.redux.getActions("page") as any).toggle_fullscreen()
      : undefined;
  };

  set_header_state = (val: any) => {
    return this.redux != null
      ? (this.redux.getActions("page") as any).set_fullscreen(val)
      : undefined;
  };

  set_line_numbers = (show: any): void => {
    this.set_local_storage("line_numbers", !!show);
    // unset the line_numbers property from all cells
    const cells = this.store
      .get("cells")
      .map(cell => cell.delete("line_numbers"));
    if (!cells.equals(this.store.get("cells"))) {
      // actually changed
      this.setState({ cells });
    }
    // now cause cells to update
    this.set_cm_options();
  };

  toggle_line_numbers = (): void => {
    this.set_line_numbers(!this.store.get_local_storage("line_numbers"));
  };

  toggle_cell_line_numbers = (id: any): void => {
    let left, left1;
    const cells = this.store.get("cells");
    const cell = cells.get(id);
    if (cell == null) {
      return;
    }
    const line_numbers =
      (left =
        (left1 = cell.get("line_numbers")) != null
          ? left1
          : this.store.get_local_storage("line_numbers")) != null
        ? left
        : false;
    this.setState({
      cells: cells.set(id, cell.set("line_numbers", !line_numbers))
    });
  };

  // zoom in or out delta font sizes
  set_font_size = (pixels: any) => {
    this.setState({
      font_size: pixels
    });
    // store in localStorage
    return this.set_local_storage("font_size", pixels);
  };

  set_local_storage = (key, value) => {
    if (typeof localStorage !== "undefined" && localStorage !== null) {
      let current = localStorage[this.name];
      if (current != null) {
        current = misc.from_json(current);
      } else {
        current = {};
      }
      if (value === null) {
        delete current[key];
      } else {
        current[key] = value;
      }
      return (localStorage[this.name] = misc.to_json(current));
    }
  };

  zoom = (delta: any) => {
    return this.set_font_size(this.store.get("font_size") + delta);
  };

  set_scroll_state = state => {
    return this.set_local_storage("scroll", state);
  };

  // File --> Open: just show the file listing page.
  file_open = (): void => {
    if (this.redux != null) {
      this.redux
        .getProjectActions(this.store.get("project_id"))
        .set_active_tab("files");
    }
  };

  file_new = (): void => {
    if (this.redux != null) {
      this.redux
        .getProjectActions(this.store.get("project_id"))
        .set_active_tab("new");
    }
  };

  register_input_editor = (id: any, editor: any): void => {
    if (this._input_editors == null) {
      this._input_editors = {};
    }
    this._input_editors[id] = editor;
  };

  unregister_input_editor = (id: any) => {
    return this._input_editors != null
      ? delete this._input_editors[id]
      : undefined;
  };

  // Meant to be used for implementing actions -- do not call externally
  _get_cell_input = (id?: any) => {
    let left, left1;
    if (id == null) {
      id = this.store.get("cur_id");
    }
    return (left =
      (left1 = __guardMethod__(
        this._input_editors != null ? this._input_editors[id] : undefined,
        "save",
        o => o.save()
      )) != null
        ? left1
        : this.store.getIn(["cells", id, "input"])) != null
      ? left
      : "";
  };

  // Press tab key in editor of currently selected cell.
  tab_key = () => {
    return __guardMethod__(
      this._input_editors != null
        ? this._input_editors[this.store.get("cur_id")]
        : undefined,
      "tab_key",
      o => o.tab_key()
    );
  };

  set_cursor = (id: any, pos: any): void => {
    /*
        id = cell id
        pos = {x:?, y:?} coordinates in a cell

        use y=-1 for last line.
        */
    __guardMethod__(
      this._input_editors != null ? this._input_editors[id] : undefined,
      "set_cursor",
      o => o.set_cursor(pos)
    );
  };

  set_kernel = (kernel: any) => {
    if (this.store.get("kernel") !== kernel) {
      return this._set({
        type: "settings",
        kernel
      });
    }
  };

  show_history_viewer = () => {
    return __guard__(
      this.redux.getProjectActions(this.store.get("project_id")),
      x =>
        x.open_file({
          path: misc.history_path(this.store.get("path")),
          foreground: true
        })
    );
  };

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
  complete = async (
    code: any,
    pos?: any,
    id?: any,
    offset?: any
  ): Promise<void> => {
    if (this.project_conn === undefined) {
      this.setState({ complete: { error: "no project connection" } });
      return;
    }

    let cursor_pos;
    const req = (this._complete_request =
      (this._complete_request != null ? this._complete_request : 0) + 1);

    this.setState({ complete: undefined });

    // pos can be either a {line:?, ch:?} object as in codemirror,
    // or a number.
    if (misc.is_object(pos)) {
      const lines = code.split("\n");
      cursor_pos =
        misc.sum(__range__(0, pos.line, false).map(i => lines[i].length + 1)) +
        pos.ch;
    } else {
      cursor_pos = pos;
    }

    let complete;
    try {
      complete = await this._api_call("complete", {
        code,
        cursor_pos
      });
    } catch (err) {
      if (this._complete_request > req) return;
      this.setState({ complete: { error: err } });
      // no op for now...
      return;
    }

    if (this._complete_request > req) {
      // future completion or clear happened; so ignore this result.
      return;
    }

    if (complete.status !== "ok") {
      this.setState({
        complete: {
          error: complete.error ? complete.error : "completion failed"
        }
      });
      return;
    }

    delete complete.status;
    complete.base = code;
    complete.code = code;
    complete.pos = cursor_pos;
    complete.id = id;
    // Set the result so the UI can then react to the change.
    if (offset != null) {
      complete.offset = offset;
    }
    this.setState({ complete: immutable.fromJS(complete) });
    if (complete.matches && complete.matches.length === 1 && id != null) {
      // special case -- a unique completion and we know id of cell in which completing is given
      this.select_complete(id, complete.matches[0]);
    }
  };

  clear_complete = (): void => {
    this._complete_request =
      (this._complete_request != null ? this._complete_request : 0) + 1;
    this.setState({ complete: undefined });
  };

  select_complete = (id: any, item: any): void => {
    const complete = this.store.get("complete");
    this.clear_complete();
    if (complete == null) {
      this.clear_complete();
      this.set_mode("edit");
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
  };

  complete_cell = (id: any, base: any, new_input: any) => {
    this.set_mode("edit");
    // We don't actually make the completion until the next render loop,
    // so that the editor is already in edit mode.  This way the cursor is
    // in the right position after making the change.
    return setTimeout(() => this.merge_cell_input(id, base, new_input), 0);
  };

  merge_cell_input = (id: any, base: any, input: any, save = true): void => {
    const remote = this.store.getIn(["cells", id, "input"]);
    // console.log 'merge', "'#{base}'", "'#{input}'", "'#{remote}'"
    if (remote == null || base == null || input == null) {
      return;
    }
    const new_input = syncstring.three_way_merge({
      base,
      local: input,
      remote
    });
    this.set_cell_input(id, new_input, save);
  };

  complete_handle_key = (_: string, keyCode: any): void => {
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
      for (let x of complete.matches) {
        if (misc.startswith(x, target)) {
          result.push(x);
        }
      }
      return result;
    })();
    if (complete.matches.length === 0) {
      this.clear_complete();
      this.set_mode("edit");
    } else {
      const orig_base = complete.base;
      complete.base = complete.code;
      this.setState({ complete: immutable.fromJS(complete) });
      this.complete_cell(complete.id, orig_base, complete.code);
    }
  };

  introspect = async (
    code: any,
    level: any,
    cursor_pos?: any
  ): Promise<void> => {
    const req = (this._introspect_request =
      (this._introspect_request != null ? this._introspect_request : 0) + 1);

    this.setState({ introspect: undefined });

    if (cursor_pos == null) {
      cursor_pos = code.length;
    }

    let introspect;
    try {
      introspect = await this._api_call("introspect", {
        code,
        cursor_pos,
        level
      });
      if (introspect.status !== "ok") {
        introspect = { error: "completion failed" };
      }
      delete introspect.status;
    } catch (err) {
      introspect = { error: err };
    }
    if (this._introspect_request > req) return;
    this.setState({ introspect: immutable.fromJS(introspect) });
  };

  clear_introspect = (): void => {
    this._introspect_request =
      (this._introspect_request != null ? this._introspect_request : 0) + 1;
    this.setState({ introspect: undefined });
  };

  signal = (signal = "SIGINT"): void => {
    // TODO: some setStates, awaits, and UI to reflect this happening...
    this._api_call("signal", { signal: signal }, 5000);
  };

  set_backend_kernel_info = reuseInFlight(
    async (): Promise<void> => {
      if (this._state === "closed") {
        return;
      }

      if (this._is_project) {
        const dbg = this.dbg(`set_backend_kernel_info ${misc.uuid()}`);
        if (this._jupyter_kernel == null) {
          dbg("not defined");
          return;
        }
        dbg("getting kernel_info...");
        try {
          this.setState({
            backend_kernel_info: await this._jupyter_kernel.kernel_info()
          });
        } catch (err) {
          dbg(`error = ${err}`);
        }
      } else {
        await retry_until_success({
          max_time: 120000,
          start_delay: 1000,
          max_delay: 10000,
          f: this._fetch_backend_kernel_info_from_server
        });
      }
    }
  );

  _fetch_backend_kernel_info_from_server = async (): Promise<void> => {
    const f = async () => {
      if (this._state === "closed") {
        return;
      }
      const data = await this._api_call("kernel_info", {});
      this.setState({
        backend_kernel_info: data,
        // this is when the server for this doc started, not when kernel last started!
        start_time: data.start_time
      });
    };
    await retry_until_success({
      max_time: 1000 * 60 * 30,
      start_delay: 500,
      max_delay: 3000,
      f
    });

    // Update the codemirror editor options.
    this.set_cm_options();
  };

  // Do a file action, e.g., 'compress', 'delete', 'rename', 'duplicate', 'move',
  // 'copy', 'share', 'download', 'open_file', 'close_file', 'reopen_file'
  // Each just shows
  // the corresponding dialog in
  // the file manager, so gives a step to confirm, etc.
  // The path may optionally be *any* file in this project.
  file_action = (action_name: any, path?: any): void => {
    const a = this.redux.getProjectActions(this.store.get("project_id"));
    if (path == null) {
      path = this.store.get("path");
    }
    if (action_name === "reopen_file") {
      a.close_file(path);
      // ensure the side effects from changing registered
      // editors in project_file.* finish happening
      window.setTimeout(() => {
        return a.open_file({ path });
      }, 0);
      return;
    }
    if (action_name === "close_file") {
      this.syncdb.save(() => {
        return a.close_file(path);
      });
      return;
    }
    if (action_name === "open_file") {
      a.open_file({ path });
      return;
    }
    const { head, tail } = misc.path_split(path);
    a.open_directory(head);
    a.set_all_files_unchecked();
    a.set_file_checked(path, true);
    return a.set_file_action(action_name, () => tail);
  };

  show_about = () => {
    this.setState({ about: true });
    return this.set_backend_kernel_info();
  };

  focus = (wait?: any) => {
    //console.log 'focus', wait, (new Error()).stack
    if (this._state === "closed") {
      return;
    }
    if (this._blur_lock) {
      return;
    }
    if (wait) {
      return setTimeout(this.focus, 1);
    } else {
      return this.setState({ is_focused: true });
    }
  };

  blur = (wait?: any) => {
    if (this._state === "closed") {
      return;
    }
    if (wait) {
      return setTimeout(this.blur, 1);
    } else {
      return this.setState({
        is_focused: false,
        mode: "escape"
      });
    }
  };

  blur_lock = () => {
    this.blur();
    return (this._blur_lock = true);
  };

  focus_unlock = () => {
    this._blur_lock = false;
    return this.focus();
  };

  set_max_output_length = n => {
    return this._set({
      type: "settings",
      max_output_length: n
    });
  };

  fetch_more_output = async (id: any): Promise<void> => {
    const time = this._client.server_time() - 0;
    try {
      const more_output = await this._api_call(
        "more_output",
        { id: id },
        60000
      );
      if (!this.store.getIn(["cells", id, "scrolled"])) {
        // make output area scrolled, since there is going to be a lot of output
        this.toggle_output(id, "scrolled");
      }
      this.set_more_output(id, { time, mesg_list: more_output });
    } catch (err) {
      this.set_error(err);
    }
  };

  // TODO: set_more_output on project-actions is different
  set_more_output = (id: any, more_output: any, _?: any): void => {
    let left: any;
    if (this.store.getIn(["cells", id]) == null) {
      return;
    }
    const x =
      (left = this.store.get("more_output")) != null ? left : immutable.Map();
    this.setState({
      more_output: x.set(id, immutable.fromJS(more_output))
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

  set_cm_options = (): void => {
    const mode = this.store.get_cm_mode();
    const editor_settings = __guardMethod__(
      __guard__(this.redux.getStore("account"), x1 =>
        x1.get("editor_settings")
      ),
      "toJS",
      o => o.toJS()
    );
    const line_numbers = this.store.get_local_storage("line_numbers");
    const read_only = this.store.get("read_only");
    const x = immutable.fromJS({
      options: cm_options(mode, editor_settings, line_numbers, read_only),
      markdown: cm_options(
        { name: "gfm2" },
        editor_settings,
        line_numbers,
        read_only
      )
    });

    if (!x.equals(this.store.get("cm_options"))) {
      // actually changed
      this.setState({ cm_options: x });
    }
  };

  show_find_and_replace = (): void => {
    this.blur_lock();
    this.setState({ find_and_replace: true });
  };

  close_find_and_replace = () => {
    this.setState({ find_and_replace: false });
    return this.focus_unlock();
  };

  show_keyboard_shortcuts = (): void => {
    this.blur_lock();
    this.setState({ keyboard_shortcuts: { show: true } });
  };

  close_keyboard_shortcuts = () => {
    this.setState({ keyboard_shortcuts: undefined });
    return this.focus_unlock();
  };

  show_code_assistant = () => {
    if (this.assistant_actions == null) {
      return;
    }
    this.blur_lock();

    const lang = this.store.get_kernel_language();

    this.assistant_actions.init(lang);
    return this.assistant_actions.set({
      show: true,
      lang,
      lang_select: false,
      handler: this.code_assistant_handler
    });
  };

  code_assistant_handler = (data: { code: string[]; descr?: string }): void => {
    this.focus_unlock();
    const { code, descr } = data;
    //if DEBUG then console.log("assistant data:", data, code, descr)

    if (descr != null) {
      const descr_cell = this.insert_cell(1);
      this.set_cell_input(descr_cell, descr);
      this.set_cell_type(descr_cell, "markdown");
    }

    for (let c of code) {
      const code_cell = this.insert_cell(1);
      this.set_cell_input(code_cell, c);
      this.run_code_cell(code_cell);
    }
    this.scroll("cell visible");
  };

  _keyboard_settings = () => {
    if (this._account_change_editor_settings == null) {
      console.warn("account settings not loaded"); // should not happen
      return;
    }
    const k = this._account_change_editor_settings.get(
      "jupyter_keyboard_shortcuts"
    );
    if (k != null) {
      return JSON.parse(k);
    } else {
      return {};
    }
  };

  add_keyboard_shortcut = (name: any, shortcut: any) => {
    const k = this._keyboard_settings();
    if (k == null) {
      return;
    }
    const v = k[name] != null ? k[name] : [];
    for (let x of v) {
      if (underscore.isEqual(x, shortcut)) {
        return;
      }
    }
    v.push(shortcut);
    k[name] = v;
    return this._set_keyboard_settings(k);
  };

  _set_keyboard_settings = (k: any) => {
    return (this.redux.getTable("account") as any).set({
      editor_settings: { jupyter_keyboard_shortcuts: JSON.stringify(k) }
    });
  };

  delete_keyboard_shortcut = (name: any, shortcut: any) => {
    const k = this._keyboard_settings();
    if (k == null) {
      return;
    }
    const v = k[name] != null ? k[name] : [];
    const w = (() => {
      const result: any = [];
      for (let x of v) {
        if (!underscore.isEqual(x, shortcut)) {
          result.push(x);
        }
      }
      return result;
    })();
    if (w.length === v.length) {
      // must be removing a default shortcut
      v.push(misc.merge_copy(shortcut, { remove: true }));
    }
    k[name] = v;
    return this._set_keyboard_settings(k);
  };

  // Display a confirmation dialog, then call opts.cb with the choice.
  // See confirm-dialog.cjsx for options.
  confirm_dialog = (opts: any) => {
    this.blur_lock();
    this.setState({ confirm_dialog: opts });
    return this.store.wait({
      until: state => {
        const c = state.get("confirm_dialog");
        if (c == null) {
          // deleting confirm_dialog prop is same as cancelling.
          return "cancel";
        } else {
          return c.get("choice");
        }
      },
      timeout: 0,
      cb: (err: any, choice: any) => {
        err = err; // TODO: use/handle this
        this.focus_unlock();
        return opts.cb(choice);
      }
    });
  };

  close_confirm_dialog = (choice: any): void => {
    if (choice == null) {
      return this.setState({ confirm_dialog: undefined });
    } else {
      const confirm_dialog = this.store.get("confirm_dialog");
      if (confirm_dialog != null) {
        this.setState({
          confirm_dialog: confirm_dialog.set("choice", choice)
        });
      }
    }
  };

  trust_notebook = () => {
    return this.confirm_dialog({
      icon: "warning",
      title: "Trust this Notebook?",
      body:
        "A trusted Jupyter notebook may execute hidden malicious Javascript code when you open it. Selecting trust below, or evaluating any cell, will immediately execute any Javascript code in this notebook now and henceforth. (NOTE: CoCalc does NOT implement the official Jupyter security model for trusted notebooks; in particular, we assume that you do trust collaborators on your CoCalc projects.)",
      choices: [
        { title: "Trust", style: "danger", default: true },
        { title: "Cancel" }
      ],
      cb: choice => {
        if (choice === "Trust") {
          return this.set_trust_notebook(true);
        }
      }
    });
  };

  set_trust_notebook = (trust: any) => {
    return this._set({
      type: "settings",
      trust: !!trust
    }); // case to bool
  };

  insert_image = (): void => {
    this.setState({ insert_image: true });
  };

  command = (name: any): void => {
    const f = __guard__(
      this._commands != null ? this._commands[name] : undefined,
      x => x.f
    );
    if (f != null) {
      f();
    } else {
      this.set_error(`Command '${name}' is not implemented`);
    }
  };

  // if cell is being edited, use this to move the cursor *in that cell*
  move_edit_cursor = (delta: any): void => {
    delta = delta; // TODO: implement/use this
    this.set_error("move_edit_cursor not implemented");
  };

  // supported scroll positions are in commands.ts
  scroll(pos): any {
    return this.setState({ scroll: pos });
  }

  // submit input for a particular cell -- this is used by the
  // Input component output message type for interactive input.
  submit_input = async (id: any, value: any): Promise<void> => {
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
      value = __range__(0, value.length, false)
        .map((_: any) => "●")
        .join("");
      this.set_cell_output(id, output.set(n, mesg.set("value", value)), false);
      this.save_asap();
      return;
    }

    this.set_cell_output(id, output.set(n, mesg.set("value", value)), false);
    this.save_asap();
  };

  submit_password = async (id: any, value: any): Promise<void> => {
    await this.set_in_backend_key_value_store(id, value);
  };

  set_in_backend_key_value_store = async (
    key: any,
    value: any
  ): Promise<void> => {
    await this._api_call("store", { key, value });
  };

  set_to_ipynb = (ipynb: any, data_only = false) => {
    /*
        set_to_ipynb - set from ipynb object.  This is
        mainly meant to be run on the backend in the project,
        but is also run on the frontend too, e.g.,
        for client-side nbviewer (in which case it won't remove images, etc.).

        See the documentation for load_ipynb_file in project-actions.ts for
        documentation about the data_only input variable.
        */
    //dbg = @dbg("set_to_ipynb")
    let set, trust;
    this._state = "load";

    //dbg(misc.to_json(ipynb))

    // We have to parse out the kernel so we can use process_output below.
    // (TODO: rewrite so process_output is not associated with a specific kernel)
    const kernel =
      __guard__(
        ipynb.metadata != null ? ipynb.metadata.kernelspec : undefined,
        x => x.name
      ) != null
        ? __guard__(
            ipynb.metadata != null ? ipynb.metadata.kernelspec : undefined,
            x => x.name
          )
        : DEFAULT_KERNEL; // very like to work since official ipynb file without this kernelspec is invalid.
    //dbg("kernel in ipynb: name='#{kernel}'")

    if (data_only) {
      trust = undefined;
      set = function() {};
    } else {
      if (typeof this.reset_more_output === "function") {
        this.reset_more_output();
      } // clear the more output handler (only on backend)
      this.syncdb.delete(undefined, false); // completely empty database
      // preserve trust state across file updates/loads
      trust = this.store.get("trust");
      set = obj => {
        return this.syncdb.set(obj, false);
      };
    }

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
      existing_ids: __guard__(this.store.get("cell_list"), x1 => x1.toJS()),
      new_id: this._new_id,
      process_attachment:
        this._jupyter_kernel != null
          ? this._jupyter_kernel.process_attachment
          : undefined,
      output_handler: this._output_handler
    }); // undefined in client; defined in project

    if (data_only) {
      importer.close();
      return;
    }

    // Set all the cells
    const object = importer.cells();
    for (let _ in object) {
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

    return this.syncdb.sync(() => {
      if (typeof this.ensure_backend_kernel_setup === "function") {
        this.ensure_backend_kernel_setup();
      }
      return (this._state = "ready");
    });
  };

  nbconvert = (args: any) => {
    let needle;
    if (
      ((needle = this.store.getIn(["nbconvert", "state"])),
      ["start", "run"].indexOf(needle) > -1)
    ) {
      // not allowed
      return;
    }
    return this.syncdb.set({
      type: "nbconvert",
      args,
      state: "start",
      error: null
    });
  };

  show_nbconvert_dialog = (to: any) => {
    let needle;
    if (to == null) {
      // use last or a default
      const args = this.store.getIn(["nbconvert", "args"]);
      if (args != null) {
        for (
          let i = 0, end = args.length - 1, asc = 0 <= end;
          asc ? i < end : i > end;
          asc ? i++ : i--
        ) {
          if (args[i] === "--to") {
            to = args[i + 1];
          }
        }
      }
    }
    if (to == null) {
      to = "html";
    }
    this.setState({ nbconvert_dialog: { to } });
    if (
      ((needle = this.store.getIn(["nbconvert", "state"])),
      ["start", "run"].indexOf(needle) === -1)
    ) {
      // start it
      return this.nbconvert(["--to", to]);
    }
  };

  nbconvert_get_error = async (): Promise<void> => {
    const key = this.store.getIn(["nbconvert", "error", "key"]);
    if (key == null) {
      return;
    }
    let value;
    try {
      value = await this._api_call("store", { key });
    } catch (err) {
      return; // TODO?
    }
    if (this._state === "closed") {
      return;
    }
    const nbconvert = this.store.get("nbconvert");
    if (nbconvert.getIn(["error", "key"]) === key) {
      this.setState({ nbconvert: nbconvert.set("error", value) });
    }
  };

  cell_toolbar = (name: string): void => {
    // Set which cell toolbar is visible.  At most one may be visible.
    // name=undefined to not show any.
    this.setState({ cell_toolbar: name });
  };

  set_cell_slide = (id: any, value: any) => {
    if (!value) {
      value = null; // delete
    }
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    return this._set({
      type: "cell",
      id,
      slide: value
    });
  };

  ensure_positions_are_unique = () => {
    const changes = cell_utils.ensure_positions_are_unique(
      this.store.get("cells")
    );
    if (changes != null) {
      for (let id in changes) {
        const pos = changes[id];
        this.set_cell_pos(id, pos, false);
      }
    }
    return this._sync();
  };

  set_default_kernel = (kernel: any): void => {
    let left: any;
    if (this._is_project) {
      // doesn't make sense for project (right now at least)
      return;
    }
    const s = this.redux.getStore("account") as any;
    if (s == null) {
      return;
    }
    const cur =
      (left = __guard__(s.getIn(["editor_settings", "jupyter"]), x =>
        x.toJS()
      )) != null
        ? left
        : {};
    cur.kernel = kernel;
    (this.redux.getTable("account") as any).set({
      editor_settings: { jupyter: cur }
    });
  };

  edit_attachments = (id: any): void => {
    this.setState({ edit_attachments: id });
  };

  _attachment_markdown = (name: any) => {
    return `![${name}](attachment:${name})`;
  };

  insert_input_at_cursor = (id: any, s: any, save: any) => {
    if (this.store.getIn(["cells", id]) == null) {
      return;
    }
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    let input = this._get_cell_input(id);
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
  set_cell_attachment = (id: any, name: any, val: any, save = true) => {
    let left: any;
    const cell = this.store.getIn(["cells", id]);
    if (cell == null) {
      // no such cell
      return;
    }
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    const attachments =
      (left = __guard__(cell.get("attachments"), x => x.toJS())) != null
        ? left
        : {};
    attachments[name] = val;
    return this._set(
      {
        type: "cell",
        id,
        attachments
      },
      save
    );
  };

  add_attachment_to_cell = (id: any, path: any): void => {
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    let name = misc.path_split(path).tail;
    name = name.toLowerCase();
    name = encodeURIComponent(name)
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29");
    this.set_cell_attachment(id, name, { type: "load", value: path });
    this.store.wait({
      until: () => {
        return (
          this.store.getIn(["cells", id, "attachments", name, "type"]) ===
          "sha1"
        );
      },
      cb: () => {
        // This has to happen in the next render loop, since changing immediately
        // can update before the attachments props are updated.
        return setTimeout(
          () =>
            this.insert_input_at_cursor(
              id,
              this._attachment_markdown(name),
              true
            ),
          10
        );
      }
    });
  };

  delete_attachment_from_cell = (id: any, name: any) => {
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    this.set_cell_attachment(id, name, null, false);
    return this.set_cell_input(
      id,
      misc.replace_all(
        this._get_cell_input(id),
        this._attachment_markdown(name),
        ""
      )
    );
  };

  add_tag = (id: any, tag: any, save = true) => {
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    return this._set(
      {
        type: "cell",
        id,
        tags: { [tag]: true }
      },
      save
    );
  };

  remove_tag = (id: any, tag: any, save = true) => {
    if (this.store.check_edit_protection(id, this)) {
      return;
    }
    return this._set(
      {
        type: "cell",
        id,
        tags: { [tag]: null }
      },
      save
    );
  };

  set_view_mode = (mode: any): void => {
    this.setState({ view_mode: mode });
    if (mode === "raw") {
      this.set_raw_ipynb();
    }
  };

  edit_cell_metadata = (id: string): void => {
    let left: any;
    const metadata =
      (left = this.store.getIn(["cells", id, "metadata"])) != null
        ? left
        : immutable.Map();
    this.blur_lock();
    this.setState({ edit_cell_metadata: { id, metadata } });
  };

  set_cell_metadata = (opts: any): void => {
    /*
        Sets the metadata to exactly the metadata object.  It doesn't just merge it in.
        */
    let { id, metadata, save, merge } = (opts = defaults(opts, {
      id: required,
      metadata: required,
      save: true,
      merge: false
    }));

    // Special case: delete metdata (unconditionally)
    if (metadata == null || misc.len(metadata) === 0) {
      this._set(
        {
          type: "cell",
          id,
          metadata: null
        },
        save
      );
      return;
    }

    if (merge) {
      let left: any;
      const current =
        (left = this.store.getIn(["cells", id, "metadata"])) != null
          ? left
          : immutable.Map();
      metadata = current.merge(metadata);
    }

    // special fields
    // "collapsed", "scrolled", "slideshow", and "tags"
    if (metadata.tags != null) {
      for (let tag of metadata.tags) {
        this.add_tag(id, tag, false);
      }
      delete metadata.tags;
    }
    // important to not store redundant inconsistent fields:
    for (let field of ["collapsed", "scrolled", "slideshow"]) {
      if (metadata[field] != null) {
        delete metadata[field];
      }
    }

    // first delete
    this._set(
      {
        type: "cell",
        id,
        metadata: null
      },
      false
    );
    // then set
    this._set(
      {
        type: "cell",
        id,
        metadata
      },
      save
    );
    if (this.store.getIn(["edit_cell_metadata", "id"]) === id) {
      return this.edit_cell_metadata(id); // updates the state while editing
    }
  };

  set_raw_ipynb = (): void => {
    if (this._state === "load") {
      return;
    }
    this.setState({
      raw_ipynb: immutable.fromJS(this.store.get_ipynb())
    });
  };

  _api_call_prettier = async (
    str: string,
    options: object,
    timeout_ms?: number
  ): Promise<any> => {
    if (this._state === "closed") {
      throw Error("closed");
    }
    return await (await this.init_project_conn()).api.prettier_string(
      str,
      options,
      timeout_ms
    );
  };

  _format_cell = async (id: string): Promise<void> => {
    const cell = this.store.getIn(["cells", id]);
    if (cell == null) {
      return;
    }
    const code = this._get_cell_input(id).trim();
    let options: any; // TODO type this with a global interface
    const cell_type = cell.get("cell_type", "code");
    const language = this.store.get_kernel_language();
    switch (cell_type) {
      case "code":
        if (language == null) {
          throw new Error(
            `Formatting code cells is impossible, because their language is not known.`
          );
        } else {
          switch (language) {
            case "python":
              options = { parser: "python" };
              break;
            case "r":
              options = { parser: "r" };
              break;
            default:
              throw new Error(
                `Formatting "${language}" cells is not supported yet.`
              );
          }
        }
        break;
      case "markdown":
        options = { parser: "markdown" };
        break;
      default:
        throw new Error(`Unknown cell_type: '${cell_type}'`);
    }
    // console.log("FMT", cell_type, options, code);
    const resp = await this._api_call_prettier(code, options);
    // console.log("FMT resp", resp);

    // we additionally trim the output, because prettier introduces a trailing newline
    const trim = function(str: string): string {
      str = str.trim();
      if (str.length > 0 && str.slice(-1) == "\n") {
        return str.slice(0, -2);
      }
      return str;
    };

    this.set_cell_input(id, trim(resp), false);
  };

  format_cells = async (cell_ids: string[], sync = true): Promise<void> => {
    this.set_error(null);
    let jobs: string[] = [];
    for (let id of cell_ids) {
      if (!this.store.is_cell_editable(id)) {
        continue;
      }
      jobs.push(id);
    }

    try {
      await awaiting.map(jobs, 4, this._format_cell);
    } catch (err) {
      this.set_error(err.message);
      return;
    }

    if (sync) {
      this._sync();
    }
  };

  format_selected_cells = async (sync = true): Promise<void> => {
    const selected = this.store.get_selected_cell_ids_list();
    await this.format_cells(selected, sync);
  };

  format_all_cells = async (sync = true): Promise<void> => {
    const all_cells = this.store.get("cell_list");
    if (all_cells != null) {
      await this.format_cells(all_cells.toJS(), sync);
    }
  };

  switch_to_classical_notebook = () => {
    return this.confirm_dialog({
      title: "Switch to the Classical Notebook?",
      body:
        "If you are having trouble with the the CoCalc Jupyter Notebook, you can switch to the Classical Jupyter Notebook.   You can always switch back to the CoCalc Jupyter Notebook easily later from Jupyter or account settings (and please let us know what is missing so we can add it!).\n\n---\n\n**WARNING:** Multiple people simultaneously editing a notebook, with some using classical and some using the new mode, will NOT work!  Switching back and forth will likely also cause problems (use TimeTravel to recover).  *Please avoid using classical notebook mode if you possibly can!*\n\n[More info and the latest status...](https://github.com/sagemathinc/cocalc/wiki/JupyterClassicModern)",
      choices: [
        { title: "Switch to Classical Notebook", style: "warning" },
        { title: "Continue using CoCalc Jupyter Notebook", default: true }
      ],
      cb: choice => {
        if (choice !== "Switch to Classical Notebook") {
          return;
        }
        (this.redux.getTable("account") as any).set({
          editor_settings: { jupyter_classic: true }
        });
        this.save();
        return this.file_action("reopen_file", this.store.get("path"));
      }
    });
  };

  close_and_halt = (): void => {
    // Kill running session
    this.signal("SIGKILL");
    // Display the main file listing page
    this.file_open();
    // Close the file
    this.file_action("close_file");
  };
}

function __guard__(value: any, transform: any) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
function __range__(left: any, right: any, inclusive: any) {
  let range: any[] = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}
function __guardMethod__(obj: any, methodName: any, transform: any) {
  if (
    typeof obj !== "undefined" &&
    obj !== null &&
    typeof obj[methodName] === "function"
  ) {
    return transform(obj, methodName);
  } else {
    return undefined;
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
