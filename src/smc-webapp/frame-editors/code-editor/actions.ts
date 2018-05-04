/*
Code Editor Actions
*/

const WIKI_HELP_URL = "https://github.com/sagemathinc/cocalc/wiki/editor"; // TODO -- write this
const SAVE_ERROR = "Error saving file to disk. ";
const SAVE_WORKAROUND =
  "Ensure your network connection is solid. If this problem persists, you might need to close and open this file, or restart this project in Project Settings.";
const MAX_SAVE_TIME_S = 30; // how long to retry to save (and get no unsaved changes), until giving up and showing an error.

const immutable = require("immutable");
const underscore = require("underscore");
const async = require("async");

const schema = require("smc-util/schema");

const { webapp_client } = require("smc-webapp/webapp_client");
const BaseActions = require("smc-webapp/smc-react").Actions;
const misc = require("smc-util/misc");
const copypaste = require("smc-webapp/copy-paste-buffer");
//import {create_key_handler} from "./keyboard";
const tree_ops = require("./tree-ops");

import { print_code } from "../frame-tree/print-code";

import { misspelled_words } from "./spell-check.ts";

import * as cm_doc_cache from "./doc.ts";

const { required, defaults } = misc;

export class Actions extends BaseActions {
  public _state: string;
  public _syncstring: any;
  public _key_handler: any;

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
      this._init_content();
    } else {
      this._init_syncstring();
    }

    this.setState({
      is_public,
      local_view_state: this._load_local_view_state()
    });

    this._save_local_view_state = underscore.debounce(
      () => this.__save_local_view_state(),
      1500
    );
  }

  // Init setting of content exactly once based on
  // reading file from disk via public api, or setting
  // from syncstring as a response to explicit user action.
  _init_content(): void {
    if (!this.is_public) {
      return;
    }
    // Get by loading from backend as a public file
    this.setState({ is_loaded: false });
    webapp_client.public_get_text_file({
      project_id: this.project_id,
      path: this.path,
      cb: (err, data) => {
        if (err) {
          this.set_error(`Error loading -- ${err}`);
        } else {
          this.setState({ content: data });
        }
        return this.setState({ is_loaded: true });
      }
    });
  }

  // Init setting of value whenever syncstring changes -- only used in derived classes
  _init_syncstring_value(): void {
    this._syncstring.on("change", () => {
      this.setState({ value: this._syncstring.to_str() });
    });
  }

  // Init spellchecking whenever syncstring saves -- only used in derived classes, where
  // spelling makes sense...
  _init_spellcheck(): void {
    this.update_misspelled_words();
    this._syncstring.on("save-to-disk", time =>
      this.update_misspelled_words(time)
    );
  }

  reload(): void {
    if (!this.store.get("is_loaded")) {
      // currently in the process of loading
      return;
    }
    // this sets is_loaded to false... loads, then sets is_loaded to true.
    this._init_content();
  }

  _init_syncstring(): void {
    this._syncstring = webapp_client.sync_string({
      id: schema.client_db.sha1(this.project_id, this.path),
      project_id: this.project_id,
      path: this.path,
      cursors: true,
      before_change_hook: () => this.set_syncstring_to_codemirror(),
      after_change_hook: () => this.set_codemirror_to_syncstring()
    });

    this._syncstring.once("init", err => {
      if (err) {
        this.set_error(`Error opening -- ${err}`);
      }
      this._syncstring_metadata();
      if (!this.store.get("is_loaded")) {
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

  set_reload(type: string): void {
    const reload = this.store.get("reload", immutable.Map());
    this.setState({
      reload: reload.set(type, this._syncstring.hash_of_saved_version())
    });
  }

  set_resize(): void {
    this.setState({
      resize: this.store.get("resize", 0) + 1
    });
  }

  close(): void {
    if (this._state == "closed") {
      return;
    }
    this._state = "closed";
    this.__save_local_view_state();
    delete this._save_local_view_state;
    if (this._key_handler != null) {
      this.redux.getActions("page").erase_active_key_handler(this._key_handler);
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
    // Remove underlying codemirror doc from cache.
    cm_doc_cache.close(this.project_id, this.path);
  }

  __save_local_view_state(): void {
    if (!this.store.get("local_view_state")) return;
    localStorage[this.name] = JSON.stringify(
      this.store.get("local_view_state")
    );
  }

  _load_local_view_state() {
    let local_view_state;
    const x = localStorage[this.name];
    if (x != null) {
      local_view_state = immutable.fromJS(JSON.parse(x));
    }
    if (local_view_state == null) {
      local_view_state = immutable.Map();
    }

    if (!local_view_state.has("version")) {
      // may use to deprecate in case we change format.
      local_view_state = local_view_state.set("version", 1);
    }

    if (!local_view_state.has("editor_state")) {
      local_view_state = local_view_state.set("editor_state", immutable.Map());
    }

    if (!local_view_state.has("font_size")) {
      let left;
      const font_size =
        (left = __guard__(this.redux.getStore("account"), x1 =>
          x1.get("font_size")
        )) != null
          ? left
          : 14;
      local_view_state = local_view_state.set("font_size", font_size);
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
      local = local.set(key, immutable.fromJS(value));
    }
    this.setState({
      local_view_state: local
    });
    this._save_local_view_state();
  }

  set_active_id(active_id, block_ms): void {
    if (this._ignore_set_active_id) {
      return;
    }
    if (block_ms) {
      this._ignore_set_active_id = true;
      setTimeout(() => {
        this._ignore_set_active_id = false;
      }, block_ms);
    }
    const local = this.store.get("local_view_state");
    if ((local != null ? local.get("active_id") : undefined) === active_id) {
      // already set -- nothing more to do
      return;
    }
    if (
      tree_ops.is_leaf_id(
        local != null ? local.get("frame_tree") : undefined,
        active_id
      )
    ) {
      this.setState({
        local_view_state: this.store
          .get("local_view_state")
          .set("active_id", active_id)
      });
      this._save_local_view_state();
      // If active_id is the id of a codemirror editor,
      // save when; this is just a quick solution to
      // "give me last active cm" -- we will switch to something
      // more generic later.
      __guard__(
        this._cm != null ? this._cm[active_id] : undefined,
        x => (x._last_active = new Date())
      );
      this.focus();
    }
  }

  _get_tree() {
    return this.store.getIn(["local_view_state", "frame_tree"]);
  }

  _get_leaf_ids() {
    return tree_ops.get_leaf_ids(this._get_tree());
  }

  _tree_op(op, ...args): void {
    let local = this.store.get("local_view_state");
    if (local == null) {
      return;
    }
    const t0 = local != null ? local.get("frame_tree") : undefined;
    if (t0 == null) {
      return;
    }
    const f = tree_ops[op];
    if (f == null) {
      throw Error(`unknown tree op '${op}'`);
    }
    const t1 = f(t0, ...args);
    if (t1 !== t0) {
      if (op === "delete_node") {
        if (!tree_ops.is_leaf_id(t1, local.get("active_id"))) {
          local = local.set("active_id", tree_ops.get_some_leaf_id(t1));
        }
        if (!tree_ops.is_leaf_id(t1, local.get("full_id"))) {
          local = local.delete("full_id");
        }
      }
      this.setState({ local_view_state: local.set("frame_tree", t1) });
      this._save_local_view_state();
    }
  }

  _default_frame_tree() {
    let frame_tree = immutable.fromJS(this._raw_default_frame_tree());
    frame_tree = tree_ops.assign_ids(frame_tree);
    frame_tree = tree_ops.ensure_ids_are_unique(frame_tree);
    return frame_tree;
  }

  // define this in derived classes.
  _raw_default_frame_tree() {
    return { type: "cm" };
  }

  set_frame_tree(obj) {
    return this._tree_op("set", obj);
  }

  reset_frame_tree() {
    let local = this.store.get("local_view_state");
    local = local.set("frame_tree", this._default_frame_tree());
    this.setState({ local_view_state: local });
    this._save_local_view_state();
  }

  set_frame_tree_leafs(obj) {
    return this._tree_op("set_leafs", obj);
  }

  // This is only used in derived classes right now
  set_frame_type(id, type) {
    return this.set_frame_tree({ id, type });
  }

  _get_frame_node(id) {
    return tree_ops.get_node(this._get_tree(), id);
  }

  close_frame(id) {
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
    if (this._cm != null) {
      delete this._cm[id];
    }
    return setTimeout(() => this.focus(), 1);
  }

  split_frame(direction, id, type) {
    const ids0 = this._get_leaf_ids();
    this._tree_op(
      "split_leaf",
      id != null ? id : this.store.getIn(["local_view_state", "active_id"]),
      direction,
      type
    );
    const object = this._get_leaf_ids();
    for (let i in object) {
      if (!ids0[i]) {
        this.copy_editor_state(id, i);
        id = i; // this is a new id
        break;
      }
    }
    // The block_ms=1 here is since the set can cause a bunch of rendering to happen
    // which causes some other cm to focus, which changes the id.  Instead of a flicker
    // and changing it back, we just prevent any id change for 1ms, which covers
    // the render cycle.
    return this.set_active_id(id, 1);
  }

  set_frame_full(id) {
    let local = this.store.get("local_view_state").set("full_id", id);
    if (id != null) {
      local = local.set("active_id", id);
    }
    this.setState({ local_view_state: local });
    this._save_local_view_state();
    return setTimeout(() => this.focus(), 1);
  }

  save_editor_state(id, new_editor_state?: any) {
    let left;
    if (this._state === "closed") {
      return;
    }
    const local = this.store.get("local_view_state");
    if (local == null) {
      return;
    }
    let editor_state =
      (left = local.get("editor_state")) != null ? left : immutable.Map();
    if (new_editor_state == null) {
      if (!editor_state.has(id)) {
        return;
      }
      editor_state = editor_state.delete(id);
    } else {
      editor_state = editor_state.set(id, immutable.fromJS(new_editor_state));
    }
    this.setState({
      local_view_state: local.set("editor_state", editor_state)
    });
    return this._save_local_view_state();
  }

  copy_editor_state(id1, id2) {
    const info = this.store.getIn(["local_view_state", "editor_state", id1]);
    if (info != null) {
      return this.save_editor_state(id2, info);
    }
  }

  /* enable_key_handler() {
    if (this._state === "closed") {
      return;
    }
    if (this._key_handler == null) {
      this._key_handler = create_key_handler(this);
    }
    return this.redux
      .getActions("page")
      .set_active_key_handler(this._key_handler, this.project_id, this.path);
  }

  disable_key_handler() {
    return this.redux
      .getActions("page")
      .erase_active_key_handler(this._key_handler);
  }
  */

  _has_unsaved_changes() {
    //@_syncstring?.has_unsaved_changes()
    const hash_saved =
      this._syncstring != null
        ? this._syncstring.hash_of_saved_version()
        : undefined;
    const hash_live = misc.hash_string(
      __guard__(this._get_cm(), x => x.getValue())
    );
    if (hash_saved == null || hash_live == null) {
      // don't know yet...
      return;
    }
    return hash_live !== hash_saved;
  }

  _init_has_unsaved_changes() {
    // basically copies from tasks/actions.coffee -- opportunity to refactor
    const do_set = () => {
      return this.setState({
        has_unsaved_changes: this._has_unsaved_changes(),
        has_uncommitted_changes:
          this._syncstring != null
            ? this._syncstring.has_uncommitted_changes()
            : undefined
      });
    };
    const f = () => {
      do_set();
      return setTimeout(do_set, 3000);
    };
    this.update_save_status = f; // underscore.debounce(f, 500, true)
    this._syncstring.on("metadata-change", this.update_save_status);
    return this._syncstring.on("connected", this.update_save_status);
  }

  _syncstring_metadata() {
    if (this._syncstring == null) {
      return;
    }
    const read_only = this._syncstring.get_read_only();
    if (read_only !== this.store.get("read_only")) {
      return this.setState({ read_only });
    }
  }

  _syncstring_cursor_activity() {
    // TODO: for now, just for the one syncstring obviously
    // TOOD: this is probably naive and slow too...
    let cursors = immutable.Map();
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
          : immutable.List()
        ).push(loc);
        cursors = cursors.set(account_id, locs);
      });
    });
    if (!cursors.equals(this.store.get("cursors"))) {
      return this.setState({ cursors });
    }
  }

  _syncstring_change() {
    if (this.update_save_status) this.update_save_status();
  }

  set_cursor_locs(locs = [], side_effect) {
    if (locs.length === 0) {
      // don't remove on blur -- cursor will fade out just fine
      return;
    }
    return this._syncstring != null
      ? this._syncstring.set_cursor_locs(locs, side_effect)
      : undefined;
  }

  delete_trailing_whitespace() {
    const cm = this._get_cm();
    if (cm == null) {
      return;
    }
    const omit_lines = {};
    __guard__(this._syncstring.get_cursors(), x =>
      x.map((x, _) => {
        return __guard__(x.get("locs"), x1 =>
          x1.map(loc => {
            const y = loc.get("y");
            if (y != null) {
              return (omit_lines[y] = true);
            }
          })
        );
      })
    );
    return cm.delete_trailing_whitespace({ omit_lines });
  }

  _do_save() {
    const f = cb => {
      // err if NO error reported, but has unsaved changes.
      this.setState({ is_saving: true });
      return this._syncstring != null
        ? this._syncstring.save_to_disk(err => {
            this.setState({ is_saving: false });
            this.update_save_status();
            if (err) {
              this.update_save_status();
              this.set_error(`${SAVE_ERROR} '${err}'.  ${SAVE_WORKAROUND}`);
              return cb();
            } else {
              const done = !this.store.get("has_unsaved_changes");
              if (
                done &&
                misc.startswith(this.store.get("error"), SAVE_ERROR)
              ) {
                this.set_error("");
              }
              return cb(!done);
            }
          })
        : undefined;
    };

    return misc.retry_until_success({
      f,
      max_time: MAX_SAVE_TIME_S * 1000,
      max_delay: 6000,
      cb: err => {
        if (err) {
          console.warn(err);
          this.set_error(
            `${SAVE_ERROR} Despite repeated attempts, the version of the file saved to disk does not equal the version in your browser.  ${SAVE_WORKAROUND}`
          );
          return webapp_client.log_error({
            string_id:
              this._syncstring != null
                ? this._syncstring._string_id
                : undefined,
            path: this.path,
            project_id: this.project_id,
            error: "Error saving file -- has_unsaved_changes"
          });
        }
      }
    });
  }

  save(explicit) {
    if (this.is_public) {
      return;
    }
    // TODO: what about markdown, where do not want this...
    // and what about multiple syncstrings...
    // TODO: Maybe just move this to some explicit menu of actions, which also includes
    // several other formatting actions.
    // Doing this automatically is fraught with error, since cursors aren't precise...
    if (
      explicit &&
      __guard__(this.redux.getStore("account"), x =>
        x.getIn(["editor_settings", "strip_trailing_whitespace"])
      )
    ) {
      this.delete_trailing_whitespace();
    }
    this.set_syncstring_to_codemirror();
    this._do_save();
    if (explicit) {
      return __guard__(this._active_cm(), x1 => x1.focus());
    }
  }

  time_travel() {
    return this.redux.getProjectActions(this.project_id).open_file({
      path: misc.history_path(this.path),
      foreground: true
    });
  }

  help() {
    const w = window.open(WIKI_HELP_URL, "_blank");
    if (w) {
      w.focus();
    }
  }

  change_font_size(delta, id) {
    const local = this.store.getIn("local_view_state");
    if (id == null) {
      id = local.get("active_id");
    }
    let font_size = __guard__(
      tree_ops.get_node(local.get("frame_tree"), id),
      x => x.get("font_size")
    );
    if (font_size == null) {
      let left;
      font_size =
        (left = __guard__(this.redux.getStore("account"), x1 =>
          x1.get("font_size")
        )) != null
          ? left
          : 14;
    }
    font_size += delta;
    if (font_size < 2) {
      font_size = 2;
    }
    this.set_frame_tree({ id, font_size });
    return this._cm[id] != null ? this._cm[id].focus() : undefined;
  }

  increase_font_size(id) {
    return this.change_font_size(1, id);
  }

  decrease_font_size(id) {
    return this.change_font_size(-1, id);
  }

  set_font_size(id, font_size) {
    if (id == null) {
      return;
    }
    this.set_frame_tree({ id, font_size });
    return this._cm[id] != null ? this._cm[id].focus() : undefined;
  }

  set_cm(id, cm) {
    const sel =
      this._cm_selections != null ? this._cm_selections[id] : undefined;
    if (sel != null) {
      // restore saved selections (cursor position, selected ranges)
      cm.setSelections(sel);
    }

    if (this._cm != null && misc.len(this._cm) > 0) {
      this._cm[id] = cm;
      return;
    }

    // Creating codemirror for the first time -- need to initialize it.
    this._cm = { [id]: cm };
    return this.set_codemirror_to_syncstring();
  }

  unset_cm(id) {
    const cm = this._get_cm(id);
    if (cm == null) {
      return;
    }
    if (
      tree_ops.has_id(this.store.getIn(["local_view_state", "frame_tree"]), id)
    ) {
      // Save the selections, in case this editor
      // is displayed again.
      if (this._cm_selections == null) {
        this._cm_selections = {};
      }
      this._cm_selections[id] = cm.listSelections();
    }
    return this._cm != null ? delete this._cm[id] : undefined;
  }

  // 1. if id given, returns cm with given id if id
  // 2. if no id given:
  //   if recent is true, return most recent cm
  //   if recent is not given, return some cm
  _get_cm(id?: string, recent?: boolean) {
    let v;
    if (this._cm == null) {
      this._cm = {};
    }
    if (id) {
      const cm = this._cm[id] != null ? this._cm[id] : this._active_cm();
      if (cm != null) {
        return cm;
      }
    }
    if (recent) {
      // TODO: rewrite this (and code in set_active_id) to work generically
      // for any frame tree leaf type.
      v = (() => {
        const result: any[] = [];
        for (let _ in this._cm) {
          const obj = this._cm[_];
          result.push(obj);
        }
        return result;
      })();
      if (v.length === 0) {
        return;
      }
      v.sort(
        (a, b) =>
          -misc.cmp_Date(
            a._last_active != null ? a._last_active : 0,
            b._last_active != null ? b._last_active : 0
          )
      );
      return v[0];
    } else {
      for (id in this._cm) {
        v = this._cm[id];
        return v;
      }
    }
  }

  _get_doc() {
    return cm_doc_cache.get_doc(this.project_id, this.path);
  }

  _recent_cm() {
    return this._get_cm(undefined, true);
  }

  _active_cm() {
    return this._cm != null
      ? this._cm[this.store.getIn(["local_view_state", "active_id"])]
      : undefined;
  }

  // Open a code editor, optionally at the given line.
  open_code_editor(opts): void {
    opts = defaults(opts, {
      focus: true,
      line: undefined,
      file: undefined, // not supported yet
      cursor: true, // set cursor to line position (not just scroll to it)
      direction: "col"
    }); // 'row' or 'col'

    // TODO -- opts.file is ignored

    const must_create = this._get_cm() == null;
    if (must_create) {
      // split and make a cm
      this.split_frame(opts.direction, undefined, "cm");
    }

    if (opts.line) {
      const f = () => this.programmatical_goto_line(opts.line, opts.cursor);
      if (must_create) {
        // Have to wait until after editor gets created
        setTimeout(f, 1);
      } else {
        f();
      }
    }

    if (opts.focus) {
      // Have to wait until after editor gets created, and
      // probably also event that caused this open.
      setTimeout(() => {
        const cm = this._recent_cm();
        if (cm) {
          cm.focus();
        }
      }, 1);
    }
  }

  focus() {
    const cm = this._get_cm();
    if (cm) {
      cm.focus();
    }
  }

  syncstring_save() {
    if (this._syncstring != null) {
      this._syncstring.save();
    }
    return this.update_save_status();
  }

  set_syncstring_to_codemirror(id?: string) {
    const cm = this._get_cm(id);
    if (cm == null || this._syncstring == null) {
      return;
    }
    return this.set_syncstring(cm.getValue());
  }

  set_syncstring(value) {
    this._syncstring.from_str(value);
    // NOTE: above is the only place where syncstring is changed, and when *we* change syncstring,
    // no change event is fired.  However, derived classes may want to update some preview when
    // syncstring changes, so we explicitly emit a change here:
    return this._syncstring.emit("change");
  }

  set_codemirror_to_syncstring() {
    let left;
    if (this._syncstring == null) {
      return;
    }
    // NOTE: we fallback to getting the underling CM doc, in case all actual
    // cm code-editor frames have been closed (or just aren't visible).
    const cm = (left = this._get_cm()) != null ? left : this._get_doc();
    if (cm == null) {
      return;
    }
    cm.setValueNoJump(this._syncstring.to_str());
    return this.update_save_status();
  }

  exit_undo_mode() {
    return this._syncstring != null
      ? this._syncstring.exit_undo_mode()
      : undefined;
  }

  // per-session sync-aware undo
  undo(id) {
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
    return this._syncstring.save();
  }

  // per-session sync-aware redo
  redo(id) {
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
    return this._syncstring.save();
  }

  find(id) {
    return __guard__(this._get_cm(id), x => x.execCommand("find"));
  }

  find_next(id) {
    return __guard__(this._get_cm(id), x => x.execCommand("findNext"));
  }

  find_prev(id) {
    return __guard__(this._get_cm(id), x => x.execCommand("findPrev"));
  }

  replace(id) {
    return __guard__(this._get_cm(id), x => x.execCommand("replace"));
  }

  goto_line(id) {
    return __guard__(this._get_cm(id), x => x.execCommand("jumpToLine"));
  }

  auto_indent(id) {
    return __guard__(this._get_cm(id), x => x.execCommand("indentAuto"));
  }

  // used when clicking on other user avatar,
  // in the latex editor, etc.
  // If cursor is given, moves the cursor to the line too.
  programmatical_goto_line(line, cursor, focus?: boolean) {
    const cm = this._recent_cm();
    if (cm == null) {
      return;
    }
    const pos = { line: line - 1, ch: 0 };
    const info = cm.getScrollInfo();
    cm.scrollIntoView(pos, info.clientHeight / 2);
    if (cursor) {
      cm.setCursor(pos);
    }
    if (focus) {
      return cm.focus();
    }
  }

  cut(id) {
    const cm = this._get_cm(id);
    if (cm != null) {
      copypaste.set_buffer(cm.getSelection());
      cm.replaceSelection("");
      return cm.focus();
    }
  }

  copy(id) {
    const cm = this._get_cm(id);
    if (cm != null) {
      copypaste.set_buffer(cm.getSelection());
      return cm.focus();
    }
  }

  paste(id) {
    const cm = this._get_cm(id);
    if (cm != null) {
      cm.replaceSelection(copypaste.get_buffer());
      return cm.focus();
    }
  }

  // big scary error shown at top
  set_error(error?: object | string) {
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
  }

  // little status message shown at bottom.
  set_status(status) {
    return this.setState({ status });
  }

  print(id): void {
    const cm = this._get_cm(id);
    if (!cm) {
      return; // nothing to print...
    }
    try {
      print_code({
        value: cm.getValue(),
        options: cm.options,
        path: this.path,
        font_size: __guard__(this._get_frame_node(id), x => x.get("font_size"))
      });
    } catch (err) {
      this.set_error(err);
    }
    return cm.focus();
  }

  // Runs spellchecker on the backend last saved file, then
  // sets the mispelled_words part of the state to the immutable
  // Set of those words.  They can then be rendered by any editor/view.
  async update_misspelled_words(time?: number): Promise<void> {
    const hash = this._syncstring.hash_of_saved_version();
    if (hash === this._update_misspelled_words_last_hash) {
      // same file as before, so do not bother.
      return;
    }
    this._update_misspelled_words_last_hash = hash;
    try {
      const words: string[] = await misspelled_words({
        project_id: this.project_id,
        path: this.path,
        time
      });
      const x = immutable.Set(words);
      if (!x.equals(this.store.get("misspelled_words"))) {
        this.setState({ misspelled_words: x });
      }
    } catch (err) {
      this.set_error(err);
    }
  }

  format_action(cmd, args) {
    const cm = this._get_cm();
    if (cm == null) {
      // format bar only makes sense when some cm is there...
      return;
    }
    /*  -- disabled; using codemirror pluging for now instead
        if cmd in ['link', 'image', 'SpecialChar']
            if @store.getIn(['format_bar', cmd])?
                * Doing the formatting action
                @format_dialog_action(cmd)
            else
                * This causes a dialog to appear, which will set relevant part of store and call format_action again
                @set_format_bar(cmd, {})
            return
        */
    return cm.edit_selection({
      cmd,
      args,
      cb: () => {
        if (this._state !== "closed") {
          cm.focus();
          this.set_syncstring_to_codemirror();
          return this._syncstring.save();
        }
      }
    });
  }

  set_gutter_marker(opts) {
    let left;
    opts = defaults(opts, {
      id: undefined, // user-specified unique id for this gutter marker; autogenerated if not given
      line: required, // base-0 line number where gutter is initially positions
      gutter_id: required, // css class name of the gutter
      component: required
    }); // react component that gets rendered as the gutter marker
    if (opts.id == null) {
      opts.id = misc.uuid();
    }
    const gutter_markers =
      (left = this.store.get("gutter_markers")) != null
        ? left
        : immutable.Map();
    let info = immutable.fromJS({ line: opts.line, gutter_id: opts.gutter_id });
    info = info.set("component", opts.component);
    return this.setState({ gutter_markers: gutter_markers.set(opts.id, info) });
  }

  delete_gutter_marker(id) {
    const gutter_markers = this.store.get("gutter_markers");
    if (gutter_markers != null ? gutter_markers.has(id) : undefined) {
      return this.setState({ gutter_markers: gutter_markers.delete(id) });
    }
  }

  // clear all gutter markers in the given gutter
  clear_gutter(gutter_id) {
    let left;
    let gutter_markers =
      (left = this.store.get("gutter_markers")) != null
        ? left
        : immutable.Map();
    const before = gutter_markers;
    gutter_markers.map((info, id) => {
      if (info.get("gutter_id") === gutter_id) {
        gutter_markers = gutter_markers.delete(id);
      }
    });
    if (before !== gutter_markers) {
      return this.setState({ gutter_markers });
    }
  }

  // The GutterMarker component calls this to save the line handle to the gutter marker,
  // which is needed for tracking the gutter location.
  // Nothing else should directly call this.
  _set_gutter_handle(id, handle) {
    // id     = user-specified unique id for this gutter marker
    // handle = determines current line number of gutter marker
    const gutter_markers = this.store.get("gutter_markers");
    if (gutter_markers == null) {
      return;
    }
    const info = gutter_markers.get(id);
    if (info == null) {
      return;
    }
    return this.setState({
      gutter_markers: gutter_markers.set(id, info.set("handle", handle))
    });
  }

  format(id?: string) {
    let parser;
    if (this._syncstring == null) {
      return;
    }
    const cm = this._get_cm(id);
    if (cm == null) {
      return;
    }
    cm.focus();
    const ext = misc.filename_extension(this.path);
    switch (ext) {
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
      default:
        return;
    }
    const options = {
      parser,
      tabWidth: cm.getOption("tabSize"),
      useTabs: cm.getOption("indentWithTabs")
    };
    return async.series(
      [
        cb => {
          this.set_status("Ensuring your latest changes are saved...");
          this.set_syncstring_to_codemirror();
          return this._syncstring._save(cb);
        },
        cb => {
          this.set_status("Running code formatter...");
          return webapp_client.prettier({
            project_id: this.project_id,
            path: this.path,
            options,
            cb: (err, resp) => {
              let error;
              this.set_status("");
              if (err) {
                error = `Error formatting code: \n${err}`;
              } else if (resp.status === "error") {
                const start = __guard__(
                  resp.error != null ? resp.error.loc : undefined,
                  x => x.start
                );
                if (start != null) {
                  error = `Syntax error prevented formatting code (possibly on line ${
                    start.line
                  } column ${start.column}) -- fix and run again.`;
                } else {
                  error = "Syntax error prevented formatting code.";
                }
              } else {
                error = undefined;
              }
              this.setState({ error: "" });
              return cb(error);
            }
          });
        }
      ],
      err => {
        if (err) {
          return this.setState({ error: err });
        }
      }
    );
  }

  test() {
    return {
      test: require("./test"),
      cm: this._get_cm()
    };
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
