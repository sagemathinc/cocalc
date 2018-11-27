/*


*/

type Patch = any;

import { Map } from "immutable";
import { once } from "../../async-utils";
import { filename_extension } from "../../misc2";

const { Evaluator } = require("../../syncstring_evaluator");

export interface SyncOpts {
  project_id: string;
  path: required;
  client: Client;
  from_str: (string) => Document;

  save_interval?: number;
  cursor_interval?: number;
  patch_interval?: number;
  file_use_interval?: number;
  string_id?: string;
  cursors?: boolean;
  doctype?: any;
  from_patch_str?: (string) => Patch;
}

type State = "init" | "ready" | "closed";

class SyncDoc extends EventEmitter {
  private project_id: string; // project_id that contains the doc
  private path: required; // path of the file corresponding to the doc
  private client: Client;
  private from_str: (string) => Document; // creates a doc from a string.
  private string_id: string;

  private save_interval: number = 2000;
  private cursor_interval: number = 1000;
  private patch_interval: number = 1500; // debouncing of incoming upstream patches

  // file_use_interval throttle: default is 60s for everything
  // except .sage-chat files, where it is 10s.
  private file_use_interval: number;

  private cursors: boolean = false; // if true, also provide cursor tracking functionality
  private doctype: any = undefined; // optional object describing document constructor (used by project to open file)
  private from_patch_str: (string) => Patch = JSON.parse;

  private state: State = "init";

  private syncstring_table: SyncTable;
  private patches_table: SyncTable;
  private cursors_table: SyncTable;
  private throttled_set_cursor_locs: Function;

  // patches that this client made during this editing session.
  private my_patches: { [time: string]: Patch } = {};

  constructor(opts: SyncOpts) {
    super();
    if (opts.string_id === undefined) {
      this.string_id = schema.client_db.sha1(opts.project_id, opts.path);
    } else {
      this.string_id = opts.string_id;
    }

    for (let field of [
      "project_id",
      "path",
      "client",
      "from_str",
      "save_interval",
      "cursor_interval",
      "patch_interval",
      "file_use_interval",
      "cursors",
      "doctype",
      "from_patch_str"
    ]) {
      if (opts[field] != undefined) {
        this[field] = opts[field];
      }
    }

    this.setMaxListeners(100);
    this.init();
  }

  /*
  Initialize everything.
  This should be called *exactly* once by the constructor,
  and no other time.  It tries to set everything up.  If
  the browser isn't connected to the network, it'll wait
  until it is (however long, etc.).  If this fails, it closes
  this SyncDoc.
  */
  private async init(): Promise<void> {
    this.assert_not_closed();

    try {
      await this.init_all();
    } catch (err) {
      this.emit("init", err);
      this.emit("error", err);
      this.close();
      return;
    }

    // Success -- everything perfectly initialized with no issues.
    this.set_state("ready");
    this.emit("change"); // from nothing to something.
  }

  private init_throttled_cursors(): void {
    if (!opts.cursors) {
      return;
    }
    // Initialize throttled cursors functions
    function set_cursor_locs(locs, side_effect: boolean): void {
      if (
        this.state === 'closed' ||
        this.last_user_change == null ||
        new Date() - this.last_user_change >= 1000 * 5 * 60
      ) {
        /* We ignore setting cursor location in case the
           user hasn't actually modified this file recently
           (5 minutes).  It's annoying to just see a cursor
           moving around for a user who isn't doing
           anything, and this also prevents bugs in
           side_effect detection (which is super hard to
           get right).
        */
        return;
      }
      const x = {
        string_id: this.string_id,
        user_id: this.user_id,
        locs
      };
      if (!side_effect) {
        x.time = this.client.server_time();
      }
      if (this.cursors_table != null) {
        this.cursors_table.set(x, "none");
      }
    }
    this.throttled_set_cursor_locs = underscore.throttle(
      set_cursor_locs.bind(this),
      this.cursor_interval,
      { leading: true, trailing: true }
    );
  }

  private init_file_use_interval(): void {
    if (!(opts.file_use_interval && this.client.is_user())) {
      return;
    }
    let action;
    const is_chat = misc.filename_extension(this._path) === "sage-chat";
    if (is_chat) {
      action = "chat";
    } else {
      action = "edit";
    }
    this._last_user_change = misc.minutes_ago(60); // initialize
    const file_use = () => {
      // We ONLY count this and record that the file was edited if there was an actual
      // change record in the patches log, by this user, since last time.
      let user_is_active = false;
      for (let tm in this._my_patches) {
        const _ = this._my_patches[tm];
        if (new Date(parseInt(tm)) > this._last_user_change) {
          user_is_active = true;
          break;
        }
      }
      if (!user_is_active) {
        return;
      }
      this._last_user_change = new Date();
      return this.client.mark_file({
        project_id: this._project_id,
        path: this._path,
        action,
        ttl: opts.file_use_interval
      });
    };

    this.on(
      "user_change",
      underscore.throttle(file_use, opts.file_use_interval, true)
    );
  }

  private set_state(state: State): void {
    this.state = state;
    this.emit("state", state);
  }

  private assert_not_closed(): void {
    if (this.state === "closed") {
      throw Error("closed");
    }
  }

  set_doc(value) {
    if ((value != null ? value.apply_patch : undefined) == null) {
      // Do a sanity check -- see https://github.com/sagemathinc/cocalc/issues/1831
      throw Error(
        "value must be a document object with apply_patch, etc., methods"
      );
    }
    this._doc = value;
  }

  // Reconnect all the syncstring and patches tables, which
  // define this syncstring.
  reconnect() {
    if (this.syncstring_table != null) {
      this.syncstring_table.reconnect();
    }
    return this.patches_table != null
      ? this.patches_table.reconnect()
      : undefined;
  }

  // Return underlying document, or undefined if document hasn't been set yet.
  get_doc() {
    return this._doc;
  }

  // Set this doc from its string representation.
  from_str(value) {
    this._doc = this._from_str(value);
  }

  // Return string representation of this doc, or undefined if the doc hasn't been set yet.
  to_str() {
    return __guardMethod__(this._doc, "to_str", o => o.to_str());
  }

  // Used for internal debug logging
  dbg(f) {
    return this.client.dbg(`SyncString(path='${this._path}').${f}:`);
  }

  // Version of the document at a given point in time; if no
  // time specified, gives the version right now.
  // If not fully initialized, will return undefined
  version(time) {
    return this._patch_list != null ? this._patch_list.value(time) : undefined;
  }

  // Compute version of document if the patches at the given times were simply not included.
  // This is a building block that is used for implementing undo functionality for client editors.
  version_without(times) {
    return this._patch_list.value(undefined, undefined, times);
  }

  revert(version) {
    this.set_doc(this.version(version));
  }

