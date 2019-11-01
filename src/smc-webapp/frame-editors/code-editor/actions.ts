/*
Code Editor Actions
*/

const WIKI_HELP_URL = "https://github.com/sagemathinc/cocalc/wiki/";
const SAVE_ERROR = "Error saving file to disk. ";
const SAVE_WORKAROUND =
  "Ensure your network connection is solid. If this problem persists, you might need to close and open this file, restart this project in project settings, or contact support (help@cocalc.com)";

import { fromJS, List, Map, Set } from "immutable";
import { debounce } from "underscore";
import { delay } from "awaiting";
import {
  get_default_font_size,
  log_error,
  public_get_text_file,
  prettier,
  syncstring,
  syncdb2,
  syncstring2
} from "../generic/client";

import { SyncDB } from "smc-util/sync/editor/db";
import { SyncString } from "smc-util/sync/editor/string";

import { aux_file } from "../frame-tree/util";
import { callback_opts, once } from "smc-util/async-utils";
import {
  endswith,
  filename_extension,
  history_path,
  len,
  uuid
} from "smc-util/misc2";
import { print_code } from "../frame-tree/print-code";
import {
  ConnectionStatus,
  FrameDirection,
  FrameTree,
  ImmutableFrameTree,
  SetMap,
  ErrorStyles
} from "../frame-tree/types";
import { SettingsObject } from "../settings/types";
import { misspelled_words } from "./spell-check";
import * as cm_doc_cache from "./doc";
import { test_line } from "./simulate_typing";
import { Rendered } from "../../app-framework";
import * as CodeMirror from "codemirror";
import "../generic/codemirror-plugins";
import * as tree_ops from "../frame-tree/tree-ops";
import { Actions as BaseActions, Store } from "../../app-framework";
import { createTypedMap, TypedMap } from "../../app-framework/TypedMap";

import { Terminal } from "../terminal-editor/connected-terminal";
import { TerminalManager } from "../terminal-editor/terminal-manager";
import { CodeEditorManager, CodeEditor } from "./code-editor-manager";

import { AvailableFeatures } from "../../project_configuration";
import {
  ext2parser,
  parser2tool,
  format_parser_for_extension
} from "smc-util/code-formatter";

const copypaste = require("smc-webapp/copy-paste-buffer");
const { open_new_tab } = require("smc-webapp/misc_page");

import { Options as FormatterOptions } from "smc-project/formatters/prettier";
import {
  Parser as FormatterParser,
  Exts as FormatterExts
} from "smc-util/code-formatter";
import { SHELLS } from "./editor";

interface gutterMarkerParams {
  line: number;
  gutter_id: string;
  component?: Rendered;
  handle?: string;
}

const GutterMarker = createTypedMap<gutterMarkerParams>();
type GutterMarkers = Map<string, TypedMap<gutterMarkerParams>>;

interface LocalViewParams {
  frame_tree?: Map<string, any>; // ImmutableFrameTree;
  active_id: string;
  full_id: string;
  editor_state?: unknown;
  version?: number;
  font_size?: number;
}

type LocalViewState = TypedMap<LocalViewParams>;

export interface CodeEditorState {
  project_id: string;
  path: string;
  is_public: boolean;
  local_view_state: any; // Generic use of Actions below makes this entirely befuddling...
  reload: Map<string, any>;
  resize: number;
  misspelled_words: Set<string>;
  has_unsaved_changes: boolean;
  has_uncommitted_changes: boolean;
  is_saving: boolean;
  is_loaded: boolean;
  gutter_markers: GutterMarkers;
  cursors: Map<any, any>;
  value?: string;
  load_time_estimate: number;
  error: string;
  errorstyle?: ErrorStyles;
  status: any;
  read_only: boolean;
  settings: Map<string, any>; // settings specific to this file (but **not** this user or browser), e.g., spell check language.
  complete: Map<string, any>;
  derived_file_types: Set<string>;
  visible: boolean;
}

export class Actions<
  T extends CodeEditorState = CodeEditorState
