/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Set } from "immutable";
import { delay } from "awaiting";
import {
  bind_methods,
  close,
  enumerate,
  is_whitespace,
  lstrip,
} from "@cocalc/util/misc";
import { JupyterEditorActions } from "../actions";
import { NotebookFrameStore } from "./store";
import { create_key_handler } from "@cocalc/frontend/jupyter/keyboard";
import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { move_selected_cells } from "@cocalc/frontend/jupyter/cell-utils";
require("@cocalc/frontend/jupyter/types");
import { CellType, Scroll } from "@cocalc/frontend/jupyter/types";
import {
  commands,
  CommandDescription,
} from "@cocalc/frontend/jupyter/commands";
import { isEqual } from "lodash";

export interface EditorFunctions {
  save?: () => string | undefined;
  set_cursor?: (pos: { x?: number; y?: number }) => void;
  tab_key?: () => void;
  shift_tab_key?: () => void;
  refresh?: () => void;
  get_cursor?: () => { line: number; ch: number };
  get_cursor_xy?: () => { x: number; y: number };
}

declare let DEBUG: boolean;

export class NotebookFrameActions {
  private _is_closed: boolean = false;
  private frame_tree_actions: JupyterEditorActions;
  private jupyter_actions: JupyterActions;
  private key_handler?: Function;
  private input_editors: { [id: string]: EditorFunctions } = {};
  private scroll_before_change?: number;
  private cur_id_before_change: string | undefined = undefined;

  public commands: { [name: string]: CommandDescription } = {};
  public frame_id: string;
  public store: NotebookFrameStore;
  public cell_list_div?: any; // the div for the cell list is stored here and accessed from here.
  private windowed_list_ref?: any;

  constructor(frame_tree_actions: JupyterEditorActions, frame_id: string) {
    bind_methods(this);

    // General frame tree editor actions:
    this.frame_tree_actions = frame_tree_actions;

    // Actions for the Jupyter notebook:
    this.jupyter_actions = frame_tree_actions.jupyter_actions;

    this.frame_id = frame_id;
    this.store = new NotebookFrameStore(frame_tree_actions, frame_id);

    this.jupyter_actions.store.on("cell-list-recompute", this.update_cur_id);

    this.update_cur_id();
    this.init_syncdb_change_hook();

    this.commands = commands(
      this.jupyter_actions,
      { current: this },
      this.frame_tree_actions
    );
  }

  public set_windowed_list_ref(windowed_list_ref) {
    this.windowed_list_ref = windowed_list_ref;
  }

  public set_cell_list_div(node) {
    this.cell_list_div = $(node);
  }

  private init_syncdb_change_hook(): void {
    this.jupyter_actions.store.on(
      "syncdb-before-change",
      this.syncdb_before_change
    );
    this.jupyter_actions.store.on(
      "syncdb-after-change",
      this.syncdb_after_change
    );
  }

  private get_windowed_list(): any {
    if (
      this.windowed_list_ref == null ||
      this.windowed_list_ref.current == null
    )
      return;
    return this.windowed_list_ref.current;
  }

  /*
  The functions below: compute_cell_position, syncdb_before_change,
  syncdb_after_change, scroll, etc. are all so that if you change
  the document in one browser or frame it doesn't move around the
  focused cell in any others.  This is tricky and complicated, and
  doesn't work 100%, but is probably good enough.
  */
  private compute_cell_position(id: string): number | undefined {
    const windowed_list = this.get_windowed_list();
    if (windowed_list == null) {
      // directly use the DOM since not using windowed list
      return $(this.cell_list_div).find(`#${id}`).offset()?.top;
    }

    const cell_list = this.jupyter_actions.store.get("cell_list").toArray();
    let computed: number = 0;
    let index: number = 0;
    for (const id0 of cell_list) {
      if (id0 == id) break;
      computed += windowed_list.row_height(index);
      index += 1;
    }
    return computed;
  }

  // maintain scroll hook on change; critical for multiuser editing
  private syncdb_before_change(): void {
    this.get_windowed_list()?.disable_refresh();
    const cur_id = this.store.get("cur_id");
    const pos = this.compute_cell_position(cur_id);
    this.scroll_before_change = pos;
    this.cur_id_before_change = cur_id;
  }