  // Undo/redo public api.
  //   Calling this.undo and this.redo returns the version of the document after
  //   the undo or redo operation, but does NOT otherwise change anything!
  //   The caller can then do what they please with that output (e.g., update the UI).
  //   The one state change is that the first time calling this.undo or this.redo switches
  //   into undo/redo state in which additional calls to undo/redo
  //   move up and down the stack of changes made by this user during this session.
  //   Call this.exit_undo_mode() to exit undo/redo mode.
  //   Undo and redo *only* impact changes made by this user during this session.
  //   Other users edits are unaffected, and work by this same user working from another
  //   browser tab or session is also unaffected.
  //
  //   Finally, undo of a past patch by definition means "the state of the document"
  //   if that patch was not applied.  The impact of undo is NOT that the patch is
  //   removed from the patch history; instead it just returns a document here that
  //   the client can do something with, which may result in future patches.   Thus
  //   clients could implement a number of different undo strategies without impacting
  //   other clients code at all.
  undo() {
    let state = this._undo_state;
    if (state == null) {
      // not in undo mode
      state = this._undo_state = this._init_undo_state();
    }
    if (state.pointer === state.my_times.length) {
      // pointing at live state (e.g., happens on entering undo mode)
      const value = this.version(); // last saved version
      const live = this._doc;
      if (value == null) {
        // may be undefined if everything not fully loaded or being reconnected -- in this case, just skip
        // doing the undo, which would be dangerous, e.g., value.make_patch(live) is not going to work.
        // See https://github.com/sagemathinc/cocalc/issues/2586
        return live;
      }
      if (!live.is_equal(value)) {
        // User had unsaved changes, so last undo is to revert to version without those.
        state.final = value.make_patch(live); // live redo if needed
        state.pointer -= 1; // most recent timestamp
        return value;
      } else {
        // User had no unsaved changes, so last undo is version without last saved change.
        const tm = state.my_times[state.pointer - 1];
        state.pointer -= 2;
        if (tm != null) {
          state.without.push(tm);
          return this.version_without(state.without);
        } else {
          // no undo information during this session
          return value;
        }
      }
    } else {
      // pointing at particular timestamp in the past
      if (state.pointer >= 0) {
        // there is still more to undo
        state.without.push(state.my_times[state.pointer]);
        state.pointer -= 1;
      }
      return this.version_without(state.without);
    }
  }

  redo() {
    const state = this._undo_state;
    if (state == null) {
      // nothing to do but return latest live version
      return this.get_doc();
    }
    if (state.pointer === state.my_times.length) {
      // pointing at live state -- nothing to do
      return this.get_doc();
    } else if (state.pointer === state.my_times.length - 1) {
      // one back from live state, so apply unsaved patch to live version
      const value = this.version();
      if (value == null) {
        // see remark in undo -- do nothing
        return this.get_doc();
      }
      state.pointer += 1;
      return value.apply_patch(state.final);
    } else {
      // at least two back from live state
      state.without.pop();
      state.pointer += 1;
      if (state.final == null && state.pointer === state.my_times.length - 1) {
        // special case when there wasn't any live change
        state.pointer += 1;
      }
      return this.version_without(state.without);
    }
  }

  in_undo_mode() {
    return this._undo_state != null;
  }

  exit_undo_mode() {
    return delete this._undo_state;
  }

  _init_undo_state() {
    if (this._undo_state != null) {
      this._undo_state;
    }
    const state = (this._undo_state = {});
    state.my_times = misc
      .keys(this._my_patches)
      .map(x => new Date(parseInt(x)));
    state.my_times.sort(misc.cmp_Date);
    state.pointer = state.my_times.length;
    state.without = [];
    return state;
  }

  // Make it so the local hub project will automatically save the file to disk periodically.
  init_project_autosave() {
    // Do not autosave sagews until https://github.com/sagemathinc/cocalc/issues/974 is resolved.
    if (
      !LOCAL_HUB_AUTOSAVE_S ||
      !this.client.is_project() ||
      this._project_autosave != null ||
      misc.endswith(this._path, ".sagews")
    ) {
      return;
    }
    const dbg = this.dbg("autosave");
    dbg("initializing");
    const f = () => {
      //dbg('checking')
      if (this.hash_of_saved_version() != null && this.has_unsaved_changes()) {
        //dbg("doing")
        return this._save_to_disk();
      }
    };
    return (this._project_autosave = setInterval(
      f,
      LOCAL_HUB_AUTOSAVE_S * 1000
    ));
  }

  // account_id of the user who made the edit at
  // the given point in time.
  account_id(time) {
    return this._users[this.user_id(time)];
  }

  // Approximate time when patch with given timestamp was
  // actually sent to the server; returns undefined if time
  // sent is approximately the timestamp time.  Only not undefined
  // when there is a significant difference.
  time_sent(time) {
    return this._patch_list.time_sent(time);
  }

  // integer index of user who made the edit at given
  // point in time.
  user_id(time) {
    return this._patch_list.user_id(time);
  }

  // Indicate active interest in syncstring; only updates time
  // if last_active is at least min_age_m=5 minutes old (so this can be safely
  // called frequently without too much load).  We do *NOT* use
  // "this.syncstring_table.set(...)" below because it is critical to
  // to be able to do the touch before this.syncstring_table gets initialized,
  // since otherwise the initial open a file will be very slow.
  touch(min_age_m = 5, cb) {
    let last_active;
    if (this.client.is_project()) {
      if (typeof cb === "function") {
        cb();
      }
      return;
    }
    if (min_age_m > 0) {
      // if min_age_m is 0 always try to do it immediately; if > 0 check what it was:
      last_active = __guard__(
        this.syncstring_table != null
          ? this.syncstring_table.get_one()
          : undefined,
        x => x.get("last_active")
      );
      // if not defined or not set recently, do it.
      if (
        !(
          last_active == null ||
          +last_active <= +misc.server_minutes_ago(min_age_m)
        )
      ) {
        if (typeof cb === "function") {
          cb();
        }
        return;
      }
    }
    // Now actually do the set.
    return this.client.query({
      query: {
        syncstrings: {
          string_id: this._string_id,
          project_id: this._project_id,
          path: this._path,
          deleted: this._deleted,
          last_active: misc.server_time(),
          doctype: misc.to_json(this._doctype)
        }
      }, // important to set here, since this is when syncstring is often first created
      cb
    });
  }

  /* The project calls set_initialized once it has checked for
     the file on disk; this way the frontend knows that the
     syncstring has been initialized in the database, and also
     if there was an error doing the check.
   */
  private async set_initialized(
    error: string,
    is_read_only: boolean,
    size: number
  ): Promise<void> {
    const init = { time: misc.server_time(), size, error };
    return await callback2(this.client.query, {
      query: {
        syncstrings: {
          string_id: this.string_id,
          project_id: this.project_id,
          path: this.path,
          init,
          read_only: is_read_only
        }
      }
    });
  }

  // List of timestamps of the versions of this string in the sync
  // table that we opened to start editing (so starts with what was
  // the most recent snapshot when we started).  The list of timestamps
  // is sorted from oldest to newest.
  versions() {
    const v = [];
    this.patches_table.get().map((x, id) => {
      return v.push(x.get("time"));
    });
    v.sort(time_cmp);
    return v;
  }

  // List of all known timestamps of versions of this string, including
  // possibly much older versions than returned by this.versions(), in
  // case the full history has been loaded.  The list of timestamps
  // is sorted from oldest to newest.
  all_versions() {
    return this._patch_list != null ? this._patch_list.versions() : undefined;
  }

  last_changed() {
    const v = this.versions();
    if (v.length > 0) {
      return v[v.length - 1];
    } else {
      return new Date(0);
    }
  }

  // Close synchronized editing of this string; this stops listening
  // for changes and stops broadcasting changes.
  close() {
    if (this.state === 'closed') {
      return;
    }
    this.set_state('close');
    this.emit("close");

    // must be after this.emit('close') above.
    this.removeAllListeners();

    if (this.periodically_touch != null) {
      clearInterval(this.periodically_touch);
      delete this.periodically_touch;
    }
    if (this.project_autosave != null) {
      clearInterval(this.project_autosave);
      delete this.project_autosave;
    }
    delete this.cursor_map;
    delete this.users;

    if (this.syncstring_table != null) {
      this.syncstring_table.close();
    }
    delete this.syncstring_table;

    if (this.patches_table != null) {
      this.patches_table.close();
    }
    delete this.patches_table;
    if (this.patch_list != null) {
      this.patch_list.close();
    }
    delete this.patch_list;

    if (this.cursors_table != null) {
      this.cursors_table.close();
    }
    delete this.cursors_table;
    delete this.throttled_set_cursor_locs;

    if (this.client.is_project()) {
      this.update_watch_path(); // no input = closes it
    }

    if (this.evaluator != null) {
      this.evaluator.close();
    }
    return delete this.evaluator;
  }

