/*
Code Editor Actions
*/

const WIKI_HELP_URL = "https://github.com/sagemathinc/cocalc/wiki/editor"; // TODO -- write this
const SAVE_ERROR = "Error saving file to disk. ";
const SAVE_WORKAROUND =
  "Ensure your network connection is solid. If this problem persists, you might need to close and open this file, or restart this project in Project Settings.";
const MAX_SAVE_TIME_S = 90; // how long to retry to save (and get no unsaved changes), until giving up and showing an error.

import { fromJS, List, Map, Set } from "immutable";
import { debounce } from "underscore";
import { callback, delay } from "awaiting";
import {
  get_default_font_size,
  log_error,
  public_get_text_file,
  prettier,
  syncstring,
  syncdb
} from "../generic/client";
import { aux_file } from "../frame-tree/util";
import { callback_opts, retry_until_success } from "../generic/async-utils";
import {
  filename_extension,
  history_path,
  len,
  startswith,
  uuid
} from "../generic/misc";
import { print_code } from "../frame-tree/print-code";
import {
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

const copypaste = require("smc-webapp/copy-paste-buffer");

interface gutterMarkerParams {
  line: number;
  gutter_id: string;
  component?: Rendered;
  handle?: string;
}

const GutterMarker = createTypedMap<gutterMarkerParams>();
type GutterMarkers = Map<string, TypedMap<gutterMarkerParams>>;

export interface CodeEditorState {
  project_id: string;
  path: string;
  is_public: boolean;
  local_view_state: any;
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
  error: any;
  errorstyle?: ErrorStyles;
  status: any;
  read_only: boolean;
  settings: Map<string, any>; // settings specific to this file (but **not** this user or browser), e.g., spell check language.
}

export class Actions<T = CodeEditorState> extends BaseActions<
  T | CodeEditorState
> {
  protected _state: "closed" | undefined;
  protected _syncstring: any;
  protected _syncdb?: any; /* auxiliary file optionally used for shared project configuration (e.g., for latex) */
  private _syncstring_init: boolean = false; // true once init has happened.
  private _syncdb_init: boolean = false; // true once init has happened
  protected _key_handler: any;
  protected _cm: { [key: string]: CodeMirror.Editor } = {};

  protected doctype: string = "syncstring";
  protected primary_keys: string[] = [];
  protected string_cols: string[] = [];

  public project_id: string;
  public path: string;
  public store: Store<CodeEditorState>;
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
    this.project_id = project_id;
    this.path = path;
    this.store = store;
    this.is_public = is_public;

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
      settings: fromJS(this._default_settings())
    });

    this._save_local_view_state = debounce(
      () => this.__save_local_view_state(),
      1500
    );

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
  _init_syncstring_value(): void {
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
  _init_spellcheck(): void {
    this._spellcheck_is_supported = true;
    this._syncstring.on("save-to-disk", time =>
      this.update_misspelled_words(time)
    );
  }

  _init_syncstring(): void {
    if (this.doctype == "syncstring") {
      let fake_syncstring = false;
      if (filename_extension(this.path) === "pdf") {
        // Use a fake syncstring, since we do not directly
        // edit the PDF file itself.
        // TODO: make this a more generic mechanism.
        fake_syncstring = true;
      }
      this._syncstring = syncstring({
        project_id: this.project_id,
        path: this.path,
        cursors: true,
        before_change_hook: () => this.set_syncstring_to_codemirror(),
        after_change_hook: () => this.set_codemirror_to_syncstring(),
        fake: fake_syncstring,
        save_interval: 500,
        patch_interval: 500
      });
    } else if (this.doctype == "syncdb") {
      this._syncstring = syncdb({
        project_id: this.project_id,
        path: this.path,
        primary_keys: this.primary_keys,
        string_cols: this.string_cols
      });
    } else {
      throw Error(`invalid doctype="${this.doctype}"`);
    }

    this._syncstring.once("init", err => {
      if (err) {
        this.set_error(
          `Fatal error opening file -- ${err}.  Please try reopening the file again.`
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
    });

    this._syncstring.on("metadata-change", () => this._syncstring_metadata());
    this._syncstring.on("cursor_activity", () =>
      this._syncstring_cursor_activity()
    );

    this._syncstring.on("change", () => this._syncstring_change());
    this._syncstring.on("init", () => this._syncstring_change());

    this._syncstring.once("load-time-estimate", est => {
      return this.setState({ load_time_estimate: est });
    });

    this._syncstring.on("save-to-disk", () => {
      // incremenet save_to_disk counter, so that react components can
      // react to save_to_disk event happening.
      this.set_reload("save_to_disk");
    });

    this._init_has_unsaved_changes();
  }

  // This is currently NOT used in this base class.  It's used in other
  // editors to store shared configuration or other information.  E.g., it's
  // used by the latex editor to store the build command, master file, etc.
  _init_syncdb(
    primary_keys: string[],
    string_cols?: string[],
    path?: string
  ): void {
    const aux = aux_file(path || this.path, "syncdb");
    this._syncdb = syncdb({
      project_id: this.project_id,
      path: aux,
      primary_keys: primary_keys,
      string_cols: string_cols
    });
    this._syncdb.once("init", err => {
      if (err) {
        this.set_error(
          `Fatal error opening config "${aux}" -- ${err}.  Please try reopening the file again.`
        );
        return;
      }
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
  reload(_: string): void {
    // id not used here...
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
  set_resize(): void {
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

  close(): void {
    if (this._state == "closed") {
      return;
    }
    this._state = "closed";
    this.__save_local_view_state();
    delete this._save_local_view_state;
    if (this._key_handler != null) {
      (this.redux.getActions("page") as any).erase_active_key_handler(
        this._key_handler
      );
      delete this._key_handler;
    }
    if (this._syncstring) {
      // syncstring was initialized; be sure not to
      // loose the very last change user made!
      this.set_syncstring_to_codemirror();
      this._syncstring._save();
      this._syncstring.close();
      delete this._syncstring;
    }
    if (this._syncdb) {
      // syncstring was initialized; be sure not to
      // loose the very last change user made!
      this._syncdb.save_asap();
      this._syncdb.close();
      delete this._syncdb;
    }
    // Remove underlying codemirror doc from cache.
    cm_doc_cache.close(this.project_id, this.path);
  }

  __save_local_view_state(): void {
    if (!this.store.get("local_view_state")) return;
    localStorage[this.name] = JSON.stringify(
      this.store.get("local_view_state")
    );
  }

  _load_local_view_state(): Map<string, any> {
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
  }

  set_local_view_state(obj): void {
    if (this._state === "closed") {
      return;
    }
    // Set local state related to what we see/search for/etc.
    let local = this.store.get("local_view_state");
    for (let key in obj) {
      const value = obj[key];
      local = local.set(key, fromJS(value));
    }
    this.setState({
      local_view_state: local
    });
    this._save_local_view_state();
  }

  _is_leaf_id(id: string): boolean {
    return tree_ops.is_leaf_id(
      this.store.getIn(["local_view_state", "frame_tree"]),
      id
    );
  }

  _assert_is_leaf_id(id: string, caller: string): void {
    if (!this._is_leaf_id(id)) {
      throw Error(`${caller} -- no leaf with id "${id}"`);
    }
  }

  // Set which frame is active (unless setting is blocked).
  // Raises an exception if try to set an active_id, and there is no
  // leaf with that id.  If ignore_if_missing is true, then don't raise exception.s
  set_active_id(active_id: string, ignore_if_missing?: boolean): void {
    // Set the active_id, if necessary.
    const local: Map<string, any> = this.store.get("local_view_state");
    if (local.get("active_id") === active_id) {
      // already set -- nothing more to do
      return;
    }
    this._cm[active_id];
    if (!this._is_leaf_id(active_id)) {
      if (ignore_if_missing) return;
      throw Error(`set_active_id - no leaf with id "${active_id}"`);
    }

    // record which id was just made active.
    this._active_id_history.push(active_id);
    if (this._active_id_history.length > 100) {
      this._active_id_history = this._active_id_history.slice(
        this._active_id_history.length - 100
      );
    }

    this.setState({
      local_view_state: local.set("active_id", active_id)
    });
    this._save_local_view_state();
    // If active_id is the id of a codemirror editor,
    // save that it was focused just now; this is just a quick solution to
    // "give me last active cm" -- we will switch to something
    // more generic later -- TODO: switch to use _active_id_history
    let cm: CodeMirror.Editor | undefined = this._cm[active_id];
    if (cm) {
      (cm as any)._last_active = new Date();
      cm.focus();
    }
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
  // this function all sets it and returns that.
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
    return this.store.getIn(["local_view_state", "frame_tree"]);
  }

  _get_leaf_ids(): SetMap {
    return tree_ops.get_leaf_ids(this._get_tree());
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
  set_frame_tree(obj): void {
    this._tree_op("set", obj);
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
  }

  set_frame_tree_leafs(obj): void {
    this._tree_op("set_leafs", obj);
  }

  // Set the type of the given node, e.g., 'cm', 'markdown', etc.
  // NOTE: This is only meant to be used in derived classes right now,
  // though we have a unit test of it at this level.
  set_frame_type(id: string, type: string): void {
    // save what is currently the most recent frame of this type.
    const prev_id = this._get_most_recent_active_frame_id_of_type(type);

    this.set_frame_tree({ id, type });
    if (this._cm[id] && type != "cm") {
      // Make sure to clear cm cache in case switching type away,
      // in case the component unmount doesn't do this.
      delete this._cm[id];
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
  }

  // raises an exception if the node does not exist; always
  // call _has_frame_node first.
  _get_frame_node(id: string): Map<string, any> | undefined {
    return tree_ops.get_node(this._get_tree(), id);
  }

  // Delete the frame with given id.
  // If this is the active frame, then the new active frame becomes whichever
  // frame still exists that was most recently active before this frame.
  close_frame(id: string): void {
    if (tree_ops.is_leaf(this._get_tree())) {
      // closing the only node, so reset to default
      this.reset_local_view_state();
      return;
    }
    this._tree_op("delete_node", id);
    this.save_editor_state(id);
    if (this._cm_selections != null) {
      delete this._cm_selections[id];
    }
    delete this._cm[id];

    this.close_frame_hook(id);

    // if id is the current active_id, change to most recent one.
    if (id === this.store.getIn(["local_view_state", "active_id"])) {
      this.make_most_recent_frame_active();
    }
  }

  close_frame_hook(_:string) : void {
    // overload in derived class...
  }

  split_frame(direction: FrameDirection, id?: string, type?: string): void {
    if (!id) {
      id = this.store.getIn(["local_view_state", "active_id"]);
      if (!id) return;
    }
    const before = this._get_leaf_ids();
    this._tree_op("split_leaf", id, direction, type);
    const after = this._get_leaf_ids();
    for (let new_id in after) {
      if (!before[new_id]) {
        this.copy_editor_state(id, new_id);
        this.set_active_id(new_id);
        return;
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
    let local = this.store.get("local_view_state");
    local = local.delete("full_id");
    this.setState({ local_view_state: local });
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

  _has_unsaved_changes(): boolean {
    if (!this._syncstring) {
      return false;
    }
    return this._syncstring.has_unsaved_changes();
  }

  _has_uncommitted_changes(): boolean {
    if (!this._syncstring) {
      return false;
    }
    return this._syncstring.has_uncommitted_changes();
  }

  // Called to cause updating of the save/committed status
  // in the store. It does this a few times.  This should get
  // called whenever there's some chance this status has changed.
  // This is probably bad code,
  // and it would be nice to get rid of its async nature.
  async update_save_status(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      if (this._state === "closed") {
        continue;
      }
      this.setState({
        has_unsaved_changes: this._has_unsaved_changes(),
        has_uncommitted_changes: this._has_uncommitted_changes()
      });
      await delay(2000);
    }
  }

  _init_has_unsaved_changes(): void {
    // basically copies from tasks/actions.coffee -- opportunity to refactor
    this._syncstring.on("metadata-change", () => this.update_save_status());
    this._syncstring.on("connected", () => this.update_save_status());
  }

  _syncstring_metadata(): void {
    if (!this._syncstring) return; // need to check since this can get called by the close.
    const read_only = this._syncstring.get_read_only();
    if (read_only !== this.store.get("read_only")) {
      this.setState({ read_only });
    }
  }

  _syncstring_cursor_activity(): void {
    // TODO: for now, just for the one syncstring obviously
    // TOOD: this is probably naive and slow too...
    let cursors = Map();
    this._syncstring.get_cursors().forEach((info, account_id) => {
      if (account_id === this._syncstring._client.account_id) {
        // skip self.
        return;
      }
      info.get("locs").forEach(loc => {
        let left;
        loc = loc.set("time", info.get("time"));
        const locs = ((left = cursors.get(account_id)) != null
          ? left
          : List()
        ).push(loc);
        cursors = cursors.set(account_id, locs);
      });
    });
    if (!cursors.equals(this.store.get("cursors"))) {
      this.setState({ cursors });
    }
  }

  _syncstring_change(): void {
    if (this.update_save_status) {
      this.update_save_status();
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

  // Use internally..  Try once to save to disk.
  //  If fail (e.g., broken network) -- sets error and returns fine.
  //  If there are still unsaved changes right after save, throws exception.
  //  If worked fine and previous set error was saving, clears that error.
  async _try_to_save_to_disk(): Promise<void> {
    this.setState({ is_saving: true });
    try {
      await callback(this._syncstring.save_to_disk);
    } catch (err) {
      this.set_error(`${SAVE_ERROR} '${err}'.  ${SAVE_WORKAROUND}`);
      return;
    } finally {
      this.update_save_status();
      this.setState({ is_saving: false });
    }
    if (this.store.get("has_unsaved_changes")) {
      throw Error("not saved");
    }
    let error = this.store.get("error");
    if (error && startswith(error, SAVE_ERROR)) {
      // Save just succeeded, but there was a save error at the top, so clear it.
      this.set_error("");
    }
  }

  async _do_save(): Promise<void> {
    let that = this;
    try {
      this.set_status("Saving to disk...");
      await retry_until_success({
        f: async function() {
          /* evidently no fat arrow with async/await + typescript */
          await that._try_to_save_to_disk();
        },
        max_time: MAX_SAVE_TIME_S * 1000,
        max_delay: 6000
      });
    } catch (err) {
      console.warn(err);
      if (this._state !== "closed") {
        this.set_error(
          `${SAVE_ERROR} Despite repeated attempts, the version of the file saved to disk does not equal the version in your browser.  ${SAVE_WORKAROUND}`
        );
      }
      log_error({
        string_id: this._syncstring._string_id,
        path: this.path,
        project_id: this.project_id,
        error: "Error saving file -- has_unsaved_changes"
      });
    } finally {
      this.set_status("");
    }
  }

  async save(explicit: boolean): Promise<void> {
    if (this.is_public) {
      return;
    }
    // TODO: what about markdown, where do not want this...
    // and what about multiple syncstrings...
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
    await this._do_save();
  }

  time_travel(): void {
    this.redux.getProjectActions(this.project_id).open_file({
      path: history_path(this.path),
      foreground: true
    });
  }

  help(): void {
    const w = window.open(WIKI_HELP_URL, "_blank");
    if (w) {
      w.focus();
    }
  }

  change_font_size(delta: number, id?: string): void {
    const local = this.store.get("local_view_state");
    if (!id) {
      id = local.get("active_id");
    }
    if (!id) {
      return;
    }
    const node = tree_ops.get_node(this._get_tree(), id);
    if (!node) {
      return;
    }
    let font_size: number = node.get("font_size", get_default_font_size());
    font_size += delta;
    if (font_size < 2) {
      font_size = 2;
    }
    this.set_frame_tree({ id, font_size });
    this.focus(id);
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
    return this._get_cm(undefined, true);
  }

  _get_most_recent_cm_id(): string | undefined {
    return this._get_most_recent_active_frame_id(
      node => node.get("type") == "cm"
    );
  }

  _active_cm(): CodeMirror.Editor | undefined {
    return this._cm[this.store.getIn(["local_view_state", "active_id"])];
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
      }
      this.programmatical_goto_line(opts.line, opts.cursor);
    }

    if (opts.focus) {
      // Have to wait until after editor gets created, and
      // probably also event that caused this open.
      await delay(1);
      const cm = this._recent_cm();
      if (cm) {
        cm.focus();
      }
    }
  }

  focus(id?: string): void {
    let cm;
    if (id) {
      cm = this._cm[id];
      if (cm) {
        cm.focus();
      }
      return;
    }
    cm = this._get_cm();
    if (cm) {
      cm.focus();
    }
  }

  syncstring_save(): void {
    if (this._syncstring != null) {
      this._syncstring.save();
    }
    this.update_save_status();
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
    this._syncstring.from_str(value);
    // NOTE: above is the only place where syncstring is changed, and when *we* change syncstring,
    // no change event is fired.  However, derived classes may want to update some preview when
    // syncstring changes, so we explicitly emit a change here:
    return this._syncstring.emit("change");
  }

  set_codemirror_to_syncstring(): void {
    // NOTE: we fallback to getting the underling CM doc, in case all actual
    // cm code-editor frames have been closed (or just aren't visible).
    let cm: any = this._get_cm(undefined, true);
    if (!cm) {
      try {
        cm = this._get_doc();
      } catch (err) {
        return;
      }
    }
    cm.setValueNoJump(this._syncstring.to_str());
    this.update_save_status();
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
    this._syncstring.save();
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
    this._syncstring.save();
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
    const cm_id: string | undefined = this._get_most_recent_cm_id();
    const full_id: string | undefined = this.store.getIn([
      "local_view_state",
      "full_id"
    ]);
    if (full_id && full_id != cm_id) {
      this.unset_frame_full();
      // have to wait for cm to get created and registered.
      await delay(1);
    }

    let cm = this._get_cm(cm_id);
    if (cm == null) {
      // this case can only happen in derived classes with non-cm editors.
      this.split_frame("col", this._get_active_id(), "cm");
      // Have to wait until the codemirror editor is created and registered, which
      // is caused by component mounting.
      await delay(1);
      cm = this._recent_cm();
      if (cm == null) {
        // still failed -- give up.
        return;
      }
    }
    const pos = { line: line - 1, ch: 0 };
    const info = cm.getScrollInfo();
    cm.scrollIntoView(pos, info.clientHeight / 2);
    if (cursor) {
      cm.getDoc().setCursor(pos);
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
    const cm = this._get_cm(id);
    if (cm != null) {
      copypaste.set_buffer(cm.getDoc().getSelection());
      cm.focus();
    }
  }

  paste(id: string): void {
    const cm = this._get_cm(id);
    if (cm != null) {
      cm.getDoc().replaceSelection(copypaste.get_buffer());
      cm.focus();
    }
  }

  // big scary error shown at top
  set_error(error?: object | string, style?: ErrorStyles): void {
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

  // little status message shown at bottom.
  set_status(status): void {
    this.setState({ status });
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
      this._syncstring.save();
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

  // ATTN to enable a formatter, you also have to let it show up in the format bar
  // e.g. look into frame-editors/code-editor/editor.ts
  async format(id?: string): Promise<void> {
    const cm = this._get_cm(id);
    if (!cm) return;
    cm.focus();
    let parser;
    switch (filename_extension(this.path)) {
      case "js":
      case "jsx":
        parser = "babylon";
        break;
      case "json":
        parser = "json";
        break;
      case "ts":
      case "tsx":
        parser = "typescript";
        break;
      case "md":
        parser = "markdown";
        break;
      case "css":
        parser = "postcss";
        break;
      case "tex":
        parser = "latex";
        break;
      case "py":
        parser = "python";
        break;
      case "yml":
      case "yaml":
        parser = "yaml";
        break;
      case "r":
        parser = "r";
        break;
      case "html":
        parser = "html-tidy";
        break;
      default:
        return;
    }
    const options = {
      parser,
      tabWidth: cm.getOption("tabSize"),
      useTabs: cm.getOption("indentWithTabs")
    };
    this.set_status("Ensuring your latest changes are saved...");
    this.set_syncstring_to_codemirror();
    try {
      await callback(this._syncstring._save);
    } catch (err) {
      this.set_error(`Error saving code: \n${err}`);
      return;
    } finally {
      this.set_status("");
    }

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
}
