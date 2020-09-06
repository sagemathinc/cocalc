/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
browser-actions: additional actions that are only available in the
web browser frontend.
*/
import { Map, Set } from "immutable";
import { debounce, isEqual } from "underscore";
import { merge_copy, uuid, server_time } from "smc-util/misc";
import { JupyterActions as JupyterActions0 } from "./actions";
import { WidgetManager } from "./widgets/manager";
import { CursorManager } from "./cursor-manager";
import { ConfirmDialogOptions } from "./confirm-dialog";
import { callback } from "awaiting";
import { callback2, once } from "smc-util/async-utils";
import { JUPYTER_CLASSIC_MODERN } from "smc-util/theme";
const { instantiate_snippets } = require("../assistant/main");
import { NBGraderActions } from "./nbgrader/actions";
import { CellToolbarName } from "./types";
import { exec } from "../frame-editors/generic/client";
import { open_popup_window } from "../misc-page";
import { IPYNB2PDF } from "../misc/commands";

export class JupyterActions extends JupyterActions0 {
  public widget_manager?: WidgetManager;
  public nbgrader_actions: NBGraderActions;
  public snippet_actions: any;

  private cursor_manager: CursorManager;
  private account_change_editor_settings: any;
  private update_keyboard_shortcuts: any;

  // Only run this code on the browser frontend (not in project).
  protected init_client_only(): void {
    const do_set = () => {
      if (this.syncdb == null) return;
      const has_unsaved_changes = this.syncdb.has_unsaved_changes();
      const has_uncommitted_changes = this.syncdb.has_uncommitted_changes();
      this.setState({ has_unsaved_changes, has_uncommitted_changes });
      if (has_uncommitted_changes) {
        this.syncdb.save(); // save them.
      }
    };
    const f = () => {
      do_set();
      return setTimeout(do_set, 3000);
    };
    this.set_save_status = debounce(f, 1500);
    this.syncdb.on("metadata-change", this.set_save_status);
    this.syncdb.on("connected", this.set_save_status);

    // Also maintain read_only state.
    this.syncdb.on("metadata-change", this.sync_read_only);
    this.syncdb.on("connected", this.sync_read_only);

    // And activity indicator
    this.syncdb.on("change", this.activity);

    // Load kernel (once ipynb file loads).
    this.set_kernel_after_load();

    // Setup dedicated websocket to project
    // TODO: might be replaced by an ephemeral table which broadcasts cpu
    // state, all user tab completions, widget state, etc.
    this.init_project_conn();

    // this initializes actions+store for the snippet dialog
    // this is also only a UI specific action
    this.snippet_actions = instantiate_snippets(this.project_id, this.path);

    // nbgrader support
    this.nbgrader_actions = new NBGraderActions(this, this.redux);

    this.syncdb.once("ready", () => {
      const ipywidgets_state = this.syncdb.ipywidgets_state;
      if (ipywidgets_state == null) {
        throw Error("bug -- ipywidgets_state must be defined");
      }
      this.widget_manager = new WidgetManager(
        ipywidgets_state,
        this.widget_model_ids_add.bind(this)
      );
      // Stupid hack for now -- this just causes some activity so
      // that the syncdb syncs.
      // This should not be necessary, and may indicate a bug in the sync layer?
      this.syncdb.set({ type: "user", id: 0, time: new Date().valueOf() });
      this.syncdb.commit();

      // If using nbgrader ensure document is fully updated.
      if (this.store.get("cell_toolbar") == "create_assignment") {
        // We only do this for notebooks where the toolbar is open, not for *any* old
        // random notebook.  It would be dumb to run this always (e.g., for a 1000
        // cell notebook that has nothing to do with nbgrader).
        this.nbgrader_actions.update_metadata();
      }
    });

    // Put an entry in the project log once the jupyter notebook gets opened.
    // NOTE: Obviously, the project does NOT need to put entries in the log.
    this.syncdb.once("change", () =>
      this.redux.getProjectActions(this.project_id).log_opened_time(this.path)
    );

    // project doesn't care about cursors, but browser clients do:
    this.syncdb.on("cursor_activity", this.syncdb_cursor_activity);
    this.cursor_manager = new CursorManager();

    if (window != null && (window as any).$ != null) {
      // frontend browser client with jQuery
      this.set_jupyter_kernels(); // must be after setting project_id above.

      // set codemirror editor options whenever account editor_settings change.
      const account_store = this.redux.getStore("account") as any; // TODO: check if ever is undefined
      this.account_change = this.account_change.bind(this);
      account_store.on("change", this.account_change);
      this.account_change_editor_settings = account_store.get(
        "editor_settings"
      );
    }
  }