  private async init_syncstring_table(): Promise<void> {
    const query = {
      syncstrings: {
        string_id: this.string_id,
        project_id: this.project_id,
        path: this.path,
        deleted: null,
        users: null,
        last_snapshot: null,
        snapshot_interval: null,
        save: null,
        last_active: null,
        init: null,
        read_only: null,
        last_file_change: null,
        doctype: null,
        archived: null,
        settings: null
      }
    };

    this.syncstring_table = this.client.sync_table(query);
    await once(this.syncstring_table, "connected");
    this.handle_syncstring_update();
    this.syncstring_table.on("change", this.handle_syncstring_update);

    // wait until syncstring is not archived -- if we open an
    // older syncstring, the patches may be archived, and we have to wait until
    // after they have been pulled from blob storage before
    // we init the patch table, load from disk, etc.
    function is_not_archived(): boolean {
      const ss = this.syncstring_table.get_one();
      if (ss != null) {
        return !ss.get("archived");
      } else {
        return false;
      }
    }
    await this.syncstring_table.wait(is_not_archived.bind(this), 120);
  }

  private async init_all(): Promise<void> {
    if (this.state !== "init") {
      throw Error("connect can only be called in init state");
    }
    // It is critical to do a quick initial touch so file gets
    // opened on the backend or syncstring gets created (otherwise,
    // creation of various changefeeds below will FATAL fail).
    await this.touch(0);
    this.assert_not_closed();
    await this.init_syncstring_table();
    this.assert_not_closed();
    await Promise.all([
      this.init_patch_list(),
      this.init_cursors(),
      this.init_evaluator()
    ]);
    this.assert_not_closed();
    this.init_periodic_touch();
    this.init_file_use_interval();
    this.init_throttled_cursors();
    if (this.client.is_project()) {
      await this._load_from_disk_if_newer();
    }

    await this.wait_until_fully_ready();
    this.assert_not_closed();
    if (this.client.is_project()) {
      this.init_project_autosave();
    } else {
      // Ensure file is undeleted when explicitly open.
      await this.undelete();
      this.assert_not_closed();
    }
  }

  private init_periodic_touch(): void {
    if (!this.client.is_user() || this.periodically_touch != null) {
      return;
    }
    this.touch(1);
    // touch every few minutes while syncstring is open, so that project
    // (if open) keeps its side open
    this.periodically_touch = setInterval(
      () => this.touch(TOUCH_INTERVAL_M / 2),
      1000 * 60 * TOUCH_INTERVAL_M
    );
  }

  // wait until the syncstring table is ready to be
  // used (so extracted from archive, etc.),
  private wait_until_fully_ready(): Promise<void> {
    this.assert_not_closed();
    function is_fully_ready(t: SyncTable): any {
      this.assert_not_closed();
      const tbl = t.get_one();
      if (tbl === null) {
        return false;
      }
      // init must be set in table and archived must NOT be
      // set (so patches are loaded from blob store)
      const init = tbl.get("init");
      if (init && !tbl.get("archived")) {
        return init.toJS();
      } else {
        return false;
      }
    }
    const init = await this.syncstring_table.wait(is_fully_ready.bind(this), 0);

    if (this.client.is_user() && this.patch_list.count() === 0 && init.size) {
      // wait for a change -- i.e., project loading the file from
      // disk and making available...  Because init.size > 0, we know that
      // there must be SOMETHING in the patches table once initialization is done.
      // This is the root cause of https://github.com/sagemathinc/cocalc/issues/2382
      await once(this.patches_table, "change");
    }
    this.emit("init");
  }

  public async wait_until_ready(): Promise<void> {
    this.assert_not_closed();
    if (this.state !== "ready") {
      // wait for a state change.
      await wait(this, "state");
      if (this.state !== "ready") {
        throw Error("failed to initialize");
      }
    }
  }

  /* Calls wait for the corresponding patches SyncTable, if
     it has been defined.  If it hasn't been defined, it waits
     until it is defined, then calls wait.  Timeout only starts
     when patches_table is already initialized.
  */
  public async wait(until: Function, timeout: number = 30): Promise<any> {
    await this.wait_until_ready();
    return await this.patches_table.wait(until, timeout);
  }

  /* Delete the synchronized string and **all** patches from the database
     -- basically delete the complete history of editing this file.
     WARNINGS:
       (1) If a project has this string open, then things may be messed
           up, unless that project is restarted.
       (2) Only available for an **admin** user right now!

     To use: from a javascript console in the browser as admin, do:

       await smc.client.sync_string({
         project_id:'9f2e5869-54b8-4890-8828-9aeba9a64af4',
         path:'a.txt'}).delete_from_database()

     Then make sure project and clients refresh.

     WORRY: Race condition where constructor might write stuff as
     it is being deleted?
  */
  public async delete_from_database(): Promise<void> {
    const queries = [
      {
        patches_delete: {
          id: [this._string_id],
          dummy: null
        }
      },
      {
        syncstrings_delete: {
          project_id: this.project_id,
          path: this.path
        }
      }
    ];
    const v: Promise<any>[] = [];
    for (let i = 0; i < queries.length; i++) {
      v.push(callback2(this.client.query, { query: queries[i] }));
    }
    await Promise.all(v);
  }

  private async file_is_read_only(): Promise<boolean> {
    try {
      await callback2(this.client.path_access, {
        path: this.path,
        mode: "w"
      });
      // no error -- it is NOT read only
      return false;
    } catch (err) {
      // error -- it is read only.
      return true;
    }
  }

  private async update_if_file_is_read_only(): Promise<void> {
    this.set_read_only(await this.file_is_read_only());
  }

  private async load_from_disk_if_newer(): Promise<void> {
    const last_changed = this.last_changed();
    const dbg = this.client.dbg(
      `syncstring.load_from_disk_if_newer('${this.path}')`
    );
    let is_read_only: boolean = false;
    let size: number = 0;
    let error: string = "";
    try {
      dbg("check if path exists");
      if (await callback2(this.client.path_exists, { path: this.path })) {
        // the path exists
        if (last_changed != null) {
          dbg("edited before, so stat file");
          const stats = await callback2(this.client.path_stat, {
            path: this._path
          });
          if (stats.ctime > last_changed) {
            dbg("disk file changed more recently than edits, so loading");
            size = await this.load_from_disk();
          } else {
            dbg("stick with database version");
          }
        } else {
          dbg("never edited before and path exists, so load from disk");
          size = await this.load_from_disk();
        }
        is_read_only = await this.file_is_read_only();
      }
    } catch (err) {
      error = err.toString();
    }

    await this.set_initialized(error, is_read_only, size);
  }

  private patch_table_query(cutoff?: Date) {
    const query = {
      string_id: this.string_id,
      time: cutoff ? { ">=": cutoff } : null,
      // compressed format patch as a JSON *string*
      patch: null,
      // integer id of user (maps to syncstring table)
      user_id: null,
      // (optional) a snapshot at this point in time
      snapshot: null,
      // (optional) when patch actually sent, which may
      // be later than when made
      sent: null,
      // (optional) timestamp of previous patch sent
      // from this session
      prev: null
    };
    if (this.patch_format != null) {
      query.format = this.patch_format;
    }
    return query;
  }

