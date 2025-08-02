/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { Set } from "immutable";
import { isEqual } from "lodash";

import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import {
  CommandDescription,
  commands,
} from "@cocalc/frontend/jupyter/commands";
import { create_key_handler } from "@cocalc/frontend/jupyter/keyboard";
import Fragment from "@cocalc/frontend/misc/fragment-id";
import { Cell, Scroll } from "@cocalc/jupyter/types";
import { move_selected_cells } from "@cocalc/jupyter/util/cell-utils";
import { CellType } from "@cocalc/util/jupyter/types";
import {
  bind_methods,
  close,
  enumerate,
  is_whitespace,
  lstrip,
} from "@cocalc/util/misc";
import { JupyterEditorActions } from "../actions";
import { NotebookFrameStore } from "./store";

export interface EditorFunctions {
  set_cursor: (pos: { x?: number; y?: number }) => void;
  get_cursor: () => { line: number; ch: number };
  // most are not defined for markdown input.
  save?: () => string | undefined;
  tab_key?: () => void;
  shift_tab_key?: () => void;
  refresh?: () => void;
  get_cursor_xy?: () => { x: number; y: number };
  getSelection?: () => string;
  focus?: () => void;
}

declare let DEBUG: boolean;

export class NotebookFrameActions {
  private _is_closed: boolean = false;
  private frame_tree_actions: JupyterEditorActions;
  public jupyter_actions: JupyterActions;
  private key_handler?: (e: any) => void;
  private input_editors: { [id: string]: EditorFunctions } = {};
  private scroll_before_change?: number;
  private cur_id_before_change: string | undefined = undefined;

  public commands: { [name: string]: CommandDescription } = {};
  public frame_id: string;
  public store: NotebookFrameStore;
  public cell_list_div?: any; // the div for the cell list is stored here and accessed from here.
  private windowed_list_ref?: any;
  private scroll_seq: number = 0;