  private activity(): void {
    this.redux.getProjectActions(this.project_id).flag_file_activity(this.path);
  }

  focus = (wait?: any) => {
    this.deprecated("focus", wait);
  };

  blur = (wait?: any) => {
    this.deprecated("blur", wait);
  };

  blur_lock = () => {
    //this.deprecated("blur_lock");
  };

  focus_unlock = () => {
    // this.deprecated("focus_unlock");
  };

  private widget_model_ids_add(model_id: string): void {
    const widget_model_ids: Set<string> = this.store
      .get("widget_model_ids")
      .add(model_id);
    this.setState({ widget_model_ids });
  }

  protected close_client_only(): void {
    const account = this.redux.getStore("account");
    if (account != null) {
      account.removeListener("change", this.account_change);
    }
  }

  private syncdb_cursor_activity = (): void => {
    if (
      this.store == null ||
      this.syncdb == null ||
      this.cursor_manager == null
    )
      return;
    const cells = this.cursor_manager.process(
      this.store.get("cells"),
      this.syncdb.get_cursors() as any /* typescript is being dumb */
    );
    if (cells != null) {
      this.setState({ cells });
    }
  };

  public async show_code_snippets(id: string): Promise<void> {
    if (this.snippet_actions == null) {
      throw Error("code assistant not available");
    }
    const lang = this.store.get_kernel_language();

    this.snippet_actions.init(lang);
    const wait_for_user_input = (cb) => {
      this.snippet_actions.set({
        show: true,
        lang,
        lang_select: false,
        handler: (data) => cb(undefined, data),
        cell_id: id,
      });
    };

    const data = await callback(wait_for_user_input);
    this.code_snippet_handler(data);
  }

  private code_snippet_handler(data: {
    code: string[];
    descr?: string;
    cell_id: string;
  }): void {
    const { cell_id, code, descr } = data;

    let id = cell_id;
    if (descr != null) {
      id = this.insert_cell_adjacent(cell_id, +1);
      this.set_cell_input(id, descr);
      this.set_cell_type(id, "markdown");
    }
    for (const c of code) {
      id = this.insert_cell_adjacent(id, +1);
      this.set_cell_input(id, c);
      this.run_code_cell(id);
    }
  }

  private account_change(state: Map<string, any>): void {
    // TODO: it might be better to implement redux
    // change listeners for particular keys.
    if (
      !state.get("editor_settings").equals(this.account_change_editor_settings)
    ) {
      const new_settings = state.get("editor_settings");
      if (
        this.account_change_editor_settings.get(
          "jupyter_keyboard_shortcuts"
        ) !== new_settings.get("jupyter_keyboard_shortcuts")
      ) {
        this.update_keyboard_shortcuts();
      }

      this.account_change_editor_settings = new_settings;
      this.set_cm_options();
    }
  }

  _keyboard_settings = () => {
    if (this.account_change_editor_settings == null) {
      console.warn("account settings not loaded"); // should not happen
      return;
    }
    const k = this.account_change_editor_settings.get(
      "jupyter_keyboard_shortcuts"
    );
    if (k != null) {
      return JSON.parse(k);
    } else {
      return {};
    }
  };

  show_find_and_replace = (): void => {
    this.blur_lock();
    this.setState({ find_and_replace: true });
  };