  private async init_patch_list(): Promise<void> {
    this.assert_not_closed();

    // CRITICAL: note that handle_syncstring_update checks whether
    // init_patch_list is done by testing whether this.patch_list is defined!
    // That is why we first define "patch_list" below, then set this.patch_list
    // to it only after we're done.
    delete this.patch_list;

    const patch_list = new SortedPatchList(this.from_str);

    this.patches_table = this.client.synctable2(
      { patches: this.patch_table_query(this.last_snapshot) },
      undefined,
      this.patch_interval
    );

    await once(this.patches_table, "connected");
    this.assert_not_closed();

    patch_list.add(this.get_patches());

    const doc = patch_list.value();
    this.last = this.doc = doc;
    this.patches_table.on("change", this.handle_patch_update);
    this.patches_table.on("before-change", () => this.emit("before-change"));
    this.patch_list = patch_list;

    /*
      TODO/CRITICAL: We are temporarily disabling same-user
      collision detection, since this seems to be leading to
      serious issues involving a feedback loop, which may
      be way worse than the 1 in a million issue
      that this addresses.  This only address the *same*
      account being used simultaneously on the same file
      by multiple people which isn't something users should
      ever do (but they do in big demos).

      this.patch_list.on 'overwrite', (t) =>
          * ensure that any outstanding save is done
          this.patches_table.save () =>
              this.check_for_timestamp_collision(t)
    */

    this.patches_table.on("saved", this.handle_offline.bind(this));
  }

  /*
    _check_for_timestamp_collision: (t) =>
        obj = this._my_patches[t]
        if not obj?
            return
        key = this._patches_table.key(obj)
        if obj.patch != this._patches_table.get(key)?.get('patch')
            *console.log("COLLISION! #{t}, #{obj.patch}, #{this._patches_table.get(key).get('patch')}")
            * We fix the collision by finding the nearest time after time that
            * is available, and reinserting our patch at that new time.
            this._my_patches[t] = 'killed'
            new_time = this._patch_list.next_available_time(new Date(t), this._user_id, this._users.length)
            this._save_patch(new_time, JSON.parse(obj.patch))
    */

  private async init_evaluator(): Promise<void> {
    if (filename_extension(this.path) !== "sagews") {
      // only use init_evaluator for sagews
      return;
    }
    await callback(cb => (this.evaluator = new Evaluator(this, cb)));
  }

  private async init_cursors(): Promise<void> {
    if (!this.client.is_user()) {
      // only users care about cursors.
      return;
    }
    if (!this.cursors) {
      // do not care about cursors for this syncdoc.
      return;
    }
    const query = {
      cursors: {
        string_id: this.string_id,
        user_id: null,
        locs: null,
        time: null
      }
    };
    this.cursors_table = this.client.synctable2(
      query,
      [],
      this.cursor_interval
    );
    await once(this.cursors_table, "connected");
    this.assert_not_closed();

    // cursors now initialized; first initialize the
    // local this._cursor_map, which tracks positions
    // of cursors by account_id:
    this.cursor_map = Map();
    this.cursors_table.get().map((locs, k) => {
      const u = JSON.parse(k);
      if (u != null) {
        this.cursor_map = this.cursor_map.set(this.users[u[1]], locs);
      }
    });

    this.cursors.on("change", this.handle_cursors_change.bind(this));
  }

  private handle_cursors_change(keys): void {
    if (this.state === "closed") {
      return;
    }
    for (let k of keys) {
      const u = JSON.parse(k);
      if (u == null) {
        continue;
      }
      const account_id = this.users[u[1]];
      this.cursor_map = this.cursor_map.set(
        account_id,
        this.cursors_table.get(k)
      );
      this.emit("cursor_activity", account_id);
    }
  }

  /* Set this user's cursors to the given locs.  This
     function is throttled, so calling it many times
     is safe, and all but the last call is discarded.
     NOTE: no-op if only one user or cursors not enabled
     for this doc.
  */
  public set_cursor_locs(locs, side_effect): void {
    if (this.state === "closed") {
      return;
    }
    if (this.users.length <= 2) {
      /* Don't bother in special case when only one
         user (plus the project -- for 2 above!)
         since we never display the user's
         own cursors - just other user's cursors.
         This simple optimization will save tons
         of bandwidth, since many files are never
         opened by more than one user.
       */
      return;
    }
    if (typeof this._throttled_set_cursor_locs === "function") {
      this._throttled_set_cursor_locs(locs, side_effect);
    }
  }

  // returns immutable.js map from account_id to list of cursor positions, if cursors are enabled.
  get_cursors() {
    return this._cursor_map;
  }

  // set settings map.  (no-op if not yet initialized -- thus DO NOT call until initialized...)
  set_settings(obj) {
    return this.syncstring_table != null
      ? this.syncstring_table.set({
          string_id: this._string_id,
          settings: obj
        })
      : undefined;
  }

  // get immutable.js settings object
  get_settings() {
    let left;
    return (left =
      this.syncstring_table != null
        ? this.syncstring_table.get_one().get("settings")
        : undefined) != null
      ? left
      : immutable.Map();
  }

  save_asap(cb) {
    return this._save(cb);
  }

  // save any changes we have as a new patch
  _save(cb) {
    //dbg = this.dbg('_save'); dbg('saving changes to db')
    if (this._closed) {
      //dbg("string closed -- can't save")
      if (typeof cb === "function") {
        cb("string closed");
      }
      return;
    }

    if (this._last == null) {
      //dbg("string not initialized -- can't save")
      if (typeof cb === "function") {
        cb("string not initialized");
      }
      return;
    }

    if (this._last.is_equal(this._doc)) {
      //dbg("nothing changed so nothing to save")
      if (typeof cb === "function") {
        cb();
      }
      return;
    }

    if (this._handle_patch_update_queue_running) {
      // wait until the update is done, then try again.
      this.once("_handle_patch_update_queue_done", () => {
        return this._save(cb);
      });
      return;
    }

    if (this._saving) {
      // this makes it at least safe to call this._save() directly...
      if (typeof cb === "function") {
        cb("saving");
      }
      return;
    }

    this._saving = true;
    this._sync_remote_and_doc(err => {
      this._saving = false;
      return typeof cb === "function" ? cb(err) : undefined;
    });

    this.snapshot_if_necessary();
    // Emit event since this syncstring was definitely changed locally.
    return this.emit("user_change");
  }

  _next_patch_time() {
    let time = this.client.server_time();
    const min_time = this._patch_list.newest_patch_time();
    if (min_time != null && min_time >= time) {
      time = new Date(min_time - 0 + 1);
    }
    time = this._patch_list.next_available_time(
      time,
      this._user_id,
      this._users.length
    );
    return time;
  }

  async undelete(): Promise<void> {
    this.assert_not_closed();
    return this.syncstring_table.set(
      this.syncstring_table.get_one().set("deleted", false)
    );
  }

  _save_patch(time, patch, cb) {
    // cb called when save to the backend done
    if (this._closed) {
      if (typeof cb === "function") {
        cb("closed");
      }
      return;
    }
    const obj = {
      // version for database
      string_id: this._string_id,
      time,
      patch: JSON.stringify(patch),
      user_id: this._user_id
    };

    this._my_patches[time - 0] = obj;

    if (this._patch_format != null) {
      obj.format = this._patch_format;
    }
    if (this._deleted) {
      // file was deleted but now change is being made, so undelete it.
      this._undelete();
    }
    if (this._save_patch_prev != null) {
      // timestamp of last saved patch during this session
      obj.prev = this._save_patch_prev;
    }
    this._save_patch_prev = time;
    //console.log("_save_patch: #{misc.to_json(obj)}")

    // If in undo mode put the just-created patch in our without timestamp list, so it won't be included when doing undo/redo.
    if (this._undo_state != null) {
      this._undo_state.without.unshift(time);
    }

    //console.log 'saving patch with time ', time - 0
    const x = this.patches_table.set(obj, "none", cb);
    return this._patch_list.add([
      this._process_patch(x, undefined, undefined, patch)
    ]);
  }

