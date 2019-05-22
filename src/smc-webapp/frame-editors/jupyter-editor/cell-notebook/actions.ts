declare const $: any;

import { Set } from "immutable";

import { enumerate, is_whitespace, lstrip } from "smc-util/misc";

import { JupyterEditorActions } from "../actions";
import { NotebookFrameStore } from "./store";
import { create_key_handler } from "../../../jupyter/keyboard";
import { JupyterActions } from "../../../jupyter/browser-actions";
import { move_selected_cells } from "../../../jupyter/cell-utils";
import { CellType, Scroll } from "../../../jupyter/types";
import { commands, CommandDescription } from "../../../jupyter/commands";

import { isEqual } from "lodash";

const DEBUG = true;

export class NotebookFrameActions {
  private frame_tree_actions: JupyterEditorActions;
  private jupyter_actions: JupyterActions;
  private key_handler?: Function;
  private input_editors: { [id: string]: any } = {};
  private scroll_before_change?: number;

  public commands: { [name: string]: CommandDescription } = {};
  public frame_id: string;
  public store: NotebookFrameStore;
  public cell_list_div?: any; // the div for the cell list is stored here and accessed from here.

  constructor(frame_tree_actions: JupyterEditorActions, frame_id: string) {
    // General frame tree editor actions:
    this.frame_tree_actions = frame_tree_actions;

    // Actions for the Jupyter notebook:
    this.jupyter_actions = frame_tree_actions.jupyter_actions;

    this.frame_id = frame_id;
    this.store = new NotebookFrameStore(frame_tree_actions, frame_id);

    this.jupyter_actions.store.on(
      "cell-list-recompute",
      this.update_cur_id.bind(this)
    );

    this.update_cur_id();
    this.init_syncdb_change_hook();

    this.commands = commands(this.jupyter_actions, this);
  }

  private init_syncdb_change_hook(): void {
    this.syncdb_before_change = this.syncdb_before_change.bind(this);
    this.syncdb_after_change = this.syncdb_after_change.bind(this);
    this.jupyter_actions.store.on(
      "syncdb-before-change",
      this.syncdb_before_change
    );
    this.jupyter_actions.store.on(
      "syncdb-after-change",
      this.syncdb_after_change
    );
  }

  // maintain scroll hook on change; critical for multiuser editing
  private syncdb_before_change(): void {
    const offset = $(`.cocalc-jupyter-hook-${this.frame_id}`).offset();
    if (offset == null) {
      return;
    }
    this.scroll_before_change = offset.top;
  }

  private syncdb_after_change(): void {
    if (this.scroll_before_change == null) {
      return;
    }
    const offset = $(`.cocalc-jupyter-hook-${this.frame_id}`).offset();
    if (offset == null) {
      return;
    }
    const scroll_after_change = offset.top;
    const diff = scroll_after_change - this.scroll_before_change;
    if (diff) {
      this.scroll(diff);
    }
  }

  public close(): void {
    this.jupyter_actions.store.removeListener(
      "syncdb-before-change",
      this.syncdb_before_change
    );
    this.jupyter_actions.store.removeListener(
      "syncdb-after-change",
      this.syncdb_after_change
    );
    delete this.commands;
    delete this.frame_tree_actions;
    delete this.jupyter_actions;
    delete this.frame_id;
    delete this.key_handler;
    delete this.input_editors;
    this.store.close();
    delete this.store;
    delete this.cell_list_div;
  }

  /***
   * Debugging related functioanlity
   ***/

  private dbg(f: string, ...args): void {
    if (!DEBUG) return;
    console.log(
      `NotebookFrameActions(frame_id='${this.frame_id}').${f}`,
      ...args
    );
  }

  private validate(obj: object): void {
    if (!DEBUG) return;
    if (obj["id"]) {
      const id = obj["id"];
      const store = this.jupyter_actions.store;
      if (store.getIn(["cells", id]) === undefined) {
        throw Error(`NotebookFrameActions.validate -- invalid id ${id}`);
      }
    }
  }

  private todo(f: string, ...args): void {
    if (!DEBUG) return;
    this.dbg(f, "TODO", ...args);
  }

  /***
   * standard Actions API
   ***/

  public setState(obj: object): void {
    this.store.setState(obj);
  }

  /***
   * Keyboard handling
   ***/
  public save(explicit: boolean = true): void {
    this.frame_tree_actions.save(explicit);
  }

  public enable_key_handler(): void {
    if (this.key_handler == null) {
      this.key_handler = create_key_handler(this.jupyter_actions, this);
    }
    this.frame_tree_actions.set_active_key_handler(this.key_handler);
  }

  public disable_key_handler(): void {
    if (this.key_handler == null) return;
    this.frame_tree_actions.erase_active_key_handler(this.key_handler);
  }