  private async syncdb_after_change(): Promise<void> {
    try {
      const id = this.cur_id_before_change;
      if (this.scroll_before_change == null || id == null) {
        return;
      }
      let after = this.compute_cell_position(id);
      if (after == null) {
        return;
      }
      // If you delete a cell, then the move amount is known immediately,
      // and we do them immediately to avoid a jump.
      // Other changes of cell size may only happen
      // after a delay of 0 (next render loop).
      // (There can be flicker if both happen at once.)
      let diff = after - this.scroll_before_change;
      if (after != this.scroll_before_change) {
        this.scroll(diff);
        const windowed_list = this.get_windowed_list();
        if (windowed_list != null) {
          windowed_list.enable_refresh();
          windowed_list.refresh();
          this.scroll_before_change = after;
          await delay(0);
          if (this.frame_id == null) return; // closed
          after = this.compute_cell_position(id);
          if (after == null) return;
          diff = after - this.scroll_before_change;
          this.scroll_before_change = after; // since we have compensated for it.
          this.scroll(diff);
        }
        this.scroll_before_change = after;
      }
    } finally {
      const windowed_list = this.get_windowed_list();
      if (windowed_list != null) {
        windowed_list.enable_refresh();
        windowed_list.refresh();
      }
    }
  }

  public is_closed(): boolean {
    return this._is_closed;
  }