  // Save current live string to backend.  It's safe to call this frequently,
  // since it will debounce itself.
  save(cb) {
    if (this._save_debounce == null) {
      this._save_debounce = {};
    }
    misc.async_debounce({
      f: this._save,
      interval: this._save_interval,
      state: this._save_debounce,
      cb
    });
  }

  // Create and store in the database a snapshot of the state
  // of the string at the given point in time.  This should
  // be the time of an existing patch.
  snapshot(time, force = false) {
    if (!misc.is_date(time)) {
      throw Error("time must be a date");
    }
    const x = this._patch_list.patch(time);
    if (x == null) {
      console.warn(`no patch at time ${time}`); // should never happen...
      return;
    }
    if (x.snapshot != null && !force) {
      // there is already a snapshot at this point in time, so nothing further to do.
      return;
    }
    // save the snapshot itself in the patches table.
    const obj = {
      string_id: this._string_id,
      time,
      patch: JSON.stringify(x.patch),
      snapshot: this._patch_list.value(time, force).to_str(),
      user_id: x.user_id
    };
    if (force) {
      // CRITICAL: We are sending the patch/snapshot later, but it was valid.
      // It's important to make this clear or _handle_offline will
      // recompute this snapshot and try to update sent on it again,
      // which leads to serious problems!
      obj.sent = time;
    }
    x.snapshot = obj.snapshot; // also set snapshot in the this._patch_list, which helps with optimization
    this.patches_table.set(obj, "none", err => {
      if (!err) {
        // CRITICAL: Only save the snapshot time in the database after the set in the patches table was confirmed as a
        // success -- otherwise if the user refreshes their browser (or visits later) they lose all their early work!
        this.syncstring_table.set({
          string_id: this._string_id,
          project_id: this._project_id,
          path: this._path,
          last_snapshot: time
        });
        return (this._last_snapshot = time);
      } else {
        return console.warn(`failed to save snapshot -- ${err}`);
      }
    });
    return time;
  }

  // Have a snapshot every this._snapshot_interval patches, except
  // for the very last interval.
  snapshot_if_necessary() {
    const time = this._patch_list.time_of_unmade_periodic_snapshot(
      this._snapshot_interval
    );
    if (time != null) {
      return this.snapshot(time);
    }
  }

  // x - patch object
  // time0, time1: optional range of times; return undefined if patch not in this range
  // patch -- if given will be used as an actual patch instead of x.patch, which is a JSON string.
  _process_patch(x, time0, time1, patch) {
    if (x == null) {
      // we allow for x itself to not be defined since that simplifies other code
      return;
    }
    let time = x.get("time");
    if (!misc.is_date(time)) {
      try {
        time = misc.ISO_to_Date(time);
        if (isNaN(time)) {
          // ignore patches with bad times
          return;
        }
      } catch (err) {
        // ignore patches with invalid times
        return;
      }
    }
    const user_id = x.get("user_id");
    const sent = x.get("sent");
    const prev = x.get("prev");
    if (time0 != null && time < time0) {
      return;
    }
    if (time1 != null && time > time1) {
      return;
    }
    if (patch == null) {
      // Do **NOT** use misc.from_json, since we definitely do not want to
      // unpack ISO timestamps as Date, since patch just contains the raw
      // patches from user editing.  This was done for a while, which
      // led to horrific bugs in some edge cases...
      // See https://github.com/sagemathinc/cocalc/issues/1771
      let left;
      patch = JSON.parse((left = x.get("patch")) != null ? left : "[]");
    }
    const snapshot = x.get("snapshot");
    const obj = {
      time,
      user_id,
      patch
    };
    if (sent != null) {
      obj.sent = sent;
    }
    if (prev != null) {
      obj.prev = prev;
    }
    if (snapshot != null) {
      obj.snapshot = snapshot;
    }
    return obj;
  }

  // return all patches with time such that time0 <= time <= time1;
  // if time0 undefined then sets equal to time of last_snapshot; if time1 undefined treated as +oo
  _get_patches(time0, time1) {
    if (time0 == null) {
      time0 = this._last_snapshot;
    }
    const m = this.patches_table.get(); // immutable.js map with keys the string that is the JSON version of the primary key [string_id, timestamp, user_number].
    const v = [];
    m.map((x, id) => {
      const p = this._process_patch(x, time0, time1);
      if (p != null) {
        return v.push(p);
      }
    });
    v.sort(patch_cmp);
    return v;
  }

  has_full_history() {
    return !this._last_snapshot || this._load_full_history_done;
  }

  load_full_history(cb) {
    //dbg = this.dbg("load_full_history")
    //dbg()
    if (this.has_full_history()) {
      //dbg("nothing to do, since complete history definitely already loaded")
      if (typeof cb === "function") {
        cb();
      }
      return;
    }
    const query = this.patch_table_query();
    return this.client.query({
      query: { patches: [query] },
      cb: (err, result) => {
        if (err) {
          return typeof cb === "function" ? cb(err) : undefined;
        } else {
          const v = [];
          // _process_patch assumes immutable.js objects
          immutable.fromJS(result.query.patches).forEach(x => {
            const p = this._process_patch(x, 0, this._last_snapshot);
            if (p != null) {
              return v.push(p);
            }
          });
          this._patch_list.add(v);
          this._load_full_history_done = true;
          return typeof cb === "function" ? cb() : undefined;
        }
      }
    });
  }

  show_history(opts) {
    return this._patch_list.show_history(opts);
  }

  get_path() {
    return this._path;
  }

  get_project_id() {
    return this._project_id;
  }

  set_snapshot_interval(n) {
    this.syncstring_table.set(
      this.syncstring_table.get_one().set("snapshot_interval", n)
    );
  }

  // Check if any patches that just got confirmed as saved are relatively old; if so,
  // we mark them as such and also possibly recompute snapshots.
  _handle_offline(data) {
    //dbg = this.dbg("_handle_offline")
    //dbg("data='#{misc.to_json(data)}'")
    if (this._closed) {
      return;
    }
    const now = misc.server_time();
    let oldest = undefined;
    for (let obj of data) {
      if (obj.sent) {
        // CRITICAL: ignore anything already processed! (otherwise, infinite loop)
        continue;
      }
      if (now - obj.time >= 1000 * OFFLINE_THRESH_S) {
        // patch is "old" -- mark it as likely being sent as a result of being
        // offline, so clients could potentially discard it.
        obj.sent = now;
        this.patches_table.set(obj);
        if (oldest == null || obj.time < oldest) {
          oldest = obj.time;
        }
      }
    }
    if (oldest) {
      //dbg("oldest=#{oldest}, so check whether any snapshots need to be recomputed")
      return (() => {
        const result = [];
        for (let snapshot_time of this._patch_list.snapshot_times()) {
          if (snapshot_time - oldest >= 0) {
            //console.log("recomputing snapshot #{snapshot_time}")
            result.push(this.snapshot(snapshot_time, true));
          } else {
            result.push(undefined);
          }
        }
        return result;
      })();
    }
  }

  _handle_syncstring_save_state(state, time) {
    // This is used to make it possible to emit a
    // 'save-to-disk' event, whenever the state changes
    // to indicate a save completed.

    // NOTE: it is intentional that this._syncstring_save_state is not defined
    // the first tie this function is called, so that save-to-disk
    // with last save time gets emitted on initial load (which, e.g., triggers
    // latex compilation properly in case of a .tex file).
    if (state === "done" && this._syncstring_save_state !== "done") {
      this.emit("save-to-disk", time);
    }
    return (this._syncstring_save_state = state);
  }

