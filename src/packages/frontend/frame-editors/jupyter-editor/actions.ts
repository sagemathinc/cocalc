/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Jupyter Frame Editor Actions
*/

import { delay } from "awaiting";
import { syncAllComputeServers } from "@cocalc/frontend/compute/sync-all";
import { markdown_to_slate } from "@cocalc/frontend/editors/slate/markdown-to-slate";
import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { toFragmentId } from "@cocalc/frontend/jupyter/heading-tag";
import { open_new_tab } from "@cocalc/frontend/misc";
import type { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
import { NotebookFrameActions } from "./cell-notebook/actions";
import {
  close_jupyter_actions,
  create_jupyter_actions,
} from "./jupyter-actions";
import { revealjs_slideshow_html } from "./slideshow-revealjs/nbconvert";

export interface JupyterEditorState extends CodeEditorState {
  slideshow?: {
    state?: "built" | "building" | "";
    url?: string;
  };
}

export class JupyterEditorActions extends BaseActions<JupyterEditorState> {
  protected doctype: string = "none"; // actual document is managed elsewhere
  public jupyter_actions: JupyterActions;
  private frame_actions: { [id: string]: NotebookFrameActions } = {};

  _raw_default_frame_tree(): FrameTree {
    return { type: "jupyter_cell_notebook" };
  }

  protected _init_syncstring(): void {
    this.create_jupyter_actions();
    this._syncstring = this.jupyter_actions.syncdb;
    super._init_syncstring();
  }

  _init2(): void {
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
      this.setState({ has_uncommitted_changes }),
    );
    this.jupyter_actions.store.on("has-unsaved-changes", (has_unsaved_changes) => {
      this.setState({ has_unsaved_changes });
    });

    this.watchFrameEditorStore();
    this.watchJupyterStore();
  }

  private watchFrameEditorStore = (): void => {
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
  };

  private watchJupyterStore = (): void => {
    const store = this.jupyter_actions.store;
    store.on("change", () => {
      // sync read only state -- source of true is jupyter_actions.store.get('read_only')
      const read_only = store.get("read_only");
      if (read_only != this.store.get("read_only")) {
        this.setState({ read_only });
      }
    });
  };

  public focus(id?: string): void {
    const actions = this.get_frame_actions(id);
    if (actions != null) {
      actions.focus();
    } else {
      super.focus(id);
    }
  }

  public blur(id?: string): void {
    const actions = this.get_frame_actions(id);
    if (actions != null) {
      actions.blur?.();
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
      this.project_id,
    );
    this.jupyter_actions.jupyterEditorActions = this;
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
    const actions = this.get_frame_actions(id);
    if (actions != null) {
      // this properly moves the selection, so prefer if available
      actions.undo();
    } else {
      this.jupyter_actions.undo();
    }
  }

  // per-session sync-aware redo
  redo(id: string): void {
    const actions = this.get_frame_actions(id);
    if (actions != null) {
      actions.redo();
    } else {
      this.jupyter_actions.redo();
    }
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
    this.jupyter_actions.show_nbconvert_dialog("cocalc-html");
  }

  async format(id: string): Promise<void> {
    const actions = this.get_frame_actions(id);
    if (actions != null) {
      try {
        await actions.format();
      } catch (err) {
        this.setFormatError(`${err}`);
      }
    } else {
      await super.format(id);
    }
  }

  halt_jupyter(): void {
    this.jupyter_actions.confirm_close_and_halt();
  }

  async save(explicit: boolean = true): Promise<void> {
    if (this._state == "closed") return;
    explicit = explicit; // not used yet -- might be used for "strip trailing whitespace"

    // Copy state from live codemirror editor into syncdb
    // since otherwise it won't be saved to disk.
    const id = this._active_id();
    const a = this.get_frame_actions(id);
    if (a != null && a.save_input_editor != null) {
      a.save_input_editor();
    }

    if (!this.jupyter_actions.syncdb?.has_unsaved_changes()) {
      return;
    }

    // Do the save itself, using try/finally to ensure proper
    // setting of is_saving.
    try {
      this.setState({ is_saving: true });
      await this.jupyter_actions.save();
      if (this._state == "closed") {
        return;
      }
      syncAllComputeServers(this.project_id);
    } catch (err) {
      console.warn("save_to_disk", this.path, "ERROR", err);
      if (this._state == "closed") {
        return;
      }
      this.set_error(`error saving file to disk -- ${err}`);
    } finally {
      this.setState({ is_saving: false });
    }
  }

  protected async get_shell_spec(
    _id: string,
  ): Promise<{ command: string; args: string[] }> {
    const connectionFile = await this.jupyter_actions.getConnectionFile();
    return {
      command: "jupyter",
      args: ["console", "--existing", connectionFile],
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
    align: "center" | "top" = "center",
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
    _id: string | undefined = undefined,
  ): Promise<void> {
    const id = this.show_focused_frame_of_type(
      "jupyter_table_of_contents",
      "col",
      true,
      1 / 3,
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
      3 / 4,
    );
    // the click to select focuses the active id back on the notebook
    await delay(0);
    if (this._state === "closed") return;
    this.set_active_id(id, true);
  }

  // Either show the most recently focused introspect frame, or ceate one.
  public async show_introspect(): Promise<void> {
    this.show_recently_focused_frame_of_type("introspect", "col", false, 2 / 3);
  }

  // Close the most recently focused introspect frame, if there is one.
  public async close_introspect(): Promise<void> {
    this.close_recently_focused_frame_of_type("introspect");
  }

  async gotoFragment(fragmentId: FragmentId) {
    if (fragmentId.chat) {
      // deal with side chat in base class
      await super.gotoFragment(fragmentId);
    }
    const frameId = await this.waitUntilFrameReady({
      type: "jupyter_cell_notebook",
      syncdoc: this.jupyter_actions.syncdb,
    });
    if (!frameId) return;
    const { id, anchor } = fragmentId;

    const goto = (cellId: string) => {
      const actions = this.get_frame_actions(frameId);
      if (actions == null) return;
      actions.set_cur_id(cellId);
      actions.scroll("cell top");
    };

    if (id) {
      goto(id);
      return;
    }

    if (anchor) {
      // In html, the anchor refers to the unique element in the global document with
      // id equal to that.
      // There may be an actual element in markdown of some cell with the id equal to
      // anchor, which would have to be some HTML, since markdown doesn't have a notion
      // of id.
      // Most likely there is a markdown section heading that programatically gets
      // an id (see src/packages/frontend/jupyter/heading-tag.tsx).  Of course, our
      // notebook cells need not be in the DOM at all due to virtualization, so we
      // parrse and search the actual cell data directly.
      const cells = this.jupyter_actions.store.get("cells");
      for (const cellId of this.jupyter_actions.store.get("cell_list")) {
        const cell = cells.get(cellId);
        if (cell?.get("cell_type") == "markdown") {
          const input = cell.get("input");
          const slate = markdown_to_slate(input);
          for (const block of slate) {
            if (block["type"] == "heading") {
              if (toFragmentId(block["children"] ?? []) == anchor) {
                // found it!
                goto(cellId);
                return;
              }
            }
          }
          // We didn't find it as a heading, so now check for id's of inline or
          // block level html.  Here we're just going to do something that
          // isn't always right, but is easy and may result in false positive
          // (or negative).  Also, note that if the markdown block is really
          // large the actual tag with the given id might not be visible.
          // Another significant issue related to all this is that we sanitize
          // away any ids from the html anyways, so there aren't ids in the DOM
          // from html blocks or inline html!
          if (
            input.includes(`id=${anchor}`) ||
            input.includes(`id="${anchor}"`) ||
            input.includes(`id='${anchor}'`)
          ) {
            goto(cellId);
            return;
          }
        }
      }
      return;
    }
  }

  languageModelGetText(
    frameId: string,
    scope: "selection" | "cell" | "all" = "all",
  ): string {
    const actions = this.frame_actions[frameId];
    if (!actions) return ""; // no frames (?)
    if (scope == "selection") {
      const selected_cells = actions.store.get_selected_cell_ids_list();
      if (selected_cells != null && selected_cells.length > 1) {
        // get all content of all selected cells.
        let s = "";
        for (const id of selected_cells) {
          if (this.jupyter_actions.store.get_cell_type(id) == "code") {
            s += "\n" + actions.get_cell_input(id);
          }
        }
        return s;
      }
    }
    if (scope == "all") {
      let s = "";
      for (const id of this.jupyter_actions.store.get("cell_list") ?? []) {
        if (this.jupyter_actions.store.get_cell_type(id) == "code") {
          s += "\n" + actions.get_cell_input(id);
        }
      }
      return s;
    }

    // current cell or selection in it:
    const cur_id = actions.store.get("cur_id");
    if (scope == "selection") {
      return actions.getCellSelection(cur_id);
    }
    if (scope == "cell") {
      const cur = actions.get_cell_input(cur_id)?.trim();
      if (cur) {
        return cur;
      }
      // previous code -- TODO: one problem is that this will get truncated at the
      // bottom instead of top, which is bad if it is really big.
      let s = "";
      for (const id of this.jupyter_actions.store.get("cell_list") ?? []) {
        if (id == cur_id) {
          // done!
          return s;
        }
        if (this.jupyter_actions.store.get_cell_type(id) == "code") {
          s += "\n" + actions.get_cell_input(id);
        }
      }
      return s;
    }
    return "";
  }

  languageModelGetLanguage(): string {
    return (
      this.jupyter_actions.store?.getIn(["kernel_info", "language"]) ?? "py"
    );
  }

  // used to add extra context like ", which is a Jupyter notebook using the Python 3 kernel"
  languageModelExtraFileInfo(): string {
    const kernel =
      this.jupyter_actions.store.getIn(["kernel_info", "display_name"]) ?? "";
    return `Jupyter notebook using the ${kernel} kernel`;
  }

  help(): void {
    open_new_tab("https://doc.cocalc.com/jupyter.html");
  }

  about = () => {
    this.jupyter_actions.show_about();
  };

  chatgptCodeDescription(): string {
    const kernel =
      this.jupyter_actions.store.getIn(["kernel_info", "display_name"]) ?? "";
    return `Jupyter notebook using the ${kernel} kernel`;
  }

  languageModelGetScopes() {
    return new Set<"selection" | "cell">(["selection", "cell"]);
  }

  compute_server() {
    // this is here just so the dropdown gets enabled
  }

  gotoUser(account_id: string, frameId?: string) {
    const cursors = this.jupyter_actions.syncdb
      .get_cursors({ maxAge: 0, excludeSelf: "never" })
      ?.toJS();
    const locs = cursors?.[account_id]?.locs;
    if (locs == null) {
      return; // no info
    }
    for (const loc of locs) {
      if (loc.id != null) {
        const frameActions = this.get_frame_actions(frameId);
        if (frameActions != null) {
          frameActions.set_cur_id(loc.id);
          frameActions.scroll("cell visible");
          return;
        }
      }
    }
  }

  getSearchIndexData = () => {
    const cells = this.jupyter_actions.store.get("cells");
    if (cells == null) {
      return {};
    }
    const data: { [id: string]: string } = {};
    for (const [id, cell] of cells) {
      let content = cell.get("input")?.trim();
      if (!content) {
        continue;
      }
      data[id] = content;
    }
    return { data, fragmentKey: "id", reduxName: this.jupyter_actions.name };
  };
}

export { JupyterEditorActions as Actions };