  close_find_and_replace = () => {
    this.setState({ find_and_replace: false });
    this.focus_unlock();
  };

  show_keyboard_shortcuts = (): void => {
    this.blur_lock();
    this.setState({ keyboard_shortcuts: { show: true } });
  };

  close_keyboard_shortcuts = () => {
    this.setState({ keyboard_shortcuts: undefined });
    this.focus_unlock();
  };

  add_keyboard_shortcut = (name: any, shortcut: any) => {
    const k = this._keyboard_settings();
    if (k == null) {
      return;
    }
    const v = k[name] != null ? k[name] : [];
    for (const x of v) {
      if (isEqual(x, shortcut)) {
        return;
      }
    }
    v.push(shortcut);
    k[name] = v;
    return this._set_keyboard_settings(k);
  };

  _set_keyboard_settings = (k: any) => {
    return (this.redux.getTable("account") as any).set({
      editor_settings: { jupyter_keyboard_shortcuts: JSON.stringify(k) },
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
      for (const x of v) {
        if (!isEqual(x, shortcut)) {
          result.push(x);
        }
      }
      return result;
    })();
    if (w.length === v.length) {
      // must be removing a default shortcut
      v.push(merge_copy(shortcut, { remove: true }));
    }
    k[name] = v;
    return this._set_keyboard_settings(k);
  };

  command = (name: any): void => {
    this.deprecated("command", name);
  };

  public send_comm_message_to_kernel(comm_id: string, data: any): string {
    const msg_id = uuid();
    this.api_call("comm", [msg_id, comm_id, data]);
    return msg_id;
  }

  // NOTE: someday move this to the frame-tree actions, since it would
  // be generically useful!
  // Display a confirmation dialog, then return the chosen option.
  public async confirm_dialog(
    confirm_dialog: ConfirmDialogOptions
  ): Promise<string> {
    this.blur_lock();
    this.setState({ confirm_dialog });
    function dialog_is_closed(state): string | undefined {
      const c = state.get("confirm_dialog");
      if (c == null) {
        // deleting confirm_dialog prop is same as cancelling.
        return "cancel";
      } else {
        return c.get("choice");
      }
    }
    try {
      return await callback2(this.store.wait, {
        until: dialog_is_closed,
        timeout: 0,
      });
    } catch (err) {
      console.warn("Jupyter modal dialog error -- ", err);
      return "cancel";
    } finally {
      this.focus_unlock();
    }
  }

  public close_confirm_dialog(choice?: string): void {
    if (choice === undefined) {
      this.setState({ confirm_dialog: undefined });
      return;
    }
    const confirm_dialog = this.store.get("confirm_dialog");
    if (confirm_dialog != null) {
      this.setState({
        confirm_dialog: confirm_dialog.set("choice", choice),
      });
    }
  }

  public async switch_to_classical_notebook(): Promise<void> {
    const choice = await this.confirm_dialog({
      title: "Switch to the Classical Notebook?",
      body:
        "If you are having trouble with the the CoCalc Jupyter Notebook, you can switch to the Classical Jupyter Notebook.   You can always switch back to the CoCalc Jupyter Notebook easily later from Jupyter or account settings (and please let us know what is missing so we can add it!).\n\n---\n\n**WARNING:** Multiple people simultaneously editing a notebook, with some using classical and some using the new mode, will NOT work!  Switching back and forth will likely also cause problems (use TimeTravel to recover).  *Please avoid using classical notebook mode if you possibly can!*\n\n[More info and the latest status...](" +
        JUPYTER_CLASSIC_MODERN +
        ")",
      choices: [
        { title: "Switch to Classical Notebook", style: "warning" },
        { title: "Continue using CoCalc Jupyter Notebook", default: true },
      ],
    });
    if (choice !== "Switch to Classical Notebook") {
      return;
    }
    (this.redux.getTable("account") as any).set({
      editor_settings: { jupyter_classic: true },
    });
    await this.save();
    this.file_action("reopen_file", this.store.get("path"));
  }