> extends BaseActions<T | CodeEditorState> {
  protected _state: "closed" | undefined;
  protected _syncstring: SyncString;
  protected _syncdb?: SyncDB; /* auxiliary file optionally used for shared project configuration (e.g., for latex) */
  private _syncstring_init: boolean = false; // true once init has happened.
  private _syncdb_init: boolean = false; // true once init has happened
  protected _key_handler: any;
  protected _cm: { [key: string]: CodeMirror.Editor } = {};

  private terminals: TerminalManager<CodeEditorState>;
  private code_editors: CodeEditorManager<CodeEditorState>;

  protected doctype: string = "syncstring";
  protected primary_keys: string[] = [];
  protected string_cols: string[] = [];

  public project_id: string;
  public path: string;
  public store: Store<T>;
  public is_public: boolean;

  private _save_local_view_state: () => void;
  private _cm_selections: any;
  private _update_misspelled_words_last_hash: any;
  private _active_id_history: string[] = [];
  private _spellcheck_is_supported: boolean = false;

  _init(
    project_id: string,
    path: string,
    is_public: boolean,
    store: any
  ): void {
    this._save_local_view_state = debounce(
      () => this.__save_local_view_state(),
      1500
    );

    this.project_id = project_id;
    this.path = path;
    this.store = store;
    this.is_public = is_public;
    this.terminals = new TerminalManager<CodeEditorState>(
      (this as unknown) as Actions<CodeEditorState>
    );
    this.code_editors = new CodeEditorManager<CodeEditorState>(
      (this as unknown) as Actions<CodeEditorState>
    );

    this.set_resize = this.set_resize.bind(this);
    window.addEventListener("resize", this.set_resize);

    if (is_public) {
      this._init_value();
    } else {
      this._init_syncstring();
    }

    this.setState({
      value: "Loading...",
      is_public,
      local_view_state: this._load_local_view_state(),
      reload: Map(),
      resize: 0,
      misspelled_words: Set(),
      has_unsaved_changes: false,
      has_uncommitted_changes: false,
      is_saving: false,
      gutter_markers: Map(),
      cursors: Map(),
      settings: fromJS(this._default_settings()),
      complete: Map()
    });

    if ((this as any)._init2) {
      (this as any)._init2();
    }
  }

  // Init setting of value exactly once based on
  // reading file from disk via public api.
  // ONLY used for public files.
  async _init_value(): Promise<void> {
    if (!this.is_public) {
      return;
    }
    // Get by loading from backend as a public file
    this.setState({ is_loaded: false });
    try {
      const data: string = await public_get_text_file({
        project_id: this.project_id,
        path: this.path
      });
      this.setState({ value: data });
    } catch (err) {
      this.set_error(`Error loading -- ${err}`);
    } finally {
      this.setState({ is_loaded: true });
    }
  }

  // Init setting of value whenever syncstring changes -- only used in derived classes
  protected _init_syncstring_value(): void {
    this._syncstring.on("change", () => {
      if (!this._syncstring) {
        // edge case where actions closed but this event was still triggered.
        return;
      }
      this.setState({ value: this._syncstring.to_str() });
    });
  }

  // Init spellchecking whenever syncstring saves -- only used in derived classes, where
  // spelling makes sense...
  protected _init_spellcheck(): void {
    this._spellcheck_is_supported = true;
    this._syncstring.on("save-to-disk", time =>
      this.update_misspelled_words(time)
    );
  }

  protected _init_syncstring(): void {
    if (this.doctype == "none") {
      this._syncstring = <SyncString>syncstring({
        project_id: this.project_id,
        path: this.path,
        cursors: true,
        before_change_hook: () => this.set_syncstring_to_codemirror(),
        after_change_hook: () => this.set_codemirror_to_syncstring(),
        fake: true,
        patch_interval: 500
      });
    } else if (this.doctype == "syncstring") {
      this._syncstring = syncstring2({
        project_id: this.project_id,
        path: this.path,
        cursors: true
      });
    } else if (this.doctype == "syncdb") {
      if (
        this.primary_keys == null ||
        this.primary_keys.length == null ||
        this.primary_keys.length <= 0
      ) {
        throw Error("primary_keys must be array of positive length");
      }
      this._syncstring = syncdb2({
        project_id: this.project_id,
        path: this.path,
        primary_keys: this.primary_keys,
        string_cols: this.string_cols
      });
    } else {
      throw Error(`invalid doctype="${this.doctype}"`);
    }

    this._syncstring.once("ready", err => {
      if (err) {
        this.set_error(
          `Fatal error opening file -- ${err}\nFix this, then try opening the file again.`
        );
        return;
      }
      if (!this._syncstring || this._state == "closed") {
        // the doc could perhaps be closed by the time this init is fired, in which case just bail -- no point in trying to initialize anything.
        return;
      }
      this._syncstring_init = true;
      this._syncstring_metadata();
      this._init_settings();
      if (
        !this.store.get("is_loaded") &&
        (this._syncdb === undefined || this._syncdb_init)
      ) {
        this.setState({ is_loaded: true });
      }

      this._syncstring.on(
        "metadata-change",
        this._syncstring_metadata.bind(this)
      );
      this._syncstring.on(
        "cursor_activity",
        this._syncstring_cursor_activity.bind(this)
      );
    });

    this._syncstring.on(
      "before-change",
      this.set_syncstring_to_codemirror.bind(this)
    );
    this._syncstring.on(
      "after-change",
      this.set_codemirror_to_syncstring.bind(this)
    );
    this._syncstring.once("load-time-estimate", est => {
      return this.setState({ load_time_estimate: est });
    });

    this._syncstring.on("save-to-disk", () => {
      // incremenet save_to_disk counter, so that react components can
      // react to save_to_disk event happening.
      this.set_reload("save_to_disk");
    });

    this._syncstring.once("error", err => {
      this.set_error(
        `Fatal error opening ${this.path} -- ${err}\nFix this, then try opening the file again.`
      );
    });

    this._syncstring.once("closed", () => {
      this.close();
    });

    this._syncstring.on("has-uncommitted-changes", has_uncommitted_changes =>
      this.setState({ has_uncommitted_changes })
    );

    this._syncstring.on("has-unsaved-changes", has_unsaved_changes => {
      this.setState({ has_unsaved_changes });
    });
  }

  // This is currently NOT used in this base class.  It's used in other
  // editors to store shared configuration or other information.  E.g., it's
  // used by the latex editor to store the build command, master file, etc.
  _init_syncdb(
    primary_keys: string[],
    string_cols?: string[],
    path?: string
  ): void {
    if (primary_keys.length <= 0) {
      throw Error("primary_keys must be array of positive length");
    }
    const aux = aux_file(path || this.path, "syncdb");
    this._syncdb = syncdb2({
      project_id: this.project_id,
      path: aux,
      primary_keys,
      string_cols,
      file_use_interval: 0 // disable file use,, since syncdb is an auxiliary file
    });
    this._syncdb.once("error", err => {
      this.set_error(
        `Fatal error opening config "${aux}" -- ${err}.\nFix this, then try opening the file again.`
      );
    });

    this._syncdb.once("closed", () => {
      this.close();
    });

    this._syncdb.once("ready", async () => {
      // TODO -- there is a race condition setting up tables; throwing in this delay makes it work.
      // await delay(1000);
      this._syncdb_init = true;
      if (
        !this.store.get("is_loaded") &&
        (this._syncstring === undefined || this._syncstring_init)
      ) {
        this.setState({ is_loaded: true });
      }
    });
  }

  // Reload the document.  This is used mainly for *public* viewing of
  // a file.
  reload(id: string): void {
    if (this._terminal_command(id, "reload")) {
      return;
    }
    if (!this.store.get("is_loaded")) {
      // currently in the process of loading
      return;
    }
    // this sets is_loaded to false... loads, then sets is_loaded to true.
    this._init_value();
  }

  // Update the reload key in the store, which may *trigger* UI to
  // update itself as a result (e.g. a pdf preview or markdown preview pane).
  set_reload(type: string, hash?: number): void {
    const reload: Map<string, any> = this.store.get("reload", Map());
    if (!reload) {
      return;
    }
    if (hash === undefined) {
      if (!this._syncstring) {
        return;
      }
      hash = this._syncstring.hash_of_saved_version();
    }
    this.setState({
      reload: reload.set(type, hash)
    });
  }

  // Call this whenever the frames are moved, so that content can potentially
  // get updated due to resizing.  E.g., this ensures that codemirror editors
  // are properly updated (by calling cm.refresh()), so they don't look broken.
  // This is called when the window is resized.
  // It is only called when the editor is visible, and is always called
  // when it is shown.
  set_resize(): void {
    if (!this.store.get("visible")) return;
    this.setState({
      resize: this.store.get("resize", 0) + 1
    });
  }

  /* Set the value of the CodeMirror editor document -- assumes it
     has been initialized and loaded (e.g., the react component is
     mounted).  If not, throws an exception (which is fine -- this is
     used for testing only).
    */
  set_cm_value(value: string): void {
    const cm = this._get_cm();
    if (!cm) {
      throw Error("some codemirror MUST be defined!");
    }
    cm.setValue(value);
  }

  public close(): void {
    if (this._state == "closed") {
      return;
    }
    window.removeEventListener("resize", this.set_resize);
    this._state = "closed";
    this.__save_local_view_state();
    // switch back to non-debounced version, in case called after this point.
    this._save_local_view_state = this.__save_local_view_state;
    if (this._key_handler != null) {
      (this.redux.getActions("page") as any).erase_active_key_handler(
        this._key_handler
      );
      delete this._key_handler;
    }
    this.close_syncstring();
    this.close_syncdb();
    // Remove underlying codemirror doc from cache.
    cm_doc_cache.close(this.project_id, this.path);
    // Free up any allocated terminals.
    this.terminals.close();
    // Free up stuff related to code editors with different path
    this.code_editors.close();
  }

  private async close_syncstring(): Promise<void> {
    const s = this._syncstring;
    if (s == null) return;
    if (s.get_state() === "ready") {
      // syncstring was initialized; be sure not to
      // lose the very last change user made!
      this.set_syncstring_to_codemirror();
    }
    delete this._syncstring;
    s.close(); // this should save synctables in syncstring
  }

  private async close_syncdb(): Promise<void> {
    if (this._syncdb == null) return;
    const s = this._syncdb;
    delete this._syncdb;
    s.close();
  }

  __save_local_view_state(): void {
    if (!this.store.get("local_view_state")) return;
    localStorage[this.name] = JSON.stringify(
      this.store.get("local_view_state")
    );
  }

  _load_local_view_state(): LocalViewState {
    let local_view_state;
    const x = localStorage[this.name];
    if (x != null) {
      local_view_state = fromJS(JSON.parse(x));
    }
    if (local_view_state == null) {
      local_view_state = Map();
    }

    if (!local_view_state.has("version")) {
      // may use to deprecate in case we change format.
      local_view_state = local_view_state.set("version", 1);
    }

    if (!local_view_state.has("editor_state")) {
      local_view_state = local_view_state.set("editor_state", Map());
    }

    if (!local_view_state.has("font_size")) {
      local_view_state = local_view_state.set(
        "font_size",
        get_default_font_size()
      );
    }

    let frame_tree = local_view_state.get("frame_tree");
    if (frame_tree == null) {
      frame_tree = this._default_frame_tree();
    } else {
      frame_tree = tree_ops.assign_ids(frame_tree);
      frame_tree = tree_ops.ensure_ids_are_unique(frame_tree);
    }
    local_view_state = local_view_state.set("frame_tree", frame_tree);

    const active_id = local_view_state.get("active_id");
    if (active_id == null || !tree_ops.is_leaf_id(frame_tree, active_id)) {
      local_view_state = local_view_state.set(
        "active_id",
        tree_ops.get_some_leaf_id(frame_tree)
      );
    }

    return local_view_state;
  }

  reset_local_view_state(): void {
    delete localStorage[this.name];
    this.setState({ local_view_state: this._load_local_view_state() });
    this.reset_frame_tree();
  }

  set_local_view_state(obj: LocalViewParams): void {
    if (this._state === "closed") {
      return;
    }
    // Set local state related to what we see/search for/etc.
    let local = this.store.get("local_view_state");
    for (let key in obj) {
      const coerced_key = key as keyof LocalViewParams;
      const value = obj[coerced_key];
      local = local.set(coerced_key, fromJS(value));
    }
    this.setState({
      local_view_state: local
    });
    this._save_local_view_state();
  }

  _is_leaf_id(id: string): boolean {
    return tree_ops.is_leaf_id(
      this.store.getIn(["local_view_state", "frame_tree"]) as any,
      id
    );
  }

  // removed : void return decl due to codemirror highlighting issue -- https://github.com/sagemathinc/cocalc/issues/3545
  _assert_is_leaf_id(id: string, caller: string) {
    if (!this._is_leaf_id(id)) {
      throw Error(`${caller} -- no leaf with id ${id}`);
    }
  }

  // Set which frame is active (unless setting is blocked).
  // Raises an exception if try to set an active_id, and there is no
  // leaf with that id.  If ignore_if_missing is true, then don't raise exception.
  // If a different frame is maximized, switch out of maximized mode.
  public set_active_id(active_id: string, ignore_if_missing?: boolean): void {
    // Set the active_id, if necessary.
    const local = this.store.get("local_view_state");
    if (local.get("active_id") === active_id) {
      // already set -- nothing more to do
      return;
    }

    if (!this._is_leaf_id(active_id)) {
      if (ignore_if_missing) return;
      throw Error(`set_active_id - no leaf with id "${active_id}"`);
    }

    // record which id is being made active.
    this._active_id_history.push(active_id);
    if (this._active_id_history.length > 100) {
      this._active_id_history = this._active_id_history.slice(
        this._active_id_history.length - 100
      );
    }

    // We delete full_id to de-maximize if in full screen mode,
    // so the active_id frame is visible.
    this.setState({
      local_view_state: local.set("active_id", active_id).delete("full_id")
    });
    this._save_local_view_state();
    this.focus(active_id);
  }

  // Make whatever frame is defined and was most recently active
  // be the current active frame.
  make_most_recent_frame_active(): void {
    let id: string | undefined = this._get_most_recent_active_frame_id();
    if (id) {
      this.set_active_id(id);
      return;
    }
    id = tree_ops.get_some_leaf_id(this._get_tree());
    if (id) {
      // must be true, since tree is always nontrivial!
      this.set_active_id(id);
    }
  }

  // Gets active_id.  the active_id **should** always
  // be defined, but if for some reason it is not, then
  // this function sets it and returns that.
  _get_active_id(): string {
    let id: string | undefined = this.store.getIn([
      "local_view_state",
      "active_id"
    ]);
    if (!id) {
      id = tree_ops.get_some_leaf_id(this._get_tree());
      this.set_active_id(id);
    }
    return id;
  }

  _get_tree(): ImmutableFrameTree {
    let tree: ImmutableFrameTree | undefined = this.store.getIn([
      "local_view_state",
      "frame_tree"
    ]);
    if (tree == null) {
      // Worrisome rare race condition when frame_tree not yet initialized.
      // See https://github.com/sagemathinc/cocalc/issues/3756
      const local_view_state = this._load_local_view_state();
      this.setState({ local_view_state });
      tree = local_view_state.get("frame_tree") as ImmutableFrameTree;
    }
    return tree;
  }

  _get_leaf_ids(): SetMap {
    return tree_ops.get_leaf_ids(this._get_tree());
  }

  private get_parent_id(id): string | undefined {
    return tree_ops.get_parent_id(this._get_tree(), id);
  }

  _tree_op(op, ...args): void {
    let local = this.store.get("local_view_state");
    if (local == null) {
      return;
    }
    const t0 = local.get("frame_tree");
    if (t0 === undefined) {
      return;
    }
    const f: Function | undefined = tree_ops[op];
    if (f === undefined) {
      throw Error(`unknown tree op '${op}'`);
    }
    const t1 = f(t0, ...args);
    if (t1 !== t0) {
      if (op === "delete_node") {
        if (!tree_ops.is_leaf_id(t1, local.get("full_id"))) {
          local = local.delete("full_id");
        }
      }
      this.setState({ local_view_state: local.set("frame_tree", t1) });
      this._save_local_view_state();
    }
  }

  _default_frame_tree(): Map<string, any> {
    let frame_tree = fromJS(this._raw_default_frame_tree());
    frame_tree = tree_ops.assign_ids(frame_tree);
    frame_tree = tree_ops.ensure_ids_are_unique(frame_tree);
    return frame_tree;
  }

  // overload this in derived classes to specify the default layout.
  _raw_default_frame_tree(): FrameTree {
    return { type: "cm" };
  }

  // Do a set operation on the frame tree. This is used
  // to change a field in some node in the tree.  Typically
  // obj is of the form {id:'blah', foo:'bar'}, which sets
  // node.foo = 'bar' in the tree node with id 'blah'.
  public set_frame_tree(obj: object): void {
    this._tree_op("set", obj);
  }

  // Same as set_frame_tree, but all fields except id
  // have "data-" prepended to them.  Use this for custom
  // data, so it doesn't interfere with generic data
  // like 'type' or 'font_size'.
  public set_frame_data(obj: object): void {
    const x: any = obj["id"] != null ? { id: obj["id"] } : {};
    for (let key in obj) {
      if (key === "id") continue;
      x["data-" + key] = obj[key];
    }
    this.set_frame_tree(x);
  }

  public _get_frame_data(id: string, key: string, def?: any): any {
    const node = this._get_frame_node(id);
    if (node == null) {
      return;
    }
    return node.get("data-" + key, def);
  }

  // Reset the frame tree layout to the default.
  reset_frame_tree(): void {
    let local = this.store.get("local_view_state");
    // Set the frame tree to a new default frame tree.
    const tree = this._default_frame_tree();
    local = local.set("frame_tree", tree);
    // Also make some id active, since existing active_id is no longer valid.
    local = local.set("active_id", tree_ops.get_some_leaf_id(tree));
    // Update state, so visible to UI.
    this.setState({ local_view_state: local });
    // And save this new state to localStorage.
    this._save_local_view_state();
    // Emit new-frame events
    for (let id in this._get_leaf_ids()) {
      const leaf = this._get_frame_node(id);
      if (leaf != null) {
        const type = leaf.get("type");
        this.store.emit("new-frame", { id, type });
      }
    }
  }

  set_frame_tree_leafs(obj): void {
    this._tree_op("set_leafs", obj);
  }

  // Set the type of the given node, e.g., 'cm', 'markdown', etc.
  // NOTE: This is only meant to be used in derived classes right now.
  set_frame_type(id: string, type: string): void {
    // save what is currently the most recent frame of this type.
    const prev_id = this._get_most_recent_active_frame_id_of_type(type);

    // default path
    let path = this.path;

    this.set_frame_tree({ id, type, path });

    if (this._cm[id] && type != "cm") {
      // Make sure to clear cm cache in case switching type away,
      // in case the component unmount doesn't do this.
      delete (this._cm[id] as any).cocalc_actions;
      delete this._cm[id];
    }

    if (type != "terminal") {
      this.terminals.close_terminal(id);
    }

    if (type != "cm") {
      this.code_editors.close_code_editor(id);
    }

    // Reset the font size for the frame based on recent
    // pref for this type.
    let font_size: number = 0;
    if (prev_id) {
      const node = tree_ops.get_node(this._get_tree(), prev_id);
      if (node) {
        font_size = node.get("font_size");
      }
    }
    if (!font_size) {
      font_size = get_default_font_size();
    }
    this.set_font_size(id, font_size);

    this.store.emit("new-frame", { id, type });
  }

  // raises an exception if the node does not exist; always
  // call _has_frame_node first.
  public _get_frame_node(id: string): Map<string, any> | undefined {
    return tree_ops.get_node(this._get_tree(), id);
  }

  _get_frame_type(id: string): string | undefined {
    const node = this._get_frame_node(id);
    if (node == null) {
      return;
    }
    return node.get("type");
  }

  _tree_is_single_leaf(): boolean {
    return tree_ops.is_leaf(this._get_tree());
  }

  // Delete the frame with given id.
  // If this is the active frame, then the new active frame becomes whichever
  // frame still exists that was most recently active before this frame.
  close_frame(id: string): void {
    if (this._tree_is_single_leaf()) {
      if (endswith(this.path, ".term")) {
        // TODO: sort of ugly special case of terminal -- no-op
        return;
      }
      // closing the only node, so reset to default
      this.reset_local_view_state();
      return;
    }
    const node = this._get_frame_node(id);
    if (node == null) return; // does not exist.
    const type = node.get("type");
    this._tree_op("delete_node", id);
    this.save_editor_state(id);
    if (this._cm_selections != null) {
      delete this._cm_selections[id];
    }
    if (this._cm[id] !== undefined) {
      delete (this._cm[id] as any).cocalc_actions;
      delete this._cm[id];
    }
    this.terminals.close_terminal(id);
    this.code_editors.close_code_editor(id);
    this.close_frame_hook(id, type);

    // if id is the current active_id, change to most recent one.
    if (id === this.store.getIn(["local_view_state", "active_id"])) {
      this.make_most_recent_frame_active();
    }
  }

  close_frame_hook(id: string, type: string): void {
    // overload in derived class...
    id = id;
    type = type;
  }

  // Returns id of new frame, if a frame is created.
  public split_frame(
    direction: FrameDirection,
    id?: string, // id of frame being split (uses active_id by default)
    type?: string, // type of new frame
    extra?: object, // set this data in the new frame immediately.
    first?: boolean, // if true, new frame is left or top instead of right or bottom.
    no_focus?: boolean // do not change active frame
  ): string | undefined {
    if (!id) {
      id = this.store.getIn(["local_view_state", "active_id"]);
      if (!id) return;
    }
    const before = this._get_leaf_ids();
    this._tree_op("split_leaf", id, direction, type, extra, first);
    const after = this._get_leaf_ids();
    for (let new_id in after) {
      if (!before[new_id]) {
        this.copy_editor_state(id, new_id);
        if (!no_focus) {
          this.set_active_id(new_id);
        }
        // Emit new-frame event so other code can handle or initialize
        // creation of a new frame further.
        if (type === undefined) {
          const node = this._get_frame_node(new_id);
          if (node != null) {
            type = node.get("type");
          }
        }
        this.store.emit("new-frame", {
          id: new_id,
          type
        });

        return new_id;
      }
    }
    throw Error("BUG -- no new frame created");
  }

  // Set the frame with given id to be full (so only it is displayed).
  set_frame_full(id: string): void {
    this._assert_is_leaf_id(id, "set_frame_full");
    let local = this.store.get("local_view_state");
    local = local.set("full_id", id);
    local = local.set("active_id", id);
    this.setState({ local_view_state: local });
    this._save_local_view_state();
  }

  unset_frame_full(): void {
    let local_view_state = this.store.get("local_view_state");
    if (local_view_state == null || !local_view_state.get("full_id")) return;
    local_view_state = local_view_state.delete("full_id");
    this.setState({ local_view_state });
    this._save_local_view_state();
  }

  // Save some arbitrary state information associated to a given
  // frame.  This is saved in localStorage (in the local_view_state)
  // and deleted when that frame is closed.  It gets converted to
  // immutable.js before storing.  For example, this could be used
  // to save the scroll position of the editor.
  save_editor_state(id: string, new_editor_state?: any): void {
    let left;
    if (this._state === "closed") {
      return;
    }
    const local = this.store.get("local_view_state");
    if (local == null) {
      return;
    }
    let editor_state =
      (left = local.get("editor_state")) != null ? left : Map();
    if (new_editor_state == null) {
      if (!editor_state.has(id)) {
        return;
      }
      editor_state = editor_state.delete(id);
    } else {
      editor_state = editor_state.set(id, fromJS(new_editor_state));
    }
    this.setState({
      local_view_state: local.set("editor_state", editor_state)
    });
    this._save_local_view_state();
  }

  // Copy state information from one frame to another frame.
  // E.g., this is used when splitting a frame, when we want
  // the two resulting frames to have the same font size as the frame
  // we just split.
  copy_editor_state(id1: string, id2: string): void {
    const info = this.store.getIn(["local_view_state", "editor_state", id1]);
    if (info) {
      this.save_editor_state(id2, info);
    }
  }

  _syncstring_metadata(): void {
    // need to check since this can get called by the close.
    if (!this._syncstring) return;
    const read_only = this._syncstring.is_read_only();
    if (read_only !== this.store.get("read_only")) {
      this.setState({ read_only });
    }
  }

  _syncstring_cursor_activity(): void {
    // need to check since this can get called by the close.
    if (!this._syncstring) return;
    // TODO: for now, just for the one syncstring obviously
    // TOOD: this is probably naive and slow too...
    let cursors: Map<string, List<Map<string, any>>> = Map();
    this._syncstring.get_cursors().forEach((info, account_id) => {
      info.get("locs").forEach(loc => {
        loc = loc.set("time", info.get("time"));
        const locs = cursors.get(account_id, List()).push(loc);
        cursors = cursors.set(account_id, locs);
      });
    });
    if (!cursors.equals(this.store.get("cursors"))) {
      this.setState({ cursors });
    }
  }

  // Set the location of all of OUR cursors.  This is entirely
  // so the information can propogate to other users via the syncstring.
  set_cursor_locs(locs: any[]): void {
    if (!this._syncstring) {
      return; // not currently valid.
    }
    if (locs.length === 0) {
      // don't remove on blur -- cursor will fade out just fine
      return;
    }
    this._syncstring.set_cursor_locs(locs);
    if ((this as any).handle_cursor_move !== undefined) {
      // give derived classes a chance to handle cursor movement.
      (this as any).handle_cursor_move(locs);
    }
  }

  // Delete trailing whitespace, avoiding any line that contains
  // a cursor.  Also, is a no-op if no actual codemirror editor
  // is initialized.
  delete_trailing_whitespace(): void {
    const cm = this._get_cm();
    if (cm == null) {
      return;
    }
    const omit_lines: SetMap = {};
    const cursors = this._syncstring.get_cursors();
    if (cursors) {
      cursors.map((user, _) => {
        const locs = user.get("locs");
        if (!locs) return;
        locs.map(loc => {
          const y = loc.get("y");
          if (y != null) {
            omit_lines[y] = true;
          }
        });
      });
    }
    cm.delete_trailing_whitespace({ omit_lines });
  }

  async save(explicit: boolean): Promise<void> {
    if (this.is_public || !this.store.get("is_loaded")) {
      return;
    }
    // TODO: Maybe just move this to some explicit menu of actions, which also includes
    // several other formatting actions.
    // Doing this automatically is fraught with error, since cursors aren't precise...
    if (explicit) {
      const account: any = this.redux.getStore("account");
      if (
        account &&
        account.getIn(["editor_settings", "strip_trailing_whitespace"])
      ) {
        this.delete_trailing_whitespace();
      }
    }
    this.set_syncstring_to_codemirror();
    this.setState({ is_saving: true });
    try {
      await this._syncstring.save_to_disk();
    } catch (err) {
      console.warn("save_to_disk", this.path, "ERROR", err);
      if (this._state !== "closed") {
        this.set_error(`${SAVE_ERROR} -- ${err} -- ${SAVE_WORKAROUND}`);
        log_error({
          string_id: this._syncstring ? this._syncstring._string_id : "",
          path: this.path,
          project_id: this.project_id,
          error: "Error saving file -- has_unsaved_changes"
        });
      }
    } finally {
      this.setState({ is_saving: false });
    }
  }

  _get_project_actions() {
    return this.redux.getProjectActions(this.project_id);
  }

  time_travel(opts: { path?: string; frame?: boolean }): void {
    if (opts.frame) {
      this.show_focused_frame_of_type("time_travel");
    } else {
      this._get_project_actions().open_file({
        path: history_path(opts.path || this.path),
        foreground: true
      });
    }
  }

  help(type: string): void {
    const url: string = (function() {
      switch (type) {
        case "terminal":
          return "https://doc.cocalc.com/terminal.html";
        case "time_travel":
          return "https://github.com/sagemathinc/cocalc/wiki/TimeTravel";
        default:
          return WIKI_HELP_URL + type + "-help";
      }
    })();
    open_new_tab(url);
  }

  set_zoom(zoom: number, id?: string) {
    this.change_font_size(undefined, id, zoom);
  }

  /* zoom: 1=100%, 1.5=150%, ...*/
  change_font_size(delta?: number, id?: string, zoom?: number): void {
    if (delta == null && zoom == null) return;
    const local = this.store.get("local_view_state");
    if (!id) {
      id = local.get("active_id");
    }
    if (!id) {
      return;
    }
    const node = this._get_frame_node(id);
    if (!node) {
      return;
    }

    // this is 100%
    const default_font_size = get_default_font_size();
    let font_size: number;
    // either +/- delta or set the zoom factor
    if (zoom != null) {
      font_size = default_font_size * zoom;
    } else if (delta != null) {
      font_size = node.get("font_size", default_font_size);
      font_size += delta;
      if (font_size < 2) {
        font_size = 2;
      }
    } else {
      // to make typescript happy
      return;
    }
    this.set_frame_tree({ id, font_size });
    this.focus(id);
    this.set_status_font_size(font_size, default_font_size);
  }

  set_status_font_size(font_size: number, default_font_size) {
    const percent = Math.round((font_size * 100) / default_font_size);
    this.set_status(`Set font size to ${font_size} (${percent}%)`, 1500);
  }

  increase_font_size(id: string): void {
    this.change_font_size(1, id);
  }

  decrease_font_size(id: string): void {
    this.change_font_size(-1, id);
  }

  set_font_size(id: string, font_size: number): void {
    this.set_frame_tree({ id, font_size });
    this.focus(id);
  }

  set_cm(id: string, cm: CodeMirror.Editor): void {
    const sel =
      this._cm_selections != null ? this._cm_selections[id] : undefined;
    if (sel != null) {
      // restore saved selections (cursor position, selected ranges)
      cm.getDoc().setSelections(sel);
    }
    // reference to this actions object, so codemirror plugins
    // can potentially use it.  E.g., see the lean-editor/tab-completions.ts
    (cm as any).cocalc_actions = this;

    if (len(this._cm) > 0) {
      // just making another cm
      this._cm[id] = cm;
      return;
    }

    this._cm[id] = cm;
    // Creating codemirror for the first time -- need to initialize it.
    this.set_codemirror_to_syncstring();
  }

  // 1. if id given, returns cm with given id if id
  // 2. if no id given:
  //   if recent is true, return most recent cm
  //   if recent is not given, return some cm
  // 3. If no cm's return undefined.
  _get_cm(id?: string, recent?: boolean): CodeMirror.Editor | undefined {
    if (this._state === "closed") return;
    if (id) {
      let cm: CodeMirror.Editor | undefined = this._cm[id];
      if (!cm) {
        cm = this._active_cm();
      }
      if (cm) {
        return cm;
      }
    }
    if (recent) {
      return this._get_cm(this._get_most_recent_cm_id(), false);
    } else {
      for (id in this._cm) {
        return this._cm[id];
      }
    }
  }

  // Get the underlying codemirror doc that editors are using.
  _get_doc(): CodeMirror.Doc {
    return cm_doc_cache.get_doc(this.project_id, this.path);
  }

  _recent_cm(): CodeMirror.Editor | undefined {
    if (this._state === "closed") return;
    return this._get_cm(undefined, true);
  }

  _get_most_recent_cm_id(): string | undefined {
    return this._get_most_recent_active_frame_id(
      node => node.get("type").slice(0, 2) == "cm"
    );
  }

  _get_most_recent_terminal_id(): string | undefined {
    return this._get_most_recent_active_frame_id(
      node => node.get("type").slice(0, 8) == "terminal"
    );
  }

  // TODO: might also specify args.
  _get_most_recent_shell_id(command: string | undefined): string | undefined {
    return this._get_most_recent_active_frame_id(
      node =>
        node.get("type").slice(0, 8) == "terminal" &&
        node.get("command") == command
    );
  }

  public _active_id(): string {
    return this.store.getIn(["local_view_state", "active_id"]) as any;
  }

  _active_cm(): CodeMirror.Editor | undefined {
    return this._cm[this._active_id()];
  }

  public _get_terminal(
    id: string,
    parent: HTMLElement
  ): Terminal<CodeEditorState> {
    return this.terminals.get_terminal(id, parent);
  }

  // Open a code editor, optionally at the given line.
  // TODO: try to eliminate the async.
  async open_code_editor(opts: {
    focus?: boolean;
    line?: number;
    file?: string; // not supported yet (TODO!)
    cursor?: boolean; // set cursor to line position (not just scroll to it)
    direction?: FrameDirection;
  }): Promise<void> {
    if (opts.focus === undefined) opts.focus = true;
    if (opts.cursor === undefined) opts.cursor = true;
    if (opts.direction === undefined) opts.direction = "col";

    const must_create = this._get_cm() == null;
    if (must_create) {
      // split and make a cm
      this.split_frame(opts.direction, undefined, "cm");
    }

    if (opts.line !== undefined) {
      if (must_create) {
        // Have to wait until after editor gets created
        await delay(1);
        if (this._state == "closed") return;
      }
      this.programmatical_goto_line(opts.line, opts.cursor);
    }

    if (opts.focus) {
      // Have to wait until after editor gets created, and
      // probably also event that caused this open.
      await delay(1);
      if (this._state == "closed") return;
      const cm = this._recent_cm();
      if (cm) {
        cm.focus();
      }
    }
  }

  public focus(id?: string): void {
    if (id === undefined) {
      id = this._get_active_id();
    }

    let cm: CodeMirror.Editor | undefined = this._cm[id];
    if (cm) {
      // Save that it was focused just now; this is just a quick solution to
      // "give me last active cm" -- we will switch to something
      // more generic later -- TODO: switch to use _active_id_history
      (cm as any)._last_active = new Date();
      cm.focus();
      return;
    }
    // no cm, so try to focus a terminal if there is one.
    this.terminals.focus(id);
  }

  syncstring_commit(): void {
    if (this._syncstring != null) {
      this._syncstring.commit();
    }
  }

  set_syncstring_to_codemirror(id?: string): void {
    const cm = this._get_cm(id);
    if (!cm) {
      return;
    }
    this.set_syncstring(cm.getValue());
  }

  set_syncstring(value: string): void {
    if (this._state === "closed") return;
    const cur = this._syncstring.to_str();
    if (cur === value) {
      // did not actually change.
      return;
    }
    this._syncstring.from_str(value);
    // NOTE: above is the only place where syncstring is changed, and when *we* change syncstring,
    // no change event is fired.  However, derived classes may want to update some preview when
    // syncstring changes, so we explicitly emit a change here:
    return this._syncstring.emit("change");
  }

  async set_codemirror_to_syncstring(): Promise<void> {
    if (
      this._syncstring == null ||
      this._state == "closed" ||
      this._syncstring.get_state() == "closed"
    ) {
      // no point in doing anything further.
      return;
    }

    if (this._syncstring.get_state() != "ready") {
      await once(this._syncstring, "ready");
      if (this._state == "closed") return;
    }

    // NOTE: we fallback to getting the underlying CM doc, in case all actual
    // cm code-editor frames have been closed (or just aren't visible).
    const cm: CodeMirror.Editor | undefined = this._get_cm(undefined, true);
    if (cm !== undefined) {
      cm.setValueNoJump(this._syncstring.to_str());
    } else {
      let doc: CodeMirror.Doc;
      try {
        // _get_doc either returns a Doc or raises an exception if there isn't one.
        doc = this._get_doc();
      } catch (err) {
        return;
      }
      // doc does not have setValueNoJump, and doesn't need it, since
      // there are no cursors or selections if there are no cm's.
      doc.setValue(this._syncstring.to_str());
    }
  }

  exit_undo_mode(): void {
    this._syncstring.exit_undo_mode();
  }

  // per-session sync-aware undo
  undo(id: string): void {
    const cm = this._get_cm(id);
    if (cm == null) {
      return;
    }
    if (!this._syncstring.in_undo_mode()) {
      this.set_syncstring_to_codemirror();
    }
    const value = this._syncstring.undo().to_str();
    cm.setValueNoJump(value, true);
    cm.focus();
    this.set_syncstring_to_codemirror();
    this._syncstring.commit();
  }

  // per-session sync-aware redo
  redo(id: string): void {
    const cm = this._get_cm(id);
    if (cm == null) {
      return;
    }
    if (!this._syncstring.in_undo_mode()) {
      return;
    }
    const doc = this._syncstring.redo();
    if (doc == null) {
      // can't redo if version not defined/not available.
      return;
    }
    const value = doc.to_str();
    cm.setValueNoJump(value, true);
    cm.focus();
    this.set_syncstring_to_codemirror();
    this._syncstring.commit();
  }

  _cm_exec(id: string, command: string): void {
    const cm = this._get_cm(id);
    if (cm) {
      cm.execCommand(command);
    }
  }

  find(id: string): void {
    this._cm_exec(id, "find");
  }

  find_next(id: string): void {
    this._cm_exec(id, "findNext");
  }

  find_prev(id: string): void {
    this._cm_exec(id, "findPrev");
  }

  replace(id: string): void {
    this._cm_exec(id, "replace");
  }

  goto_line(id: string): void {
    this._cm_exec(id, "jumpToLine");
  }

  auto_indent(id: string): void {
    this._cm_exec(id, "indentAuto");
  }

  // used when clicking on other user avatar,
  // in the latex editor, etc.
  // If cursor is given, moves the cursor to the line too.
  async programmatical_goto_line(
    line: number,
    cursor?: boolean,
    focus?: boolean
  ): Promise<void> {
    if (line <= 0) {
      /* Lines <= 0 cause an exception in codemirror later.
         If the line number is much larger than the number of lines
         in the buffer, codemirror just goes to the last line with
         no error, which is fine (however, scroll into view fails).
         If you want a negative or 0 line
         the most sensible behavior is line 0.  See
         https://github.com/sagemathinc/cocalc/issues/3219
      */
      line = 1;
    }
    const cm_id: string | undefined = this._get_most_recent_cm_id();
    const full_id: string | undefined = this.store.getIn([
      "local_view_state",
      "full_id"
    ]);
    if (full_id && full_id != cm_id) {
      this.unset_frame_full();
      // have to wait for cm to get created and registered.
      await delay(1);
      if (this._state == "closed") return;
    }

    let cm = this._get_cm(cm_id);
    if (cm == null) {
      // this case can only happen in derived classes with non-cm editors.
      this.split_frame("col", this._get_active_id(), "cm");
      // Have to wait until the codemirror editor is created and registered, which
      // is caused by component mounting.
      await delay(1);
      if (this._state == "closed") return;
      cm = this._recent_cm();
      if (cm == null) {
        // still failed -- give up.
        return;
      }
    }
    const doc = cm.getDoc();
    if (line > doc.lineCount()) {
      line = doc.lineCount();
    }
    const pos = { line: line - 1, ch: 0 };
    const info = cm.getScrollInfo();
    cm.scrollIntoView(pos, info.clientHeight / 2);
    if (cursor) {
      doc.setCursor(pos);
    }
    if (focus) {
      cm.focus();
    }
  }

  cut(id: string): void {
    const cm = this._get_cm(id);
    if (cm != null) {
      let doc = cm.getDoc();
      copypaste.set_buffer(doc.getSelection());
      doc.replaceSelection("");
      cm.focus();
    }
  }

  copy(id: string): void {
    if (this._terminal_command(id, "copy")) {
      return;
    }
    const cm = this._get_cm(id);
    if (cm != null) {
      copypaste.set_buffer(cm.getDoc().getSelection());
      cm.focus();
      return;
    }
  }

  paste(id: string, _value?: string | true): void {
    if (this._terminal_command(id, "paste")) {
      return;
    }
    let value;
    if (value === true || value == null) {
      value = copypaste.get_buffer();
    }
    if (value === undefined) {
      // nothing to paste
      return;
    }
    const cm = this._get_cm(id);
    if (cm != null) {
      cm.getDoc().replaceSelection(value);
      cm.focus();
      return;
    }
  }

  // big scary error shown at top
  public set_error(
    error?: object | string,
    style?: ErrorStyles,
    id?: string
  ): void {
    id = id; // id - not currently used, but would be for frame-specific error.
    if (error === undefined) {
      this.setState({ error });
    } else {
      if (typeof error == "object") {
        let e = (error as any).message;
        if (e === undefined) {
          let e = JSON.stringify(error);
          if (e === "{}") {
            e = `${error}`;
          }
        }
        if (typeof e != "string") throw Error("bug"); // make typescript happy
        error = e;
      }
      this.setState({ error });
    }

    switch (style) {
      case "monospace":
        this.setState({ errorstyle: style });
        break;
      default:
        this.setState({ errorstyle: undefined });
    }
  }

  // status - little status message shown at bottom.
  // timeout -- if status message hasn't changed after
  // this long, then blank it.
  async set_status(status: string, timeout?: number): Promise<void> {
    this.setState({ status });
    if (timeout) {
      await delay(timeout);
      if (this._state == "closed") return;
      if (this.store.get("status") === status) {
        this.setState({ status: "" });
      }
    }
  }

  print(id): void {
    const cm = this._get_cm(id);
    if (!cm) {
      return; // nothing to print...
    }
    let node = this._get_frame_node(id);
    if (!node) {
      return; // this won't happen but it ensures node is defined for typescript.
    }
    try {
      print_code({
        value: cm.getValue(),
        options: cm.options,
        path: this.path,
        font_size: node.get("font_size")
      });
    } catch (err) {
      this.set_error(err);
    }
    return cm.focus();
  }

  // returns the path, unless we aim to spellcheck for a related file (e.g. rnw, rtex)
  // overwritten in derived classes
  get_spellcheck_path(): string {
    return this.path;
  }

  // Runs spellchecker on the backend last saved file, then
  // sets the mispelled_words part of the state to the immutable
  // Set of those words.  They can then be rendered by any editor/view.
  async update_misspelled_words(time?: number): Promise<void> {
    if (this._state == "closed") return;
    const proj_store = this.redux.getProjectStore(this.project_id);
    if (proj_store != null) {
      // TODO why is this an immutable map? it's project_configuration/Available
      const available = proj_store.get("available_features");
      if (available != null && !available.get("spellcheck", false)) {
        // console.log("Spellcheck not available");
        return;
      }
    }

    // hash combines state of file with spell check setting.
    // TODO: store /type fail.
    const lang = (this.store.get("settings") as Map<string, any>).get("spell");
    if (!lang) {
      // spell check configuration not yet initialized
      return;
    }
    const hash = this._syncstring.hash_of_saved_version() + lang;
    if (hash === this._update_misspelled_words_last_hash) {
      // same file as before, so do not bother.
      return;
    }
    this._update_misspelled_words_last_hash = hash;
    try {
      const words: string[] = await misspelled_words({
        project_id: this.project_id,
        path: this.get_spellcheck_path(),
        lang,
        time
      });
      const x = Set(words);
      if (!x.equals(this.store.get("misspelled_words"))) {
        this.setState({ misspelled_words: x });
      }
    } catch (err) {
      this.set_error(err);
    }
  }

  async format_action(cmd, args): Promise<void> {
    const cm = this._get_cm(undefined, true);
    if (cm == null) {
      // format bar only makes sense when some cm is there...
      return;
    }
    await callback_opts(opts => cm.edit_selection(opts))({
      cmd,
      args
    });
    if (this._state !== "closed") {
      cm.focus();
      this.set_syncstring_to_codemirror();
      this._syncstring.commit();
    }
  }

  set_gutter_marker(opts: {
    id?: string; // user-specified unique id for this gutter marker; autogenerated if not given
    line: number; // base-0 line number where gutter is initially positions
    gutter_id: string; // css class name of the gutter
    component: Rendered; // react component that gets rendered as the gutter marker
  }): void {
    if (opts.id == null) {
      // generate a random id, since none was specified.
      opts.id = uuid();
    }
    const gutter_markers: GutterMarkers = this.store.get(
      "gutter_markers",
      Map()
    );
    const info = new GutterMarker({
      line: opts.line,
      gutter_id: opts.gutter_id,
      component: opts.component
    });
    this.setState({ gutter_markers: gutter_markers.set(opts.id, info) });
  }

  delete_gutter_marker(id: string): void {
    const gutter_markers: GutterMarkers = this.store.get(
      "gutter_markers",
      Map()
    );
    if (gutter_markers.has(id)) {
      this.setState({ gutter_markers: gutter_markers.delete(id) });
    }
  }

  // clear all gutter markers in the given gutter
  clear_gutter(gutter_id: string): void {
    let gutter_markers: GutterMarkers = this.store.get("gutter_markers", Map());
    const before = gutter_markers;
    gutter_markers.map((info, id) => {
      if (info !== undefined && info.get("gutter_id") === gutter_id && id) {
        /* && id is to satify typescript */
        gutter_markers = gutter_markers.delete(id);
      }
    });
    if (before !== gutter_markers) {
      this.setState({ gutter_markers });
    }
  }

  // The GutterMarker component calls this to save the line handle to the gutter marker,
  // which is needed for tracking the gutter location.
  // Nothing else should directly call this.
  _set_gutter_handle(id: string, handle: string): void {
    // id     = user-specified unique id for this gutter marker
    // handle = determines current line number of gutter marker
    const gutter_markers: GutterMarkers = this.store.get("gutter_markers");
    if (gutter_markers == null) {
      return;
    }
    const info = gutter_markers.get(id);
    if (info == null) {
      return;
    }
    this.setState({
      gutter_markers: gutter_markers.set(id, info.set("handle", handle))
    });
  }

  async ensure_latest_changes_are_saved(): Promise<boolean> {
    this.set_status("Ensuring your latest changes are saved...");
    this.set_syncstring_to_codemirror();
    try {
      await this._syncstring.save();
      return true;
    } catch (err) {
      this.set_error(`Error saving to server: \n${err}`);
      return false;
    } finally {
      this.set_status("");
    }
  }

  public format_support_for_extension(
    available_features: AvailableFeatures,
    ext: string
  ): false | string {
    const formatting = available_features.get("formatting");
    if (formatting == null || formatting == false) return false;
    // Now formatting is either "true" or a map itself.
    const parser = ext2parser[ext];
    if (parser == null) return false;
    const tool = parser2tool[parser];
    if (tool == null) return false;
    if (formatting !== true && !formatting.get(tool)) return false;
    return tool;
  }

  // Not an action, but works to make code clean
  has_format_support(
    id: string,
    available_features?: AvailableFeatures // is in project store
  ): false | string {
    if (available_features == null) return false;
    const leaf = this._get_frame_node(id);
    if (leaf != null) {
      // Our default format support is only for
      // normal code editors.  This can be
      // overloaded in derived actions, e.g.,
      // it is in the Jupyter notebook actions.
      if (leaf.get("type") != "cm") return false;
    }
    const ext = filename_extension(this.path).toLowerCase();
    const tool = this.format_support_for_extension(available_features, ext);
    if (!tool) return false;
    return `Format the entire document using '${tool}'.`;
  }

  // ATTN to enable a formatter, you also have to let it show up in the format bar
  // e.g. look into frame-editors/code-editor/editor.ts
  // and the action has_format_support.
  async format(id: string): Promise<void> {
    const cm = this._get_cm(id);
    if (!cm) return;

    if (!(await this.ensure_latest_changes_are_saved())) {
      return;
    }

    // Important: this function may be called even if there is no format support,
    // because it can be called via a keyboard shortcut.  That's why we gracefully
    // handle this case -- see https://github.com/sagemathinc/cocalc/issues/4180
    const s = this.redux.getProjectStore(this.project_id);
    if (s == null) return;
    // TODO: Using any here since TypeMap is just not working right...
    const af: any = s.get("available_features");
    if (!this.has_format_support(id, af)) return;

    // Definitely have format support
    cm.focus();
    const ext = filename_extension(this.path).toLowerCase() as FormatterExts;
    const parser: FormatterParser = format_parser_for_extension(ext);
    const options: FormatterOptions = {
      parser,
      tabWidth: cm.getOption("tabSize") as number,
      useTabs: cm.getOption("indentWithTabs") as boolean
    };

    this.set_status("Running code formatter...");
    try {
      await prettier(this.project_id, this.path, options);
      this.set_error("");
    } catch (err) {
      this.set_error(`Error formatting code: \n${err}`, "monospace");
    } finally {
      this.set_status("");
    }
  }

  // call this and get back a function that can be used
  // for testing that realtime sync/set/etc....
  async test(opts: any = {}): Promise<void> {
    if (!opts.cm) {
      opts.cm = this._get_cm();
    }
    await test_line(opts);
  }

  // Get the id of the most recent active frame.
  // If f is given, restrict to frames for which f(node)
  // is true, and if there are no such frames at all,
  // then return undefined.  If there is a matching frame
  // that has never been active in this session, will use that
  // in arbitrary order.
  _get_most_recent_active_frame_id(f?: Function): string | undefined {
    if (this._state === "closed") return;
    let tree = this._get_tree();
    for (let i = this._active_id_history.length - 1; i >= 0; i--) {
      let id = this._active_id_history[i];
      if (tree_ops.is_leaf_id(tree, id)) {
        if (f === undefined || f(tree_ops.get_node(tree, id))) {
          return id;
        }
      }
    }
    // now just check for any frame at all.
    for (let id in this._get_leaf_ids()) {
      if (f === undefined || f(tree_ops.get_node(tree, id))) {
        return id;
      }
    }
    // truly nothing!
    return;
  }

  _get_most_recent_active_frame_id_of_type(type: string): string | undefined {
    return this._get_most_recent_active_frame_id(
      node => node.get("type") == type
    );
  }

  _has_frame_of_type(type: string): boolean {
    return this._get_most_recent_active_frame_id_of_type(type) != null;
  }

  /* Get current value of the cm editor doc. Returns undefined if no
     such editor has been initialized.

     Not part of public API -- this is just used for testing.
     Exception if can't be done, e.g., if editor not mounted.
  */
  _get_cm_value(): string {
    if (this._state == "closed") {
      throw Error("editor is closed");
    }
    const cm = this._get_cm();
    if (!cm) {
      throw Error("cm not defined (maybe editor is not mounted)");
    }
    return cm.getValue();
  }

  /* Get current value of the syncstring.  Returns undefined if syncstring
     not defined.

     Not part of public API -- this is just used for testing.

     Exception if can't be done.
  */
  _get_syncstring_value(): string {
    if (this._state == "closed") {
      throw Error("editor is closed");
    }
    if (!this._syncstring) {
      throw Error("_syncstring not defined.");
    } else {
      return this._syncstring.to_str();
    }
  }

  /* Get jQuery wrapped frame with given id.  Exception if not
  in the DOM and unique.   Meant for testing only.
  This is the **editor** for a frame,
  and does NOT include the titlebar. */
  _get_frame_jquery(id: string): JQuery<HTMLElement> {
    const elt = $("#frame-" + id);
    if (elt.length != 1) {
      throw Error(`unique frame with id ${id} not in DOM`);
    }
    return elt;
  }

  /* Get jQuery wrapped titlebar fro given id. */
  _get_titlebar_jquery(id: string): JQuery<HTMLElement> {
    const elt = $("#titlebar-" + id);
    if (elt.length != 1) {
      throw Error(`unique frame with id ${id} not in DOM`);
    }
    return elt;
  }

  _default_settings(): SettingsObject {
    return {};
  }

  /* Functions related to settings */

  set_settings(obj: object): void {
    this._syncstring.set_settings(obj);
    this.setState({ settings: this._syncstring.get_settings() });
    if (obj.hasOwnProperty("spell")) {
      this.update_misspelled_words();
    }
  }

  _init_settings(): void {
    const settings = this._syncstring.get_settings();
    this.setState({ settings: settings });

    if (this._spellcheck_is_supported) {
      if (!settings.get("spell")) {
        // ensure spellcheck is a possible setting, if necessary.
        this.set_settings({ spell: "default" });
      }
      // initial spellcheck
      this.update_misspelled_words();
    }

    this._syncstring.on("settings-change", settings => {
      this.setState({ settings: settings });
    });
  }

  set_title(id: string, title: string): void {
    //console.log("set title of term ", id, " to ", title);
    this.set_frame_tree({ id: id, title: title });
  }

  set_connection_status(id: string, status?: ConnectionStatus): void {
    //console.log("set title of term ", id, " to ", title);
    this.set_frame_tree({ id: id, connection_status: status });
  }

  connection_status(_: string): void {
    // no-op, but needed so connection status shows up.
    // This is the action that may happen if we make clicking on
    // the connection status indicator do something (reconnect?  show a dialog?).
  }

  /* Kick other uses out of this frame (only implemented for terminals right now). */
  _terminal_command(id: string, cmd: string): boolean {
    const terminal = this.terminals.get(id);
    if (terminal != null) {
      const f = terminal[cmd];
      if (typeof f !== "function") {
        console.warn(`terminal command "${cmd}" not implemented`);
      } else {
        terminal[cmd]();
      }
      return true;
    }
    return false;
  }

  kick_other_users_out(id: string): void {
    if (this._terminal_command(id, "kick_other_users_out")) {
      return;
    }
  }

  pause(id: string): void {
    this.set_frame_tree({ id: id, is_paused: true });
    this.focus(id);
    if (this._terminal_command(id, "pause")) {
      return;
    }
  }

  unpause(id: string): void {
    this.set_frame_tree({ id: id, is_paused: false });
    this.focus(id);
    if (this._terminal_command(id, "unpause")) {
      return;
    }
  }

  edit_init_script(id: string): void {
    // right now, only terminals have this generically.
    if (this._terminal_command(id, "edit_init_script")) {
      return;
    }
  }

  popout(id: string): void {
    // right now, only terminals have this generically.
    if (this._terminal_command(id, "popout")) {
      return;
    }
  }

  // Override in derived class to set a special env for
  // any launched terminals.
  get_term_env(): { [envvar: string]: string } {
    // https://github.com/sagemathinc/cocalc/issues/4120
    const MPLBACKEND = "Agg";
    return { MPLBACKEND };
  }

  // If you override show, make sure to still call this
  // super class!
  public async show(): Promise<void> {
    this.setState({
      visible: true
    });

    await delay(0); // wait until next render loop
    if (this._state == "closed") return;
    this.set_resize();
    this.refresh_visible();
    this.focus();
  }

  // If you override hide, make sure to still call this
  // super class!
  public hide(): void {
    this.setState({ visible: false });
  }

  // Refresh all visible frames.
  public refresh_visible(): void {
    // Right now either there is one that is "fullscreen", and
    // only that one is visible, or all are visible.
    const full_id: string | undefined = this.store.getIn([
      "local_view_state",
      "full_id"
    ]);
    if (full_id != null) {
      this.refresh(full_id);
    } else {
      for (let id in this._get_leaf_ids()) {
        this.refresh(id);
      }
    }
  }

  // Called when frame with given id is displayed.
  // Use this as a hook, e.g., for resizing codemirror etc.
  // This is called after the frame is already displayed,
  // so no need to wait.
  public refresh(id: string): void {
    if (this._cm[id] != null) {
      this._cm[id].refresh();
      return;
    }
    const t = this.terminals.get(id);
    if (t != null) {
      t.refresh();
      return;
    }
  }

  // Overload this in a derived class to have a possibly more complicated spec.
  protected async get_shell_spec(
    id: string
  ): Promise<undefined | string | { command: string; args: string[] }> {
    id = id; // not used.
    return SHELLS[filename_extension(this.path)];
  }

  public async shell(id: string): Promise<void> {
    const x = await this.get_shell_spec(id);
    let command: string | undefined = undefined;
    let args: string[] | undefined = undefined;
    if (x == null) {
      // generic case - uses bash (the default)
    } else if (typeof x === "string") {
      command = x;
    } else {
      command = x.command;
      args = x.args;
      if (typeof command != "string") {
        throw Error("SHELLS data structure wrong.");
      }
    }
    // Check if there is already a terminal with the given command,
    // and if so, just focus it.
    // (TODO: might also specify args.)
    let shell_id: string | undefined = this._get_most_recent_shell_id(command);
    if (shell_id == null) {
      // No such terminal already, so we make one and focus it.
      shell_id = this.split_frame("col", id, "terminal", { command, args });
      if (!shell_id) return;
    } else {
      // Change command/args.
      this.terminals.set_command(shell_id, command, args);
    }

    // De-maximize if in full screen mode.
    this.unset_frame_full();

    // Have to wait until after editor gets created, and
    // probably also event that caused this open.
    await delay(1);
    if (this._state == "closed") return;
    this.set_active_id(shell_id);
  }

  public clear_terminal_command(id: string): void {
    this.set_frame_tree({ id, command: undefined, args: undefined });
    // also, restart that terminal...
    this.terminals.set_command(id, undefined, undefined);
    this.terminals.kill(id);
  }

  public set_active_key_handler(key_handler: Function): void {
    (this.redux.getActions("page") as any).set_active_key_handler(
      key_handler,
      this.project_id,
      this.path
    );
  }

  public erase_active_key_handler(key_handler: Function): void {
    (this.redux.getActions("page") as any).erase_active_key_handler(
      key_handler
    );
  }

  // Show the most recently focused frame of the given type, or create
  // one of that type.  Does NOT focus that frame.
  public show_recently_focused_frame_of_type(
    type: string,
    dir: FrameDirection = "col",
    first: boolean = false,
    pos: number | undefined = undefined
  ): string {
    let id: string | undefined = this._get_most_recent_active_frame_id_of_type(
      type
    );
    if (id == null) {
      // no such frame, so make one
      const active_id = this._get_active_id();
      this.split_frame(dir, active_id, type, undefined, first, true);
      id = this._get_most_recent_active_frame_id_of_type(type);
      if (pos != null && id != null) {
        const parent_id = this.get_parent_id(id);
        if (parent_id != null) {
          this.set_frame_tree({ id: parent_id, pos });
        }
      }
      this.set_active_id(active_id); // above could change it.
    }
    if (id == null) {
      throw Error("bug creating frame");
    }
    let local_view_state = this.store.get("local_view_state");
    if (local_view_state != null && local_view_state.get("full_id") != id) {
      this.unset_frame_full();
    }
    return id;
  }

  // Shows most recent frame of the given type, or creates it.
  // Also focuses that frame.
  public show_focused_frame_of_type(
    type: string,
    dir: FrameDirection = "col",
    first: boolean = false,
    pos: number | undefined = undefined
  ): string {
    let id = this.show_recently_focused_frame_of_type(type, dir, first, pos);
    this.set_active_id(id);
    return id;
  }

  // Closes the most recently focused frame of the given type.
  public close_recently_focused_frame_of_type(
    type: string
  ): string | undefined {
    let id: string | undefined = this._get_most_recent_active_frame_id_of_type(
      type
    );
    if (id != null) {
      this.close_frame(id);
      return id;
    }
  }

  /*
  Open a file for editing with the code editor.  This is typically used for
  opening a path other than this.path for editing.  E.g., this would be useful
  for editing a tex or bib file associated to a master latex document, or editing
  some .py code related to a Jupyter notebook.

  - Will show and focus an existing frame if there already is one for this path.
  - Otherwise, will create a new frame open to edit (using codemirror) the given path.

  Returns the id of the frame with the code editor in it.
  */
  public open_code_editor_frame(
    path: string,
    dir: FrameDirection = "col",
    first: boolean = false,
    pos: number | undefined = undefined
  ): string {
    // See if there is already a frame for path, and if so show
    // display and focus it.
    for (let id in this._get_leaf_ids()) {
      const leaf = this._get_frame_node(id);
      if (
        leaf != null &&
        leaf.get("type") === "cm" &&
        ((this.path === path && leaf.get("path") == null) || // default
          leaf.get("path") === path) // existing frame
      ) {
        // got it!
        this.set_active_id(id);
        return id;
      }
    }

    // There is no frame for path, so we create one.
    // First the easy special case:
    if (this.path === path) {
      return this.show_focused_frame_of_type("cm", dir, first, pos);
    }

    // More difficult case - no such frame and different path
    const active_id = this._get_active_id();
    const id = this.split_frame(dir, active_id, "cm", { path }, first, true);
    if (id == null) {
      throw Error("BUG -- failed to make frame");
    }
    if (pos != null) {
      const parent_id = this.get_parent_id(id);
      if (parent_id != null) {
        this.set_frame_tree({ id: parent_id, pos });
      }
    }
    this.set_active_id(id);
    return id;
  }

  public get_code_editor(id: string): CodeEditor {
    return this.code_editors.get_code_editor(id);
  }
}