  public close(): void {
    this.jupyter_actions.store.removeListener(
      "syncdb-before-change",
      this.syncdb_before_change
    );
    this.jupyter_actions.store.removeListener(
      "cell-list-recompute",
      this.update_cur_id
    );
    this.jupyter_actions.store.removeListener(
      "syncdb-after-change",
      this.syncdb_after_change
    );
    this.store.close();
    close(this);
    this._is_closed = true;
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
      if (store.getIn(["cells", id]) == null) {
        console.warn(`NotebookFrameActions.validate -- invalid id ${id}`);
      }
    }
  }

  /* private todo(f: string, ...args): void {
    if (!DEBUG) return;
    this.dbg(f, "TODO", ...args);
  }
  */

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
    if (this.is_closed()) {
      throw Error(
        "can't call enable_key_handler after CellNotebookActions are closed"
      );
    }
    if (this.key_handler == null) {
      this.key_handler = create_key_handler(
        this.jupyter_actions,
        this,
        this.frame_tree_actions
      );
    }
    this.frame_tree_actions.set_active_key_handler(this.key_handler);
  }

  public disable_key_handler(): void {
    if (this.key_handler == null || this.frame_tree_actions == null) return;
    this.frame_tree_actions.erase_active_key_handler(this.key_handler);
    delete this.key_handler;
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
    for (const id of v) {
      const save = id === v[v.length - 1]; // save only last one.
      this.run_cell(id, save);
    }
  }

  // This is here since it depends on knowing the edit state
  // of markdown cells.
  public run_cell(id: string, save: boolean = true): void {
    const type = this.jupyter_actions.store.get_cell_type(id);
    if (type === "markdown") {
      if (this.store.get("md_edit_ids", Set()).contains(id)) {
        this.set_md_cell_not_editing(id);
      }
      return;
    }
    if (type === "code") {
      this.jupyter_actions.run_cell(id, save);
    }
    // running is a no-op for raw cells.
  }

  /***
   * TODO: better organize this code below:
   ***/

  set_mode(mode: "escape" | "edit"): void {
    if (this.store.get("mode") === mode) return; // no-op
    if (mode == "edit") {
      // If we're changing to edit mode and current cell is a markdown
      // cell, switch it to the codemirror editor view.
      const cur_id = this.store.get("cur_id");
      if (this.jupyter_actions.store.get_cell_type(cur_id) === "markdown") {
        this.set_md_cell_editing(cur_id);
      }
    }
    this.enable_key_handler();
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
    this.command("cut cell");
  }

  public copy(): void {
    this.command("copy cell");
  }

  public paste(value?: string | true): void {
    value = value; // ignored -- we use internal buffer
    this.command("paste cell and replace");
  }

  public scroll(scroll?: Scroll): void {
    if (scroll != 0) {
      this.setState({ scroll });
    }
  }

  public set_scrollTop(scrollTop: number): void {
    this.setState({ scrollTop });
  }

  public set_md_cell_editing(id: string): void {
    this.jupyter_actions.set_jupyter_metadata(
      id,
      "input_hidden",
      undefined,
      false
    );
    let md_edit_ids = this.store.get("md_edit_ids");
    if (md_edit_ids == null) md_edit_ids = Set();
    if (md_edit_ids.contains(id)) {
      return;
    }
    if (this.jupyter_actions.check_edit_protection(id)) {
      return;
    }
    this.setState({ md_edit_ids: md_edit_ids.add(id) });
  }

  public set_md_cell_not_editing(id: string): void {
    this.jupyter_actions.set_jupyter_metadata(
      id,
      "input_hidden",
      undefined,
      false
    );
    let md_edit_ids = this.store.get("md_edit_ids");
    if (md_edit_ids == null || !md_edit_ids.contains(id)) {
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
  // This does nothing if cur_id is set to an actual cell.
  private update_cur_id(): void {
    const cells = this.jupyter_actions.store.get("cells");
    if (cells == null) return; // can't do anything yet.
    const cur_id = this.store.get("cur_id");
    if (cur_id == null || cells.get(cur_id) == null) {
      const new_cur_id = this.jupyter_actions.store.get_cell_list().get(0);
      if (new_cur_id == null) return; // can't do anything -- no cells
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
      cur_id: id,
    });
  }

  public unselect_all_cells(): void {
    this.setState({ sel_ids: Set() });
  }

  public unselect_cell(id: string): void {
    const sel_ids = this.store.get("sel_ids");
    if (!sel_ids.contains(id)) return;
    this.setState({ sel_ids: sel_ids.remove(id) });
  }

  public select_cell(id: string): void {
    const sel_ids = this.store.get("sel_ids");
    if (sel_ids.contains(id)) return;
    this.setState({ sel_ids: sel_ids.add(id) });
  }

  public select_all_cells(): void {
    this.setState({
      sel_ids: this.jupyter_actions.store.get_cell_list().toSet(),
    });
  }

  /***
   * Cursor movement, which here means "the selected cell",
   * not the cursor in an editor.
   ***/

  move_cursor(delta: number): void {
    try {
      this.set_cur_id_from_index(this.store.get_cur_cell_index() + delta);
    } catch (err) {
      // This could fail if the cur_id is invalid for some reason (e.g.,
      // maybe that cell just got deleted by another user). So we update
      // the current id so next time it will work. See
      // https://github.com/sagemathinc/cocalc/issues/3873
      this.update_cur_id();
    }
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

  register_input_editor(id: string, editor: EditorFunctions): void {
    this.validate({ id });
    this.input_editors[id] = editor;
  }

  unregister_input_editor(id: string): void {
    if (this.input_editors == null) return;
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

  // Call this to save the state of the current (or specified)
  // Codemirror editor before it is used for evaluation or
  // other purposes.
  public save_input_editor(id?: string): void {
    if (id == null) {
      id = this.store.get("cur_id");
      if (id == null) return;
    }
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
      return;
    }
    const method = editor[name];
    if (method != null) {
      method(...args);
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
    if (this.jupyter_actions.check_edit_protection(id)) {
      return;
    }
    this.jupyter_actions.set_cell_type(id, "markdown");
    this.set_md_cell_editing(id);
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
    const id: string = this.store.get("cur_id");
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
      return sel_ids.forEach((id) => {
        this.jupyter_actions.set_cell_type(id, cell_type);
      });
    }
  }

  public set_error(error: string): void {
    this.frame_tree_actions.set_error(error, undefined, this.frame_id);
  }

  public async command(name: string): Promise<void> {
    this.dbg("command", name);
    const cmd = this.commands[name];
    if (cmd != null && cmd.f != null) {
      try {
        await cmd.f();
      } catch (err) {
        this.set_error(`error running '${name}' -- ${err}`);
      }
    } else {
      this.set_error(`Command '${name}' not implemented`);
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
    for (const id in this.store.get_selected_cell_ids()) {
      this.jupyter_actions.toggle_jupyter_metadata_boolean(id, "source_hidden");
    }
  }

  public toggle_outputs_hidden(): void {
    for (const id in this.store.get_selected_cell_ids()) {
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
    const cursor = this.input_editors[cur_id]?.get_cursor?.();
    if (cursor == null) return; // no cursor, no split.
    this.jupyter_actions.split_cell(cur_id, cursor);
  }

  public toggle_write_protection_on_selected_cells(): void {
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

  // if cell is being edited, use this to move the cursor *in that cell*
  public move_edit_cursor(delta: 1 | -1): void {
    const editor = this.input_editors[this.store.get("cur_id")];
    if (editor == null) return;
    const xy = editor.get_cursor_xy?.();
    if (xy == null) return;
    xy.y += delta;
    editor.set_cursor?.(xy);
  }

  // Run all cells strictly above the current cursor position.
  public run_all_above(): void {
    this.jupyter_actions.run_all_above_cell(this.store.get("cur_id"));
  }

  // Run all cells below (and *including*) the current cursor position.
  public run_all_below(): void {
    this.jupyter_actions.run_all_below_cell(this.store.get("cur_id"));
  }

  public async run_selected_cells_and_insert_new_cell_below(): Promise<void> {
    const v = this.store.get_selected_cell_ids_list();
    this.run_selected_cells(v);
    const new_id = this.jupyter_actions.insert_cell_adjacent(
      v[v.length - 1],
      1
    );
    // Set mode back to edit in the next loop.
    await delay(0);
    this.set_cur_id(new_id);
    this.set_mode("edit");
    this.scroll("cell visible");
  }

  public merge_cell_above(save: boolean = true): void {
    this.move_cursor(-1);
    this.merge_cell_below(save);
  }

  public merge_cell_below(save: boolean = true): void {
    this.jupyter_actions.merge_cell_below_cell(this.store.get("cur_id"), save);
  }

  // Merge all selected cells into one cell.
  public merge_selected_cells(): void {
    const cell_ids = this.store.get_selected_cell_ids_list();
    this.jupyter_actions.merge_cells(cell_ids);
    this.set_cur_id(cell_ids[0]);
  }

  public extend_selection(delta: -1 | 1): void {
    const cur_id = this.store.get("cur_id");
    this.move_cursor(delta);
    const target_id = this.store.get("cur_id");
    if (cur_id === target_id) {
      // no move
      return;
    }
    const sel_ids = this.store.get("sel_ids");
    if (sel_ids.contains(target_id)) {
      // moved cursor onto a selected cell
      if (sel_ids.size <= 2) {
        // selection clears if shrinks to 1
        this.unselect_all_cells();
      } else {
        this.unselect_cell(cur_id);
      }
    } else {
      // moved onto a not-selected cell
      this.select_cell(cur_id);
      this.select_cell(target_id);
    }
  }

  public insert_image(): void {
    const cur_id = this.store.get("cur_id");
    if (this.jupyter_actions.store.get_cell_type(cur_id) === "markdown") {
      this.jupyter_actions.insert_image(cur_id); // causes a modal dialog to appear.
    } else {
      throw Error(`insert_image -- cell must be a markdown cell`);
    }
  }

  public toggle_selected_outputs(property: "collapsed" | "scrolled"): void {
    this.jupyter_actions.toggle_outputs(
      this.store.get_selected_cell_ids_list(),
      property
    );
  }

  public zoom(delta: -1 | 1): void {
    this.frame_tree_actions.change_font_size(delta, this.frame_id);
  }

  public async format_selected_cells(sync: boolean = true): Promise<void> {
    this.save_input_editor();
    await this.jupyter_actions.format_cells(
      this.store.get_selected_cell_ids_list(),
      sync
    );
  }
  public async format_all_cells(sync: boolean = true): Promise<void> {
    this.save_input_editor();
    await this.jupyter_actions.format_all_cells(sync);
  }

  public async format(): Promise<void> {
    await this.format_selected_cells();
  }

  public refresh(): void {
    for (const id in this.input_editors) {
      this.input_editors[id]?.refresh?.();
    }
  }

  adjacentCell(y: number, delta: number): void {
    this.move_cursor(delta);
    this.set_input_editor_cursor(this.store.get("cur_id"), {
      x: 0,
      y,
    });
    this.scroll("cell visible");
  }
}