  _handle_syncstring_update() {
    //dbg = this.dbg("_handle_syncstring_update")
    //dbg()
    if (this.syncstring_table == null) {
      // not initialized; nothing to do
      //dbg("nothing to do")
      return;
    }

    const data = this.syncstring_table.get_one();
    const x = data != null ? data.toJS() : undefined;

    this._handle_syncstring_save_state(
      __guard__(x != null ? x.save : undefined, x1 => x1.state),
      __guard__(x != null ? x.save : undefined, x2 => x2.time)
    );

    //dbg(JSON.stringify(x))
    // TODO: potential races, but it will (or should!?) get instantly fixed when we get an update in case of a race (?)
    const client_id = this.client.client_id();
    // Below " not x.snapshot? or not x.users?" is because the initial touch sets
    // only string_id and last_active, and nothing else.
    if (x == null || x.users == null) {
      // Brand new document
      this.emit("load-time-estimate", { type: "new", time: 1 });
      this._last_snapshot = undefined;
      this._snapshot_interval =
        schema.SCHEMA.syncstrings.user_query.get.fields.snapshot_interval;
      // brand new syncstring
      this._user_id = 0;
      this._users = [client_id];
      const obj = {
        string_id: this._string_id,
        project_id: this._project_id,
        path: this._path,
        last_snapshot: this._last_snapshot,
        users: this._users,
        deleted: this._deleted,
        doctype: misc.to_json(this._doctype)
      };
      this.syncstring_table.set(obj);
      this._settings = immutable.Map();
      this.emit("metadata-change");
      return this.emit("settings-change", this._settings);
    } else {
      // Existing document.
      if (x.archived) {
        this.emit("load-time-estimate", { type: "archived", time: 8 });
      } else {
        this.emit("load-time-estimate", { type: "ready", time: 2 });
      }

      // TODO: handle doctype change here (?)
      this._last_snapshot = x.last_snapshot;
      this._snapshot_interval = x.snapshot_interval;
      this._users = x.users;
      this._project_id = x.project_id;
      this._path = x.path;

      const settings = data.get("settings", immutable.Map());
      if (settings !== this._settings) {
        this.emit("settings-change", settings);
        this._settings = settings;
      }

      if (this._deleted != null && x.deleted && !this._deleted) {
        // change to deleted
        this.emit("deleted");
      }
      this._deleted = x.deleted;

      // Ensure that this client is in the list of clients
      this._user_id =
        this._users != null ? this._users.indexOf(client_id) : undefined;
      if (this._user_id === -1) {
        this._user_id = this._users.length;
        this._users.push(client_id);
        this.syncstring_table.set({
          string_id: this._string_id,
          project_id: this._project_id,
          path: this._path,
          users: this._users
        });
      }

      if (!this.client.is_project()) {
        this.emit("metadata-change");
        return;
      }

      //dbg = this.dbg("_handle_syncstring_update('#{this._path}')")
      //dbg("project only handling")
      // Only done for project:
      return async.series(
        [
          cb => {
            if (this._patch_list != null) {
              //dbg("patch list already loaded")
              return cb();
            } else {
              //dbg("wait for patch list to load...")
              return this.once("connected", () => {
                //dbg("patch list loaded")
                return cb();
              });
            }
          },
          cb => {
            // NOTE: very important to completely do this._update_watch_path
            // before this._save_to_disk below.
            // If client is a project and path isn't being properly watched, make it so.
            if (x.project_id != null && this._watch_path !== x.path) {
              //dbg("watch path")
              return this._update_watch_path(x.path, cb);
            } else {
              return cb();
            }
          },
          cb => {
            if ((x.save != null ? x.save.state : undefined) === "requested") {
              //dbg("save to disk")
              return this._save_to_disk(cb);
            } else {
              return cb();
            }
          }
        ],
        err => {
          if (err) {
            this.dbg("_handle_syncstring_update")(
              `POSSIBLY UNHANDLED ERROR -- ${err}`
            );
          }
          return this.emit("metadata-change");
        }
      );
    }
  }

  _update_watch_path(path, cb) {
    const dbg = this.client.dbg(`_update_watch_path('${path}')`);
    if (this._file_watcher != null) {
      // clean up
      dbg("close");
      this._file_watcher.close();
      delete this._file_watcher;
      delete this._watch_path;
    }
    if (path == null) {
      dbg("not opening another watcher");
      if (typeof cb === "function") {
        cb();
      }
      return;
    }
    if (this._watch_path != null) {
      dbg("watch_path already defined");
      if (typeof cb === "function") {
        cb();
      }
      return;
    }
    dbg("opening watcher");
    this._watch_path = path;
    return async.series(
      [
        cb => {
          return this.client.path_exists({
            path,
            cb: (err, exists) => {
              if (err) {
                return cb(err);
              } else if (!exists) {
                let left;
                dbg(
                  `write '${path}' to disk from syncstring in-memory database version`
                );
                const data = (left = this.to_str()) != null ? left : ""; // maybe in case of no patches yet (?).
                return this.client.write_file({
                  path,
                  data,
                  cb: err => {
                    dbg(`wrote '${path}' to disk -- now calling cb`);
                    return cb(err);
                  }
                });
              } else {
                return cb();
              }
            }
          });
        },
        cb => {
          dbg("now requesting to watch file");
          this._file_watcher = this.client.watch_file({ path });
          this._file_watcher.on("change", ctime => {
            if (ctime == null) {
              ctime = new Date();
            }
            ctime = ctime - 0;
            dbg(
              `file_watcher: change, ctime=${ctime}, this._save_to_disk_start_ctime=${
                this._save_to_disk_start_ctime
              }, this._save_to_disk_end_ctime=${this._save_to_disk_end_ctime}`
            );
            if (this._closed) {
              this._file_watcher.close();
              return;
            }
            if (
              ctime -
                (this._save_to_disk_start_ctime != null
                  ? this._save_to_disk_start_ctime
                  : 0) >=
              7 * 1000
            ) {
              // last attempt to save was at least 7s ago, so definitely
              // this change event was not caused by it.
              dbg("_load_from_disk: no recent save");
              this._load_from_disk();
              return;
            }
            if (this._save_to_disk_end_ctime == null) {
              // save event started less than 15s and isn't done.
              // ignore this load.
              dbg(
                "_load_from_disk: unfinished this._save_to_disk just happened, so ignoring file change"
              );
              return;
            }
            if (
              this._save_to_disk_start_ctime <= ctime &&
              ctime <= this._save_to_disk_end_ctime
            ) {
              // changed triggered during the save
              dbg(
                "_load_from_disk: change happened during this._save_to_disk, so ignoring file change"
              );
              return;
            }
            // Changed happened near to when there was a save, but not in window, so
            // we do it..
            dbg(
              "_load_from_disk: happened to close to recent save, so ignoring"
            );
          });

          this._file_watcher.on("delete", () => {
            dbg("event delete");
            if (this._closed) {
              this._file_watcher.close();
              return;
            }
            dbg("delete: setting deleted=true and closing");
            this.from_str("");
            this.save(() => {
              // NOTE: setting deleted=true must be done **after** setting document to blank above,
              // since otherwise the set would set deleted=false.
              this.syncstring_table.set(
                this.syncstring_table.get_one().set("deleted", true)
              );
              return this.syncstring_table.save(() => {
                // make sure deleted:true is saved.
                return this.close();
              });
            });
          });
          return cb();
        }
      ],
      err => (typeof cb === "function" ? cb(err) : undefined)
    );
  }