  public async confirm_close_and_halt(): Promise<void> {
    if (
      (await this.confirm_dialog({
        title: "Close this file and halt the kernel",
        body:
          "Are you sure you want to close this file and halt the kernel?  All variable state will be lost.",
        choices: [
          { title: "Cancel" },
          {
            title: "Close and halt",
            style: "danger",
            default: true,
          },
        ],
      })) === "Close and halt"
    ) {
      await this.close_and_halt();
    }
  }

  public async close_and_halt(): Promise<void> {
    // Display the main file listing page
    this.file_open();
    // Fully shutdown kernel, and save this file.
    await this.shutdown();
    // Close the file
    this.file_action("close_file");
  }

  public async trust_notebook(): Promise<void> {
    const choice = await this.confirm_dialog({
      icon: "warning",
      title: "Trust this Notebook?",
      body:
        "A trusted Jupyter notebook may execute hidden malicious Javascript code when you open it. Selecting trust below, or evaluating any cell, will immediately execute any Javascript code in this notebook now and henceforth. (NOTE: CoCalc does NOT implement the official Jupyter security model for trusted notebooks; in particular, we assume that you do trust collaborators on your CoCalc projects.)",
      choices: [
        { title: "Trust", style: "danger", default: true },
        { title: "Cancel" },
      ],
    });
    if (choice === "Trust") {
      this.set_trust_notebook(true);
    }
  }

  private nbconvert_has_started(): boolean {
    const state = this.store.getIn(["nbconvert", "state"]);
    return state === "start" || state === "run";
  }

  public show_nbconvert_dialog(to: string): void {
    this.setState({ nbconvert_dialog: { to } });
    if (to == "chromium-pdf") {
      this.chromium_pdf();
      return;
    }
    if (!this.nbconvert_has_started()) {
      this.nbconvert(["--to", to]); // start it
    }
  }

  public nbconvert(args: string[]): void {
    if (this.nbconvert_has_started()) {
      // can't run it while it is already running.
      throw Error("nbconvert is already running");
    }
    if (this.syncdb == null) {
      console.warn("nbconvert: syncdb not available, aborting...");
      return;
    }
    this.syncdb.set({
      type: "nbconvert",
      args,
      state: "start",
      error: null,
    });
    this.syncdb.commit();
  }

  public async chromium_pdf(): Promise<void> {
    let error: string | undefined = undefined;
    // used indirectly by the nbconvert dialog only...
    const args = ["--to", "chromium-pdf"];
    const start = server_time().valueOf();
    try {
      await this.save();
      this.syncdb.set({
        type: "nbconvert",
        state: "run",
        args,
        start,
        error,
      });
      await this.syncdb.commit();
      await exec({
        command: IPYNB2PDF,
        args: [this.path],
        project_id: this.project_id,
      });
    } catch (err) {
      error = `${err}`;
    } finally {
      this.syncdb.set({
        type: "nbconvert",
        state: "done",
        args,
        start,
        time: server_time().valueOf(),
        error,
      });
      await this.syncdb.commit();
    }
  }

  public async nbconvert_get_error(): Promise<void> {
    const key: string | undefined = this.store.getIn([
      "nbconvert",
      "error",
      "key",
    ]);
    if (key == null) {
      return;
    }
    let error;
    try {
      error = await this.api_call("store", { key });
    } catch (err) {
      this.set_error(err);
      return;
    }
    if (this._state === "closed") {
      return;
    }
    const nbconvert = this.store.get("nbconvert");
    if (nbconvert != null && nbconvert.getIn(["error", "key"]) === key) {
      this.setState({ nbconvert: nbconvert.set("error", error) });
    }
  }

  public show_about(): void {
    this.setState({ about: true });
    this.set_backend_kernel_info();
  }

  public toggle_line_numbers(): void {
    this.set_line_numbers(!this.store.get_local_storage("line_numbers"));
  }

