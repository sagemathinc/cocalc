/*
browser-actions: additional actions that are only available in the
web browser frontend.
*/
import { Set } from "immutable";
import { debounce, isEqual } from "underscore";
import { merge_copy, uuid } from "smc-util/misc";
import { JupyterActions as JupyterActions0 } from "./actions";
import { WidgetManager } from "./widgets/manager";
import { CursorManager } from "./cursor-manager";
const { instantiate_assistant } = require("../assistant/main");
const { commands } = require("./commands");

export class JupyterActions extends JupyterActions0 {
  public widget_manager?: WidgetManager;
  private cursor_manager: CursorManager;
  private assistant_actions: any;
  private _account_change_editor_settings: any;
  private _commands: any;
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

    // Load kernel (once ipynb file loads).
    this.set_kernel_after_load();

    // Setup dedicated websocket to project
    // TODO: might be replaced by an ephemeral table which broadcasts cpu
    // state, all user tab completions, widget state, etc.
    this.init_project_conn();

    this.syncdb.once("ready", () => {
      this.widget_manager = new WidgetManager(
        this.syncdb.ipywidgets_state,
        this.widget_model_ids_add.bind(this)
      );
      // Stupid hack for now -- this just causes some activity so
      // that the syncdb syncs.
      // This should not be necessary, and may indicate a bug in the sync layer?
      this.syncdb.set({ type: "user", id: 0, time: new Date().valueOf() });
      this.syncdb.commit();
    });

    // Put an entry in the project log once the jupyter notebook gets opened.
    // NOTE: Obviously, the project does NOT need to put entries in the log.
    this.syncdb.once("change", () =>
      this.redux.getProjectActions(this.project_id).log_opened_time(this.path)
    );

    // project doesn't care about cursors, but browser clients do:
    this.syncdb.on("cursor_activity", this.syncdb_cursor_activity);
    this.cursor_manager = new CursorManager();

    // this initializes actions+store for the assistant
    // this is also only a UI specific action
    this.assistant_actions = instantiate_assistant(this.project_id, this.path);

    if (window != null && (window as any).$ != null) {
      // frontend browser client with jQuery
      this.set_jupyter_kernels(); // must be after setting project_id above.

      // set codemirror editor options whenever account editor_settings change.
      const account_store = this.redux.getStore("account") as any; // TODO: check if ever is undefined
      account_store.on("change", this._account_change);
      this._account_change_editor_settings = account_store.get(
        "editor_settings"
      );
      this._commands = commands(this);

      this.init_scroll_pos_hook();
    }
  }

  private widget_model_ids_add(model_id: string): void {
    const widget_model_ids: Set<string> = this.store
      .get("widget_model_ids")
      .add(model_id);
    this.setState({ widget_model_ids });
  }

  protected close_client_only(): void {
    delete this._commands;
    const account = this.redux.getStore("account");
    if (account != null) {
      account.removeListener("change", this._account_change);
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
      this.syncdb.get_cursors()
    );
    if (cells != null) {
      this.setState({ cells });
    }
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

  add_keyboard_shortcut = (name: any, shortcut: any) => {
    const k = this._keyboard_settings();
    if (k == null) {
      return;
    }
    const v = k[name] != null ? k[name] : [];
    for (let x of v) {
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
    if (this._commands == null) return;
    const cmd = this._commands[name];
    if (cmd != null && cmd.f != null) {
      cmd.f();
    } else {
      this.set_error(`Command '${name}' is not implemented`);
    }
  };

  public send_comm_message_to_kernel(comm_id: string, data: any): string {
    const msg_id = uuid();
    this._api_call("comm", [msg_id, comm_id, data]);
    return msg_id;
  }
}