  // TODO: finish
  private async load_from_disk(): Promise<void> {
    // cb(err, size)
    const path = this.get_path();
    const dbg = this.client.dbg(`syncstring._load_from_disk('${path}')`);
    dbg();
    if (this._load_from_disk_lock) {
      if (typeof cb === "function") {
        cb("lock");
      }
      return;
    }
    this._load_from_disk_lock = true;
    const locals = { exists: undefined, size: 0 };
    return async.series(
      [
        cb => {
          return this.client.path_exists({
            path,
            cb: (err, exists) => {
              locals.exists = exists;
              if (!exists) {
                dbg("file no longer exists");
                this.from_str("");
              }
              return cb(err);
            }
          });
        },
        cb => {
          if (locals.exists) {
            return this._update_if_file_is_read_only(cb);
          } else {
            return cb();
          }
        },
        cb => {
          if (!locals.exists) {
            cb();
            return;
          }
          return this.client.path_read({
            path,
            maxsize_MB: MAX_FILE_SIZE_MB,
            cb: (err, data) => {
              if (err) {
                dbg(`failed -- ${err}`);
                return cb(err);
              } else {
                locals.size =
                  (data != null ? data.length : undefined) != null
                    ? data != null
                      ? data.length
                      : undefined
                    : 0;
                dbg(`got it -- length=${locals.size}`);
                this.from_str(data);
                // we also know that this is the version on disk, so we update the hash
                this._set_save({
                  state: "done",
                  error: false,
                  hash: misc.hash_string(data)
                });
                return cb();
              }
            }
          });
        },
        cb => {
          // save back to database
          return this._save(cb);
        }
      ],
      err => {
        this._load_from_disk_lock = false;
        return typeof cb === "function" ? cb(err, locals.size) : undefined;
      }
    );
  }

  _set_save(x) {
    if (this._closed) {
      // nothing to do
      return;
    }
    // set timestamp of when the save happened; this can be useful for coordinating
    // running code, etc.... and is just generally useful.
    x.time = new Date() - 0;
    __guardMethod__(this.syncstring_table, "set", o =>
      o.set(
        __guard__(this.syncstring_table.get_one(), x1 =>
          x1.set("save", immutable.fromJS(x))
        )
      )
    );
  }

  _set_read_only(read_only) {
    if (this._closed) {
      // nothing to do
      return;
    }
    __guardMethod__(this.syncstring_table, "set", o =>
      o.set(
        __guard__(this.syncstring_table.get_one(), x =>
          x.set("read_only", read_only)
        )
      )
    );
  }

  get_read_only() {
    if (this._closed) {
      // nothing to do
      return;
    }
    return __guard__(
      this.syncstring_table != null
        ? this.syncstring_table.get_one()
        : undefined,
      x => x.get("read_only")
    );
  }

  // This should only be called after the syncstring is
  // initialized (hence connected), since
  // otherwise this.syncstring_table isn't defined
  // yet (it gets defined during connect).
  private wait_until_read_only_known(): Promise<void> {
    this.assert_not_closed();
    if (this.syncstring_table == null) {
      // should never happen
      cb("this.syncstring_table must be defined");
      return;
    }
    return this.syncstring_table.wait({
      until: t => __guard__(t.get_one(), x => x.get("read_only")) != null,
      cb
    });
  }

  // Returns true if the current live version of this document has a different hash
  // than the version mostly recently saved to disk.  I.e., if there are changes
  // that have not yet been **saved to disk**.  See the other function
  // has_uncommitted_changes below for determining whether there are changes
  // that haven't been commited to the database yet.
  // Returns *undefined* if initialization not even done yet.
  has_unsaved_changes() {
    const hash_saved = this.hash_of_saved_version();
    const hash_live = this.hash_of_live_version();
    if (hash_saved == null || hash_live == null) {
      // don't know yet...
      return;
    }
    return hash_live !== hash_saved;
  }

  // Returns hash of last version saved to disk (as far as we know).
  hash_of_saved_version() {
    let left;
    const table =
      this.syncstring_table != null
        ? this.syncstring_table.get_one()
        : undefined;
    if (table == null) {
      return;
    }
    return (left = table.getIn(["save", "hash"])) != null ? left : 0; // known, but not saved ever.
  }

  // Return hash of the live version of the document, or undefined if the document
  // isn't loaded yet.  (TODO: faster version of this for syncdb, which avoids
  // converting to a string, which is a waste of time.)
  hash_of_live_version() {
    const s = __guardMethod__(this._doc, "to_str", o => o.to_str());
    if (s != null) {
      return misc.hash_string(s);
    }
  }

  // Initiates a save of file to disk, then if cb is set, waits for the state to
  // change to done before calling cb.
  save_to_disk(cb) {
    //dbg = this.dbg("save_to_disk(cb)")
    //dbg("initiating the save")
    if (!this.has_unsaved_changes()) {
      // no unsaved changes, so don't save --
      // CRITICAL: this optimization is assumed by autosave, etc.
      if (typeof cb === "function") {
        cb();
      }
      return;
    }

    if (this.get_read_only()) {
      // save should fail if file is read only
      if (typeof cb === "function") {
        cb("readonly");
      }
      return;
    }

    if (this._deleted) {
      // nothing to do -- no need to attempt to save if file is already deleted
      if (typeof cb === "function") {
        cb();
      }
      return;
    }

    // First make sure any changes are saved to the database.
    // One subtle case where this matters is that loading a file
    // with \r's into codemirror changes them to \n...
    return this.save(err => {
      if (err) {
        return typeof cb === "function" ? cb(err) : undefined;
      } else {
        // Now do actual save to the *disk*.
        return this.__save_to_disk_after_sync(cb);
      }
    });
  }

  __save_to_disk_after_sync(cb) {
    this._save_to_disk();
    if (this.syncstring_table == null) {
      cb("this.syncstring_table must be defined");
      return;
    }
    if (cb != null) {
      //dbg("waiting for save.state to change from '#{this.syncstring_table.get_one().getIn(['save','state'])}' to 'done'")
      const f = cb => {
        if (this._closed) {
          // closed during save
          cb();
          return;
        }
        if (this._deleted) {
          // if deleted, then save doesn't need to finish and is done successfully.
          cb();
          return;
        }
        if (this.syncstring_table == null) {
          cb(true);
          return;
        }
        return this.syncstring_table.wait({
          until(table) {
            return (
              __guard__(table.get_one(), x => x.getIn(["save", "state"])) ===
              "done"
            );
          },
          timeout: 10,
          cb: err => {
            //dbg("done waiting -- now save.state is '#{this.syncstring_table.get_one().getIn(['save','state'])}'")
            if (err) {
              //dbg("got err waiting: #{err}")
            } else {
              // ? because this.syncstring_table could be undefined here, if saving and closing at the same time.
              err =
                this.syncstring_table != null
                  ? this.syncstring_table.get_one().getIn(["save", "error"])
                  : undefined;
            }
            //if err
            //    dbg("got result but there was an error: #{err}")
            if (err) {
              this.touch(0); // touch immediately to ensure backend pays attention.
            }
            return cb(err);
          }
        });
      };
      return misc.retry_until_success({
        f,
        max_tries: 4,
        cb: (err, last_err) => {
          if (this._closed) {
            // closed during save
            cb();
            return;
          }
          if (last_err) {
            if (typeof this.client.log_error === "function") {
              this.client.log_error({
                string_id: this._string_id,
                path: this._path,
                project_id: this._project_id,
                error: `Error saving file -- ${last_err}`
              });
            }
          }
          return cb(last_err);
        }
      });
    }
  }

  // Save this file to disk, if it is associated with a project and has a filename.
  // A user (web browsers) sets the save state to requested.
  // The project sets the state to saving, does the save to disk, then sets
  // the state to done.
  _save_to_disk(cb) {
    if (this.client.is_user()) {
      this.__save_to_disk_user();
      if (typeof cb === "function") {
        cb();
      }
      return;
    }

    if (this._saving_to_disk_cbs != null) {
      this._saving_to_disk_cbs.push(cb);
      return;
    } else {
      this._saving_to_disk_cbs = [cb];
    }

    return this.__do_save_to_disk_project(err => {
      const v = this._saving_to_disk_cbs;
      delete this._saving_to_disk_cbs;
      for (cb of v) {
        if (typeof cb === "function") {
          cb(err);
        }
      }
      return this.emit("save_to_disk_project", err);
    });
  }