  public toggle_cell_line_numbers(id: string): void {
    if (this._state === "closed") return;
    const cells = this.store.get("cells");
    const cell = cells.get(id);
    if (cell == null) throw Error(`no cell with id ${id}`);
    const line_numbers: boolean = !!cell.get(
      "line_numbers",
      this.store.get_local_storage("line_numbers")
    );
    this.setState({
      cells: cells.set(id, cell.set("line_numbers", !line_numbers)),
    });
  }

  hide(): void {
    this.deprecated("hide");
    // this.blur();
  }

  public async restart_and_run_all_no_halt(): Promise<void> {
    const choice = await this.confirm_dialog({
      title: "Restart kernel and run all cells (do not stop on errors)",
      body:
        "Are you sure you want to restart the kernel and re-execute all cells?  All variable state and output will be reset, though past output is available in TimeTravel.",
      choices: [
        { title: "Cancel" },
        {
          title: "Restart and run all",
          style: "danger",
          default: true,
        },
      ],
    });
    if (choice === "Restart and run all") {
      await this.restart();
      this.run_all_cells(true);
    }
  }
  public async restart_and_run_all(): Promise<void> {
    const STOP = "Run all (stop on first error)";
    const NOSTOP = "Run all (do not stop on errors)";
    const choice = await this.confirm_dialog({
      title: "Restart kernel and run notebook",
      body:
        "Are you sure you want to restart the kernel and run the notebook?  All variable state and output will be reset, though past output is available in TimeTravel. ",
      choices: [
        { title: "Cancel" },
        {
          title: STOP,
          style: "danger",
          default: true,
        },
        {
          title: NOSTOP,
          style: "danger",
        },
      ],
    });
    if (choice === STOP) {
      await this.restart();
      this.run_all_cells(false);
    }
    if (choice === NOSTOP) {
      await this.restart();
      this.run_all_cells(true);
    }
  }

  public async restart_clear_all_output(): Promise<void> {
    const choice = await this.confirm_dialog({
      title: "Restart kernel and clear all output?",
      body:
        "Do you want to restart the kernel and clear all output?  All variables and outputs will be lost, though most past output is always available in TimeTravel.",
      choices: [
        { title: "Continue running" },
        {
          title: "Restart and clear all outputs",
          style: "danger",
          default: true,
        },
      ],
    });
    if (choice === "Restart and clear all outputs") {
      this.restart();
      this.clear_all_outputs();
    }
  }

  public async confirm_restart(): Promise<void> {
    const choice = await this.confirm_dialog({
      title: "Restart kernel?",
      body: "Do you want to restart the kernel?  All variables will be lost.",
      choices: [
        { title: "Continue running" },
        { title: "Restart", style: "danger", default: true },
      ],
    });
    if (choice === "Restart") {
      this.restart();
    }
  }

  public cell_toolbar(name?: CellToolbarName): void {
    // Set which cell toolbar is visible.
    // At most one may be visible.
    // name=undefined to not show any.
    // When switching to the 'nbgrader' toolbar, the metadata is also updated.
    this.set_local_storage("cell_toolbar", name);
    if (name == "create_assignment") {
      this.nbgrader_actions.update_metadata();
    }
    this.setState({ cell_toolbar: name });
  }

  public custom_jupyter_kernel_docs(): void {
    open_popup_window(
      "https://doc.cocalc.com/howto/custom-jupyter-kernel.html"
    );
  }

  /* Wait until the syncdb is ready *and* there is at
     least one cell in the notebook. For a brand new blank
     notebook, the backend will create a blank cell.

     If the current state is "closed" there is no way
     it'll ever be ready, so we throw an Error.
  */
  public async wait_until_ready(): Promise<void> {
    switch (this.syncdb.get_state()) {
      case "init":
        await once(this.syncdb, "ready");
        break;
      case "closed":
        throw Error("syncdb is closed so will never be ready");
    }
    // Wait until there is at least one cell.  The backend is
    // responsible for ensuring there is at least one cell.
    while ((this.store.get("cell_list")?.size ?? 0) <= 0) {
      // wait for a change event:
      await once(this.store, "change");
    }
  }
}