  /* Run the selected cells; triggered by either clicking the play button or
     press shift+enter.  Note that this has weird and inconsitent
     behavior in official Jupyter for usability reasons and due to
     their "modal" approach.
     In particular, if the selections goes to the end of the document, we
     create a new cell and set it the mode to edit; otherwise, we advance
     the cursor and switch to escape mode. */
  public shift_enter_run_selected_cells(): void {
    this.save_input_editor();

    const v: string[] = this.store.get_selected_cell_ids_list();
    if (v.length === 0) {
      return;
    }
    const last_id: string = v[v.length - 1];

    this.run_selected_cells(v);

    const cell_list = this.jupyter_actions.store.get_cell_list();
    if (cell_list.get(cell_list.size - 1) === last_id) {
      const new_id = this.insert_cell(1);
      this.set_cur_id(new_id);
      this.set_mode("edit");
    } else {
      this.set_mode("escape");
      this.move_cursor(1);
    }
  }

  public run_selected_cells(v?: string[]): void {
    this.save_input_editor();

    if (v === undefined) {
      v = this.store.get_selected_cell_ids_list();
    }

    // for whatever reason, any running of a cell deselects
    // in official jupyter
    this.unselect_all_cells();

    for (let id of v) {
      this.run_cell(id, false);
    }
    this.jupyter_actions.save_asap();
  }

  public run_cell(id: string, save: boolean = true): void {
    if (this.store.get("md_edit_ids", Set()).contains(id)) {
      this.set_md_cell_not_editing(id);
      return;
    }
    this.jupyter_actions.run_cell(id, save);
  }

  /***
   * TODO: organize this stuff:
   ***/

  set_mode(mode: "escape" | "edit"): void {
    this.setState({ mode });
  }

  public focus(wait?: boolean): void {
    // TODO: wait is ignored!
    wait = wait;
    this.enable_key_handler();
  }

  public blur(): void {
    this.disable_key_handler();
  }

  public cut(): void {
    this.todo("cut");
  }

  public copy(): void {
    this.todo("copy");
  }

  public paste(): void {
    this.todo("paste");
  }

  public scroll(scroll?: Scroll): void {
    this.setState({ scroll });
  }

  public set_scrollTop(scrollTop: number): void {
    this.setState({ scrollTop });
  }

  set_md_cell_editing(id: string): void {
    this.jupyter_actions.set_jupyter_metadata(
      id,
      "input_hidden",
      undefined,
      false
    );
    const md_edit_ids = this.store.get("md_edit_ids", Set());
    if (md_edit_ids.contains(id)) {
      return;
    }
    if (this.jupyter_actions.check_edit_protection(id)) {
      return;
    }
    this.setState({ md_edit_ids: md_edit_ids.add(id) });
  }

  set_md_cell_not_editing(id: string): void {
    this.jupyter_actions.set_jupyter_metadata(
      id,
      "input_hidden",
      undefined,
      false
    );
    let md_edit_ids = this.store.get("md_edit_ids", Set());
    if (!md_edit_ids.contains(id)) {
      return;
    }
    md_edit_ids = md_edit_ids.delete(id);
    this.setState({ md_edit_ids });
  }

  // Set which cell is currently the cursor.
  public set_cur_id(cur_id: string): void {
    this.validate({ id: cur_id });
    const store = this.jupyter_actions.store;
    if (
      store.getIn(["cells", cur_id, "cell_type"]) === "markdown" &&
      this.store.get("mode") === "edit"
    ) {
      if (store.is_cell_editable(cur_id)) {
        this.set_md_cell_editing(cur_id);
      }
    }
    this.setState({ cur_id });
  }

  // Called when the cell list changes due to external events.
  // E.g., another user deleted the cell that is currently selected.
  private update_cur_id(): void {
    const cells = this.jupyter_actions.store.get("cells");
    if (cells == null) return; // can't do anything yet.
    const cur_id = this.store.get("cur_id");
    if (cur_id == null || cells.get(cur_id) == null) {
      const new_cur_id = this.jupyter_actions.store.get_cell_list().get(0);
      this.set_cur_id(new_cur_id);
    }
  }

  public set_cur_id_from_index(i: number): void {
    const cell_list = this.jupyter_actions.store.get_cell_list();
    if (i < 0) {
      i = 0;
    } else if (i >= cell_list.size) {
      i = cell_list.size - 1;
    }
    this.set_cur_id(cell_list.get(i));
  }

  /***
   * Selection
   ***/