  __save_to_disk_user() {
    if (this._closed) {
      // nothing to do
      return;
    }
    if (!this.has_unsaved_changes()) {
      // Browser client that has no unsaved changes, so don't need to save --
      // CRITICAL: this optimization is assumed by autosave, etc.
      return;
    }
    // CRITICAL: First, we broadcast interest in the syncstring -- this will cause the relevant project
    // (if it is running) to open the syncstring (if closed), and hence be aware that the client
    // is requesting a save.  This is important if the client and database have changes not
    // saved to disk, and the project stopped listening for activity on this syncstring due
    // to it not being touched (due to active editing).  Not having this leads to a lot of "can't save"
    // errors.
    this.touch();
    const data = this.to_str(); // string version of this doc
    const expected_hash = misc.hash_string(data);
    return this._set_save({ state: "requested", error: false, expected_hash });
  }

  __do_save_to_disk_project(cb) {
    // check if on-disk version is same as in memory, in which case no save is needed.
    const data = this.to_str(); // string version of this doc
    const hash = misc.hash_string(data);
    const expected_hash = this.syncstring_table
      .get_one()
      .getIn(["save", "expected_hash"]);
    if (failing_to_save(this._path, hash, expected_hash)) {
      this.dbg("__save_to_disk_project")(
        `FAILING TO SAVE-- hash=${hash}, expected_hash=${expected_hash} -- reconnecting`
      );
      cb("failing to save -- reconnecting");
      this.reconnect();
      return;
    }
    if (hash === this.hash_of_saved_version()) {
      // No actual save to disk needed; still we better record this fact in table in case it
      // isn't already recorded
      this._set_save({ state: "done", error: false, hash });
      cb();
      return;
    }

    const path = this.get_path();
    //dbg = this.dbg("__do_save_to_disk_project('#{path}')")
    if (path == null) {
      cb("not yet initialized");
      return;
    }
    if (!path) {
      this._set_save({ state: "done", error: "cannot save without path" });
      cb("cannot save without path");
      return;
    }

    //dbg("project - write to disk file")
    // set window to slightly earlier to account for clock imprecision.
    // Over an sshfs mount, all stats info is **rounded down to the nearest second**,
    // which this also takes care of.
    this._save_to_disk_start_ctime = new Date() - 1500;
    this._save_to_disk_end_ctime = undefined;
    return async.series(
      [
        cb => {
          return this.client.write_file({
            path,
            data,
            cb
          });
        },
        cb => {
          return this.client.path_stat({
            path,
            cb: (err, stat) => {
              this._save_to_disk_end_ctime =
                (stat != null ? stat.ctime : undefined) - 0;
              return cb(err);
            }
          });
        }
      ],
      err => {
        //dbg("returned from write_file: #{err}")
        if (err) {
          this._set_save({ state: "done", error: JSON.stringify(err) });
        } else {
          this._set_save({
            state: "done",
            error: false,
            hash: misc.hash_string(data)
          });
        }
        return cb(err);
      }
    );
  }

  /*
    When the underlying synctable that defines the state of the document changes
    due to new remote patches, this function is called.
    It handles update of the remote version, updating our live version as a result.
    */
  _handle_patch_update(changed_keys) {
    if (this._closed) {
      return;
    }
    //console.log("_handle_patch_update #{misc.to_json(changed_keys)}")
    if (changed_keys == null || changed_keys.length === 0) {
      // this happens right now when we do a save.
      return;
    }
    if (this._patch_list == null) {
      // nothing to do
      return;
    }
    //dbg = this.dbg("_handle_patch_update")
    //dbg(new Date(), changed_keys)
    if (this._patch_update_queue == null) {
      this._patch_update_queue = [];
    }
    for (let key of changed_keys) {
      this._patch_update_queue.push(key);
    }
    if (this._handle_patch_update_queue_running) {
      return;
    }
    return setTimeout(this._handle_patch_update_queue, 1);
  }

  _handle_patch_update_queue() {
    let x;
    if (this._closed || this.patches_table == null) {
      // https://github.com/sagemathinc/cocalc/issues/2829
      return;
    }
    this._handle_patch_update_queue_running = true;

    // note: other code handles that this._patches_table.get(key) may not be
    // defined, e.g., when changed means "deleted"
    let v = this._patch_update_queue.map(key => this.patches_table.get(key));
    this._patch_update_queue = [];
    v = (() => {
      const result = [];
      for (x of v) {
        if (
          x != null &&
          !(this._my_patches != null
            ? this._my_patches[x.get("time") - 0]
            : undefined)
        ) {
          result.push(x);
        }
      }
      return result;
    })();
    if (v.length > 0) {
      this._patch_list.add(
        (() => {
          const result1 = [];
          for (x of v) {
            result1.push(this._process_patch(x));
          }
          return result1;
        })()
      );
      // NOTE: This next line can sometimes *cause* new entries to be added to this._patch_update_queue.
      this._sync_remote_and_doc();
    }

    if (this._patch_update_queue.length > 0) {
      // It is very important that this happen in the next
      // render loop to avoid the this._sync_remote_and_doc call
      // in this._handle_patch_update_queue from causing
      // _sync_remote_and_doc to get called from within itself,
      // due to synctable changes being emited on save.
      return setTimeout(this._handle_patch_update_queue, 1);
    } else {
      // OK, done and nothing in the queue
      this._handle_patch_update_queue_running = false;
      // Notify _save to try again.
      return this.emit("_handle_patch_update_queue_done");
    }
  }

  /*
    Merge remote patches and live version to create new live version,
    which is equal to result of applying all patches.

    This is completely synchronous, and calls before_change_hook and after_change_hook,
    if given, so will work with live being "isomorphic" to some editor (like codemirror).
    */
  _sync_remote_and_doc(cb) {
    // optional cb only used to know when save_patch is done
    if (this._last == null || this._doc == null) {
      if (typeof cb === "function") {
        cb();
      }
      return;
    }
    if (this._sync_remote_and_doc_calling) {
      throw Error("bug - _sync_remote_and_doc can't be called twice at once");
    }
    this._sync_remote_and_doc_calling = true;
    // ensure that our live this._doc equals what the user's editor shows in their browser (say)
    if (typeof this._before_change_hook === "function") {
      this._before_change_hook();
    }
    if (!this._last.is_equal(this._doc)) {
      // compute transformation from _last to _doc
      const patch = this._last.make_patch(this._doc); // must be nontrivial
      // ... and save that to patch table since there is a nontrivial change
      const time = this._next_patch_time();
      this._save_patch(time, patch, cb);
      this._last = this._doc;
    } else {
      if (typeof cb === "function") {
        cb();
      }
    }

    const new_remote = this._patch_list.value();
    if (!this._doc.is_equal(new_remote)) {
      // if any possibility that document changed, set to new version
      this._last = this._doc = new_remote;
      if (typeof this._after_change_hook === "function") {
        this._after_change_hook();
      }
      this.emit("change");
    }
    return (this._sync_remote_and_doc_calling = false);
  }

  // Return true if there are changes to this syncstring that have not been
  // committed to the database (with the commit acknowledged).  This does not
  // mean the file has been written to disk; however, it does mean that it
  // safe for the user to close their browser.
  // Returns undefined if not yet initialized.
  has_uncommitted_changes() {
    return this.patches_table != null
      ? this.patches_table.has_uncommitted_changes()
      : undefined;
  }
}
