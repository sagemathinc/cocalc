/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Jupyter Frame Editor Actions
*/

import { delay } from "awaiting";
import { FrameTree } from "../frame-tree/types";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";
import { revealjs_slideshow_html } from "./slideshow-revealjs/nbconvert";

import {
  create_jupyter_actions,
  close_jupyter_actions,
} from "./jupyter-actions";

export interface JupyterEditorState extends CodeEditorState {
  slideshow?: {
    state?: "built" | "building" | "";
    url?: string;
  };
}

import { JupyterActions } from "../../jupyter/browser-actions";

import { NotebookFrameActions } from "./cell-notebook/actions";

export class JupyterEditorActions extends BaseActions<JupyterEditorState> {
  protected doctype: string = "none"; // actual document is managed elsewhere
  public jupyter_actions: JupyterActions;
  private frame_actions: { [id: string]: NotebookFrameActions } = {};

  _raw_default_frame_tree(): FrameTree {
    return { type: "jupyter_cell_notebook" };
  }

  _init2(): void {
    this.create_jupyter_actions();
    this.init_new_frame();
    this.init_changes_state();

    this.store.on("close-frame", async ({ id }) => {
      if (this.frame_actions[id] != null) {
        await delay(1);
        this.frame_actions[id].close();
        delete this.frame_actions[id];
      }
    });
  }

  public close(): void {
    this.close_jupyter_actions();
    super.close();
  }

  private init_new_frame(): void {
    this.store.on("new-frame", ({ id, type }) => {
      if (type !== "jupyter_cell_notebook") {
        return;
      }
      // important to do this *before* the frame is rendered,
      // since it can cause changes during creation.
      this.get_frame_actions(id);
    });

    for (const id in this._get_leaf_ids()) {
      const node = this._get_frame_node(id);
      if (node == null) return;
      const type = node.get("type");
      if (type === "jupyter_cell_notebook") {
        this.get_frame_actions(id);
      }
    }
  }

  private init_changes_state(): void {
    const syncdb = this.jupyter_actions.syncdb;
    syncdb.on("has-uncommitted-changes", (has_uncommitted_changes) =>
      this.setState({ has_uncommitted_changes })
    );
    syncdb.on("has-unsaved-changes", (has_unsaved_changes) => {
      this.setState({ has_unsaved_changes });
    });

    this.watch_for_introspect();
    this.watch_for_connection_file_change();
  }

  private watch_for_introspect(): void {
    const store = this.store;
    let introspect = store.get("introspect");
    store.on("change", () => {
      const i = store.get("introspect");
      if (i != introspect) {
        if (i != null) {
          this.show_introspect();
        } else {
          this.close_introspect();
        }
        introspect = i;
      }
    });
  }

  private watch_for_connection_file_change(): void {
    const store = this.jupyter_actions.store;
    let connection_file = store.get("connection_file");
    this.jupyter_actions.store.on("change", () => {
      const c = store.get("connection_file");
      if (c == connection_file) return;
      connection_file = c;
      const id = this._get_most_recent_shell_id("jupyter");
      if (id == null) {
        // There is no Jupyter console open right now...
        return;
      }
      // This will update the connection file
      this.shell(id, true);
    });
  }

  public focus(id?: string): void {
    const actions = this.get_frame_actions(id);
    if (actions != null) {
      actions.focus();
    } else {
      super.focus(id);
    }
  }

  public refresh(id: string): void {
    const actions = this.get_frame_actions(id);
    if (actions != null) {
      actions.refresh();
    } else {
      super.refresh(id);
    }
  }

  private create_jupyter_actions(): void {
    this.jupyter_actions = create_jupyter_actions(
      this.redux,
      this.name,
      this.path,
      this.project_id
    );
  }

  private close_jupyter_actions(): void {
    close_jupyter_actions(this.redux, this.name);
  }

  public get_frame_actions(id?: string): NotebookFrameActions | undefined {
    if (id === undefined) {
      id = this._get_active_id();
      if (id == null) throw Error("no active frame");
    }
    if (this.frame_actions[id] != null) {
      if (this.frame_actions[id].is_closed()) {
        return undefined;
      }
      return this.frame_actions[id];
    }
    const node = this._get_frame_node(id);
    if (node == null) {
      throw Error(`no frame ${id}`);
    }
    const type = node.get("type");
    if (type === "jupyter_cell_notebook") {
      return (this.frame_actions[id] = new NotebookFrameActions(this, id));
    } else {
      return;
    }
  }

  // per-session sync-aware undo
  undo(id: string): void {
    id = id; // not used yet, since only one thing that can be undone.
    this.jupyter_actions.undo();
  }

  // per-session sync-aware redo
  redo(id: string): void {
    id = id; // not used yet
    this.jupyter_actions.redo();
  }

  cut(id: string): void {
    const actions = this.get_frame_actions(id);
    actions != null ? actions.cut() : super.cut(id);
  }

  copy(id: string): void {
    const actions = this.get_frame_actions(id);
    actions != null ? actions.copy() : super.copy(id);
  }