  // Select all cells from the currently focused one (where the cursor
  // is -- cur_id) to the cell with the given id, then set the cursor
  // to be at id.
  select_cell_range(id: string): void {
    this.validate({ id });

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
        this.setState({ sel_ids: Set() }); // empty (cur_id always included)
      }
      return;
    }
    const v = this.jupyter_actions.store.get_cell_list().toJS();
    let endpoint0, endpoint1, i, x;
    for ([i, x] of enumerate(v)) {
      if (x === id) {
        endpoint0 = i;
      }
      if (x === cur_id) {
        endpoint1 = i;
      }
    }
    if (endpoint0 >= endpoint1) {
      [endpoint0, endpoint1] = [endpoint1, endpoint0];
    }
    sel_ids = Set(v.slice(endpoint0, endpoint1 + 1));
    this.setState({
      sel_ids,
      cur_id: id
    });
  }

  public unselect_all_cells(): void {
    this.setState({ sel_ids: Set() });
  }

  public select_all_cells(): void {
    this.setState({
      sel_ids: this.jupyter_actions.store.get_cell_list().toSet()
    });
  }

  /***
   * Cursor movement, which here means "the selected cell",
   * not the cursor in an editor.
   ***/

  move_cursor(delta: number): void {
    this.set_cur_id_from_index(this.store.get_cur_cell_index() + delta);
  }

  move_cursor_after(id: string): void {
    this.validate({ id });
    const i = this.jupyter_actions.store.get_cell_index(id);
    if (i == null) {
      return;
    }
    this.set_cur_id_from_index(i + 1);
  }

  move_cursor_before(id: string): void {
    this.validate({ id });
    const i = this.jupyter_actions.store.get_cell_index(id);
    if (i == null) {
      return;
    }
    this.set_cur_id_from_index(i - 1);
  }

  move_cursor_to_cell(id: string): void {
    this.validate({ id });
    const i = this.jupyter_actions.store.get_cell_index(id);
    if (i == null) {
      return;
    }
    this.set_cur_id_from_index(i);
  }

  /***
   * Codemirror input editor control and tracking.
   ***/

  register_input_editor(id: string, editor: any): void {
    this.validate({ id });
    this.input_editors[id] = editor;
  }

  unregister_input_editor(id: string): void {
    delete this.input_editors[id];
  }

  /* Set position of the cursor in a codemirror input editor for a
     given cell.
      - id = cell id
      - pos = {x:?, y:?} coordinates in a cell
     use y=-1 for last line.

     No-op if no input editor for this cell.
  */
  public set_input_editor_cursor(
    id: string,
    pos: { x: number; y: number }
  ): void {
    this.validate({ id });
    if (this.input_editors[id] == null) return;
    this.call_input_editor_method(id, "set_cursor", pos);
  }

  // Call this to save the state of the current Codemirror editor
  // before it is used for evaluation or other purposes.
  public save_input_editor(): void {
    const id = this.store.get("cur_id");
    if (this.input_editors[id] == null) return;
    this.call_input_editor_method(id, "save");
  }

  // Used for implementing actions -- keep private
  private get_cell_input(id: string): string {
    if (this.input_editors[id] != null) {
      this.call_input_editor_method(id, "save");
    }
    return this.jupyter_actions.store.getIn(["cells", id, "input"], "");
  }

  private call_input_editor_method(id: string, name: string, ...args): void {
    this.validate({ id });
    const editor = this.input_editors[id];
    if (editor == null) {
      throw Error(`no input editor for cell ${id}`);
    }
    const method = editor[name];
    if (method != null) {
      method(...args);
    } else {
      throw Error(`call_input_editor_method -- no such method "${name}"`);
    }
  }

  // Press tab key in editor of currently selected cell.
  public tab_key(): void {
    this.call_input_editor_method(this.store.get("cur_id"), "tab_key");
  }

  // Press shift + tab key in editor of currently selected cell.
  public shift_tab_key(): void {
    this.call_input_editor_method(this.store.get("cur_id"), "shift_tab_key");
  }

  public change_cell_to_heading(id: string, n: number = 1): void {
    this.validate({ id });
    if (
      this.jupyter_actions.store.check_edit_protection(id, this.jupyter_actions)
    ) {
      return;
    }
    this.set_md_cell_editing(id);
    this.jupyter_actions.set_cell_type(id, "markdown");
    const input: string = lstrip(this.get_cell_input(id));
    let i: number = 0;
    while (i < input.length && input[i] === "#") {
      i += 1;
    }
    let input1 = "";
    for (let k = 0; k < n; k++) {
      input1 += "#";
    }
    if (!is_whitespace(input[i])) {
      input1 += " ";
    }
    input1 += input.slice(i);
    this.jupyter_actions.set_cell_input(id, input1);
  }

  // delta = -1 (above) or +1 (below)
  public insert_cell(delta: 1 | -1): string {
    const id = this.jupyter_actions.insert_cell_adjacent(
      this.store.get("cur_id"),
      delta
    );
    this.set_cur_id(id);
    return id;
  }

  public delete_selected_cells(sync: boolean = true): void {
    const selected: string[] = this.store.get_selected_cell_ids_list();
    if (selected.length === 0) {
      return;
    }
    let id: string = this.store.get("cur_id");
    this.move_cursor_after(selected[selected.length - 1]);
    if (this.store.get("cur_id") === id) {
      this.move_cursor_before(selected[0]);
    }
    this.jupyter_actions.delete_cells(selected, sync);
  }

  public set_selected_cell_type(cell_type: CellType): void {
    const sel_ids = this.store.get("sel_ids");
    const cur_id = this.store.get("cur_id");
    if (sel_ids.size === 0) {
      if (cur_id != null) {
        this.jupyter_actions.set_cell_type(cur_id, cell_type);
      }
    } else {
      return sel_ids.forEach(id => {
        this.jupyter_actions.set_cell_type(id, cell_type);
      });
    }
  }

  public command(name: string): void {
    this.dbg("command", name);
    const cmd = this.commands[name];
    if (cmd != null && cmd.f != null) {
      cmd.f();
    } else {
      this.frame_tree_actions.set_error(`Command '${name}' is not implemented`);
    }
  }

  public move_selected_cells(delta: number): void {
    // Move all selected cells delta positions up or down, e.g.,
    // delta = +1 or delta = -1
    // This action changes the pos attributes of 0 or more cells.
    if (delta === 0) {
      return;
    }
    const v = this.jupyter_actions.store.get_cell_list().toJS();
    const w = move_selected_cells(v, this.store.get_selected_cell_ids(), delta);
    if (w == null) {
      return;
    }
    // now w is a complete list of the id's of the whole worksheet
    // in the proper order; use it to set pos
    if (isEqual(v, w)) {
      // no change
      return;
    }
    const cells = this.jupyter_actions.store.get("cells");
    // const changes = immutable.Set(); // TODO: unused
    for (let pos = 0; pos < w.length; pos++) {
      const id = w[pos];
      if (cells.getIn([id, "pos"]) !== pos) {
        this.jupyter_actions.set_cell_pos(id, pos, false);
      }
    }
    this.jupyter_actions._sync();
  }

  public toggle_source_hidden(): void {
    for (let id in this.store.get_selected_cell_ids()) {
      this.jupyter_actions.toggle_jupyter_metadata_boolean(id, "source_hidden");
    }
  }

  public toggle_outputs_hidden(): void {
    for (let id in this.store.get_selected_cell_ids()) {
      this.jupyter_actions.toggle_jupyter_metadata_boolean(
        id,
        "outputs_hidden"
      );
    }
  }

  public unhide_current_input(): void {
    const cur_id = this.store.get("cur_id");
    this.jupyter_actions.set_jupyter_metadata(
      cur_id,
      "source_hidden",
      undefined,
      true
    );
  }

  public clear_selected_outputs(): void {
    this.jupyter_actions.clear_outputs(this.store.get_selected_cell_ids_list());
  }

  public split_current_cell(): void {
    const cur_id = this.store.get("cur_id");
    const editor = this.input_editors[cur_id];
    if (editor == null) return; // no cursor, no split.
    const cursor = editor.get_cursor();
    this.jupyter_actions.split_cell(cur_id, cursor);
  }

  public toggle_write_protection_on_selected_cells(): void {
    // also make sure to switch to escape mode and eval markdown cells
    /*
    this.set_mode("escape");
    const f = id => {
      const type = this.store.getIn(["cells", id, "cell_type"]);
      if (type === "markdown") {
        return this.set_md_cell_not_editing(id);
      }
    };
*/
    const cell_ids = this.store.get_selected_cell_ids_list();
    this.jupyter_actions.toggle_write_protection_on_cells(cell_ids);
  }

  public toggle_delete_protection_on_selected_cells(): void {
    const cell_ids = this.store.get_selected_cell_ids_list();
    this.jupyter_actions.toggle_delete_protection_on_cells(cell_ids);
  }

  // Cut currently selected cells, putting them in internal clipboard
  public cut_selected_cells(): void {
    this.copy_selected_cells();
    this.delete_selected_cells();
  }

  // Copy all currently selected cells into our internal clipboard
  public copy_selected_cells(): void {
    this.jupyter_actions.copy_cells(this.store.get_selected_cell_ids_list());
  }

  // Pastes cells currently in the global clipboard, relative
  // to current selection.
  //  0 = replace; 1 = after; -1 = before.
  public paste_cells(delta: 0 | 1 | -1 = 1): void {
    this.jupyter_actions.paste_cells_at(
      this.store.get_selected_cell_ids_list(),
      delta
    );
  }
}