  constructor(frame_tree_actions: JupyterEditorActions, frame_id: string) {
    bind_methods(this);

    // General frame tree editor actions:
    this.frame_tree_actions = frame_tree_actions;

    // Actions for the Jupyter notebook:
    this.jupyter_actions = frame_tree_actions.jupyter_actions;

    this.frame_id = frame_id;
    this.store = new NotebookFrameStore(frame_tree_actions, frame_id);

    // in prod, I observed "actions.ts:72 Uncaught (in promise)
    // TypeError: Cannot read properties of undefined (reading 'store')"
    // as a side effect of a problem loading TimeTravel history.
    // Better to at least not crash:
    this.jupyter_actions?.store.on("cell-list-recompute", this.update_cur_id);

    this.update_cur_id();
    this.init_syncdb_change_hook();

    this.commands = commands({
      jupyter_actions: this.jupyter_actions,
      frame_actions: this,
      editor_actions: this.frame_tree_actions,
    });

    this.setState({ scroll: "", scroll_seq: -1 });
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
      this.syncdb_before_change,
    );
    this.jupyter_actions.store.on(
      "syncdb-after-change",
      this.syncdb_after_change,
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
      this.syncdb_before_change,
    );
    this.jupyter_actions.store.removeListener(
      "cell-list-recompute",
      this.update_cur_id,
    );
    this.jupyter_actions.store.removeListener(
      "syncdb-after-change",
      this.syncdb_after_change,
    );
    this.store.close();
    close(this);
    this._is_closed = true;
  }

  /***
   * Debugging related functionality
   ***/

  private dbg(f: string, ...args): void {
    if (!DEBUG) return;
    console.log(
      `NotebookFrameActions(frame_id='${this.frame_id}').${f}`,
      ...args,
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
      // should be a no op -- no point in enabling the key handler after CellNotebookActions are closed.
      return;
    }
    if (this.key_handler == null) {
      this.key_handler = create_key_handler(
        this.jupyter_actions,
        this,
        this.frame_tree_actions,
      );
    }
    if (this.key_handler != null) {
      this.frame_tree_actions.set_active_key_handler(this.key_handler);
    }
  }

  public disable_key_handler(): void {
    if (this.key_handler == null || this.frame_tree_actions == null) return;
    this.frame_tree_actions.erase_active_key_handler(this.key_handler);
    delete this.key_handler;
  }

  /* Run the selected cells; triggered by either clicking the play button or
     press shift+enter.  Note that this has weird and inconsistent
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

  public shift_enter_run_current_cell(): void {
    this.save_input_editor();
    const cur_id = this.store.get("cur_id");
    this.run_cell(cur_id);
    const cell_list = this.jupyter_actions.store.get_cell_list();
    if (cell_list.get(cell_list.size - 1) === cur_id) {
      const new_id = this.insert_cell(1);
      this.set_cur_id(new_id);
      this.set_mode("edit");
    } else {
      this.set_mode("escape");
      this.move_cursor(1);
    }
  }

  public run_selected_cells(ids?: string[]): void {
    this.save_input_editor();

    if (ids == null) {
      ids = this.store.get_selected_cell_ids_list();
    }

    // for whatever reason, any running of a cell deselects
    // in official jupyter
    this.unselect_all_cells();
    this.runCells(ids);
  }

  run_cell(id: string) {
    this.runCells([id]);
  }

  // This is here since it depends on knowing the edit state
  // of markdown cells.
  public runCells(ids: string[]): void {
    const v: string[] = [];
    for (const id of ids) {
      const type = this.jupyter_actions.store.get_cell_type(id);
      if (type === "markdown") {
        if (this.store.get("md_edit_ids", Set()).contains(id)) {
          this.set_md_cell_not_editing(id);
        }
      } else if (type === "code") {
        v.push(id);
      }
      // running is a no-op for raw cells.
    }
    if (v.length > 0) {
      this.jupyter_actions.runCells(v);
    }
  }

  /***
   * TODO: better organize this code below:
   ***/

  set_mode(mode: "escape" | "edit"): void {
    if (this.jupyter_actions.store.get("read_only") && mode == "edit") {
      return;
    }
    if (mode == "edit") {
      // If we're changing to edit mode and current cell is a markdown
      // cell, switch it to the codemirror editor view.
      const cur_id = this.store.get("cur_id");
      if (this.jupyter_actions.store.get_cell_type(cur_id) === "markdown") {
        this.set_md_cell_editing(cur_id);
      }
      if (this.input_editors[cur_id] != null) {
        this.input_editors[cur_id].focus?.();
      }
    }
    this.enable_key_handler();
    this.setState({ mode });
  }

  public focus(_wait?: boolean): void {
    // we always wait 1 ms.
    setTimeout(() => {
      this.enable_key_handler();
    }, 1);
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
      this.scroll_seq += 1;
      this.setState({ scroll, scroll_seq: this.scroll_seq });
    }
  }

  public set_scrollTop(scrollTop: any): void {
    this.setState({ scrollTop });
  }

  public set_md_cell_editing(id: string): void {
    this.jupyter_actions.set_jupyter_metadata(
      id,
      "input_hidden",
      undefined,
      false,
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

  public set_md_cell_not_editing(id: string): void {
    this.jupyter_actions.set_jupyter_metadata(
      id,
      "input_hidden",
      undefined,
      false,
    );
    let md_edit_ids = this.store.get("md_edit_ids");
    if (md_edit_ids == null || !md_edit_ids.contains(id)) {
      return;
    }
    md_edit_ids = md_edit_ids.delete(id);
    this.setState({ md_edit_ids });
  }

  public set_all_md_cells_not_editing(): void {
    this.setState({ md_edit_ids: null });
  }

  // Set which cell is currently the cursor.
  public set_cur_id(cur_id: string | undefined): void {
    if (cur_id == null) return;
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
    const prev_id = this.store.get("cur_id");
    this.setState({ cur_id });

    // set the fragment if the id **changes** and this is the
    // the active frame.
    if (
      cur_id != prev_id &&
      this.frame_tree_actions._get_active_id() == this.frame_id
    ) {
      Fragment.set({ id: cur_id });
    }
  }

  get_cell_by_id(id: string): Cell | undefined {
    const cells = this.jupyter_actions.store.get("cells");
    if (cells == null) return;
    return cells.get(id);
  }

  public switch_md_cell_to_edit(id: string): void {
    const cell = this.get_cell_by_id(id);
    if (cell == null) return;

    if (!this.jupyter_actions.store.is_cell_editable(id)) {
      // TODO: NEVER ever silently fail!
      return;
    }
    this.set_md_cell_editing(id);
    this.set_cur_id(id);
    this.set_mode("edit");
  }

  public cell_md_is_editing(id): boolean {
    const md_edit_ids = this.store.get("md_edit_ids", Set());
    return md_edit_ids.contains(id);
  }

  public toggle_md_cell_edit(id: string): void {
    const cell = this.get_cell_by_id(id);
    if (cell == null) return;
    if (!this.jupyter_actions.store.is_cell_editable(id)) {
      // TODO: NEVER ever silently fail!
      return;
    }

    if (this.cell_md_is_editing(id)) {
      this.set_md_cell_not_editing(id);
      this.set_mode("escape");
    } else {
      this.switch_md_cell_to_edit(id);
      this.set_mode("edit");
    }
    this.set_cur_id(id);
  }

  public switch_code_cell_to_edit(id: string): void {
    const cell = this.get_cell_by_id(id);
    if (cell == null) return;

    if (cell.getIn(["metadata", "editable"]) === false) {
      // TODO: NEVER ever silently fail!
      return;
    }
    this.set_cur_id(id);
    this.set_mode("edit");
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
    this.set_mode("escape");
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

  // select all cells, possibly of a given type.
  select_all_cells = (cell_type?: CellType) => {
    let sel_ids;
    if (cell_type) {
      sel_ids =
        this.jupyter_actions.store
          .get("cells")
          ?.filter((x) => x.get("cell_type", "code") == cell_type)
          .keySeq()
          .toJS() ?? [];
    } else {
      sel_ids = this.jupyter_actions.store.get_cell_list().toSet();
    }
    this.setState({ sel_ids });
  };

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
    pos: { x: number; y: number },
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

  // Used for implementing actions and chatgpt
  get_cell_input(id: string): string {
    if (this.input_editors[id] != null) {
      this.call_input_editor_method(id, "save");
    }
    return this.jupyter_actions.store.getIn(["cells", id, "input"], "");
  }

  // used for chatgpt
  getCellSelection(id: string): string {
    return this.input_editors[id]?.["getSelection"]?.() ?? "";
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

  public set_cell_input(id, input) {
    this.validate({ id });
    if (this.jupyter_actions.check_edit_protection(id)) {
      return;
    }
    this.jupyter_actions.set_cell_input(id, input);
  }

  // delta = -1 (above) or +1 (below)
  public insert_cell(delta: 1 | -1): string {
    const id = this.jupyter_actions.insert_cell_adjacent(
      this.store.get("cur_id"),
      delta,
    );
    this.set_cur_id(id);
    this.scroll("cell visible");
    setTimeout(() => this.scroll("cell visible"), 0);
    setTimeout(() => this.scroll("cell visible"), 10);
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
    this.frame_tree_actions.set_error(error);
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
    for (let pos = 0; pos < w.length; pos++) {
      const id = w[pos];
      if (cells.getIn([id, "pos"]) !== pos) {
        this.jupyter_actions.set_cell_pos(id, pos, false);
      }
    }
    this.jupyter_actions._sync();
    setTimeout(() => {
      this.scroll("cell visible");
    }, 0);
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
        "outputs_hidden",
      );
    }
  }

  public unhide_current_input(): void {
    const cur_id = this.store.get("cur_id");
    this.jupyter_actions.set_jupyter_metadata(
      cur_id,
      "source_hidden",
      undefined,
      true,
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

  write_protect_selected_cells = (value: boolean = true) => {
    const cell_ids = this.store.get_selected_cell_ids_list();
    this.jupyter_actions.write_protect_cells(cell_ids, value);
  };

  delete_protect_selected_cells = (value: boolean = true) => {
    const cell_ids = this.store.get_selected_cell_ids_list();
    this.jupyter_actions.delete_protect_cells(cell_ids, value);
  };

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
      delta,
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
      1,
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

  public toggle_selected_outputs(property: "collapsed" | "scrolled"): void {
    this.jupyter_actions.toggle_outputs(
      this.store.get_selected_cell_ids_list(),
      property,
    );
  }

  public zoom(delta: -1 | 1): void {
    this.frame_tree_actions.change_font_size(delta, this.frame_id);
  }

  public async format_selected_cells(sync: boolean = true): Promise<void> {
    this.save_input_editor();
    this.frame_tree_actions.setFormatError("");
    try {
      this.frame_tree_actions.set_status("Formatting selected cells...");
      await this.jupyter_actions.format_cells(
        this.store.get_selected_cell_ids_list(),
        sync,
      );
    } catch (err) {
      this.frame_tree_actions.setFormatError(`${err}`, err.formatInput);
    } finally {
      this.frame_tree_actions.set_status("");
    }
  }
  public async format_all_cells(sync: boolean = true): Promise<void> {
    this.save_input_editor();
    this.frame_tree_actions.setFormatError("");
    try {
      this.frame_tree_actions.set_status("Formatting selected cells...");
      await this.jupyter_actions.format_all_cells(sync);
    } catch (err) {
      this.frame_tree_actions.setFormatError(`${err}`, err.formatInput);
    } finally {
      this.frame_tree_actions.set_status("");
    }
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

  setScrolled = ({ all, scrolled }: { all: boolean; scrolled: boolean }) => {
    const ids = all
      ? this.jupyter_actions.store.get_cell_list().toJS()
      : Object.keys(this.store.get_selected_cell_ids());
    const cells = this.jupyter_actions.store.get("cells");
    for (const id of ids) {
      const cell = cells.get(id);
      if (cell?.get("cell_type", "code") == "code") {
        this.jupyter_actions._set(
          {
            type: "cell",
            id,
            scrolled,
          },
          false,
        );
      }
    }
    this.jupyter_actions.syncdb.commit();
  };

  setExpandCollapse = ({
    target,
    expanded,
    all,
  }: {
    target: "source" | "outputs";
    expanded?: boolean;
    all?: boolean; // true = everything; false = selected
  }) => {
    const ids = all
      ? this.jupyter_actions.store.get_cell_list().toJS()
      : Object.keys(this.store.get_selected_cell_ids());

    for (const id of ids) {
      this.jupyter_actions.set_jupyter_metadata(
        id,
        `${target}_hidden`,
        !expanded,
        false,
      );
    }
    this.jupyter_actions.syncdb.commit();
  };

  private focusFirstChangedCell = (before) => {
    const store = this.jupyter_actions.store;
    const after = store.get("cells");
    const ids = store.get_cell_list();
    const id = firstChangedCell({ before, after, ids });
    if (id) {
      this.set_cur_id(id);
      this.scroll("cell visible");
      setTimeout(() => this.scroll("cell visible"), 1);
    }
  };

  undo = () => {
    const before = this.jupyter_actions.store.get("cells");
    this.jupyter_actions.syncdb.undo();
    setTimeout(() => this.focusFirstChangedCell(before), 1);
  };

  redo = () => {
    const before = this.jupyter_actions.store.get("cells");
    this.jupyter_actions.syncdb.redo();
    setTimeout(() => this.focusFirstChangedCell(before), 1);
  };
}

// This function returns the id of the first (minimal position)
// cell that changed going from before to after, or
// null if no cells changed.  An annoying subtlety is that if
// you reorder cells then *all* positions may change (to keep them
// separated and sane) and then all cells are different.  It's
// an edge case, and handling it in a more expected way would be much
// more difficult and slower, so we don't.
function firstChangedCell({ before, after, ids }): string | null {
  // before and after are immutablejs cells maps, from
  // cell id to cell description.
  if (before.equals(after)) {
    // obviously, nothing changed.
    return null;
  }
  for (const id of ids) {
    if (!before.get(id)?.equals(after.get(id))) {
      return id;
    }
  }
  return null;
}