  paste(id: string, value?: string | true): void {
    const actions = this.get_frame_actions(id);
    actions != null ? actions.paste(value) : super.paste(id, value);
  }

  print(_id): void {
    this.jupyter_actions.show_nbconvert_dialog("html");
  }

  async format(id: string): Promise<void> {
    const actions = this.get_frame_actions(id);
    actions != null ? await actions.format() : await super.format(id);
  }

  async save(explicit: boolean = true): Promise<void> {
    explicit = explicit; // not used yet -- might be used for "strip trailing whitespace"

    // Copy state from live codemirror editor into syncdb
    // since otherwise it won't be saved to disk.
    const id = this._active_id();
    const a = this.get_frame_actions(id);
    if (a != null && a.save_input_editor != null) {
      a.save_input_editor();
    }

    if (!this.jupyter_actions.syncdb.has_unsaved_changes()) return;

    // Do the save itself, using try/finally to ensure proper
    // setting of is_saving.
    try {
      this.setState({ is_saving: true });
      await this.jupyter_actions.save();
    } catch (err) {
      console.warn("save_to_disk", this.path, "ERROR", err);
      if (this._state == "closed") return;
      this.set_error(`error saving file to disk -- ${err}`);
    } finally {
      this.setState({ is_saving: false });
    }
  }

  protected async get_shell_spec(
    id: string
  ): Promise<undefined | { command: string; args: string[] }> {
    id = id; // not used
    const connection_file = this.jupyter_actions.store.get("connection_file");
    return {
      command: "jupyter",
      args: ["console", "--existing", connection_file],
    };
  }

  // Not an action, but works to make code clean
  has_format_support(id: string, available_features?): false | string {
    id = id;
    const syntax = this.jupyter_actions.store.get_kernel_syntax();
    const markdown_only = "Format selected markdown cells using prettier.";
    if (syntax == null) return markdown_only;
    if (available_features == null) return markdown_only;
    const tool = this.format_support_for_syntax(available_features, syntax);
    if (!tool) return markdown_only;
    return `Format selected code cells using "${tool}", stopping on first error; formats markdown using prettier.`;
  }

  // Uses nbconvert to create an html slideshow version of this notebook.
  // - If this is foo.ipynb, the resulting slideshow is in the file
  //   .foo.slides.html, so can reference local images, etc.
  // - Returned string is a **raw url** link to the HTML slideshow file.
  public async build_revealjs_slideshow(): Promise<void> {
    const slideshow = (this.store as any).get("slideshow");
    if (slideshow != null && slideshow.get("state") == "building") {
      return;
    }
    try {
      this.setState({ slideshow: { state: "building" } });
      this.set_status("Building slideshow: saving...", 10000);
      await this.save();
      if (this._state == "closed") return;
      this.set_status("Building slideshow: running nbconvert...", 15000);
      const url = await revealjs_slideshow_html(this.project_id, this.path);
      if (this._state == "closed") return;
      this.set_status(""); // really bad design... I need to make this like for courses...
      this.setState({ slideshow: { state: "built", url } });
    } catch (err) {
      if (this._state == "closed") return;
      this.set_error(`Error building slideshow -- ${err}`);
    }
  }

  public async build(id: string): Promise<void> {
    switch (this._get_frame_type(id)) {
      case "jupyter_slideshow_revealjs":
        this.build_revealjs_slideshow();
        break;
    }
  }

  public show_revealjs_slideshow(): void {
    this.show_focused_frame_of_type("jupyter_slideshow_revealjs");
    this.build_revealjs_slideshow();
  }

  public async jump_to_cell(
    cell_id: string,
    align: "center" | "top" = "top"
  ): Promise<void> {
    // Open or focus a notebook viewer and scroll to the given cell.
    if (this._state === "closed") return;
    const id = this.show_focused_frame_of_type("jupyter_cell_notebook");
    const actions = this.get_frame_actions(id);
    if (actions == null) return;
    actions.set_cur_id(cell_id);
    actions.scroll(align == "top" ? "cell top" : "cell visible");
    await delay(5);
    if (this._state === "closed") return;
    actions.focus();
  }

  public async show_table_of_contents(
    _id: string | undefined = undefined
  ): Promise<void> {
    const id = this.show_focused_frame_of_type(
      "jupyter_table_of_contents",
      "col",
      true,
      1 / 3
    );
    // the click to select TOC focuses the active id back on the notebook
    await delay(0);
    if (this._state === "closed") return;
    this.set_active_id(id, true);
  }

  public async guide(): Promise<void> {
    const id = this.show_focused_frame_of_type(
      "commands_guide",
      "col",
      false,
      3 / 4
    );
    // the click to select focuses the active id back on the notebook
    await delay(0);
    if (this._state === "closed") return;
    this.set_active_id(id, true);
  }

  // Either show the most recently focused introspect frame, or ceate one.
  public async show_introspect(): Promise<void> {
    this.show_recently_focused_frame_of_type("introspect", "row", false, 2 / 3);
  }

  // Close the most recently focused introspect frame, if there is one.
  public async close_introspect(): Promise<void> {
    this.close_recently_focused_frame_of_type("introspect");
  }
}

export { JupyterEditorActions as Actions };
