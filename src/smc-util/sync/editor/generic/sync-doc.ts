/*
SyncDoc -- the core class for editing with a synchronized document.

This code supports both string-doc and db-doc, for editing both
strings and small database tables efficiently, with history,
undo, save to disk, etc.

This code is run *both* in browser clients and under node.js
in projects, and behaves slightly differently in each case.
*/

/* OFFLINE_THRESH_S - If the client becomes disconnected from
   the backend for more than this long then---on reconnect---do
   extra work to ensure that all snapshots are up to date (in
   case snapshots were made when we were offline), and mark the
   sent field of patches that weren't saved. */
const OFFLINE_THRESH_S = 5 * 60; // 5 minutes.

/* Client -- when it has this syncstring open and connected
   -- will touch the syncstring every so often so that it
   stays opened in the local hub, when the local hub is running. */
const TOUCH_INTERVAL_M = 10;

/* How often the local hub will autosave this file to disk if
   it has it open and there are unsaved changes.  This is very
   important since it ensures that a user that edits a file but
   doesn't click "Save" and closes their browser (right after
   their edits have gone to the database), still has their
   file saved to disk soon.  This is important, e.g., for homework
   getting collected and not missing the last few changes.  It turns
   out this is what people expect.
   Set to 0 to disable. (But don't do that.) */
const LOCAL_HUB_AUTOSAVE_S = 45;
// const LOCAL_HUB_AUTOSAVE_S = 5;

// How big of files we allow users to open using syncstrings.
const MAX_FILE_SIZE_MB = 2;

type XPatch = any;

import { EventEmitter } from "events";

import { throttle } from "underscore";
import { Map, fromJS } from "immutable";

import { callback, delay } from "awaiting";

import {
  callback2,
  once,
  retry_until_success,
  reuse_in_flight_methods
} from "../../../async-utils";

import { wait } from "../../../async-wait";

import { cmp_Date, endswith, filename_extension, keys } from "../../../misc2";

const { Evaluator } = require("../../../syncstring_evaluator");

const {
  hash_string,
  is_date,
  ISO_to_Date,
  minutes_ago,
  server_minutes_ago
} = require("../../../misc");

const schema = require("../../../schema");

import { SyncTable } from "../../table/synctable";

import {
  Client,
  CompressedPatch,
  DocType,
  Document,
  Patch,
  FileWatcher
} from "./types";

import { SortedPatchList } from "./sorted-patch-list";

import { patch_cmp } from "./util";

export interface SyncOpts0 {
  project_id: string;
  path: string;
  client: Client;
  patch_interval?: number;
  file_use_interval?: number;
  string_id?: string;
  cursors?: boolean;
}

export interface SyncOpts extends SyncOpts0 {
  from_str: (string) => Document;
  doctype: DocType;
}

export interface UndoState {
  my_times: Date[];
  pointer: number;
  without: Date[];
  final?: CompressedPatch;
}

export type State = "init" | "ready" | "closed";

export class SyncDoc extends EventEmitter {
  private project_id: string; // project_id that contains the doc
  private path: string; // path of the file corresponding to the doc

  private client: Client;
  private _from_str: (string) => Document; // creates a doc from a string.
  private string_id: string;
  private my_user_id: number;

  // throttling of incoming upstream patches
  private patch_interval: number = 250;

  // This is what's actually output by setInterval -- it's
  // not an amount of time.
  private project_autosave_timer: number = 0;

  private periodically_touch_timer: number = 0;

  // file_use_interval throttle: default is 60s for everything
  // except .sage-chat files, where it is 10s.
  private file_use_interval: number;

  private cursors: boolean = false; // if true, also provide cursor tracking functionality
  private cursor_map: Map<string, any> = Map();
  private cursor_last_time: Date = new Date(0);

  // doctype: object describing document constructor
  // (used by project to open file)
  private doctype: DocType;

  private state: State = "init";

  private syncstring_table: SyncTable;
  private patches_table: SyncTable;
  private cursors_table: SyncTable;

  private evaluator: any;

  private patch_list: SortedPatchList;

  private last: Document;
  private doc: Document;
  private before_change?: Document;

  private last_user_change: Date = minutes_ago(60);

  private last_snapshot: Date | undefined;
  private snapshot_interval: number;

  private deleted: boolean | undefined;
  private users: string[];

  private settings: Map<string, any> = Map();

  private syncstring_save_state: string = "";
  private load_full_history_done: boolean = false;

  // patches that this client made during this editing session.
  private my_patches: { [time: string]: XPatch } = {};

  private watch_path?: string;
  private file_watcher?: FileWatcher;

  private handle_patch_update_queue_running: boolean;
  private patch_update_queue: string[] = [];

  private undo_state: UndoState | undefined;

  private save_patch_prev: Date | undefined;

  private save_to_disk_start_ctime: number | undefined;
  private save_to_disk_end_ctime: number | undefined;

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
    this._from_str = opts.from_str;

    reuse_in_flight_methods(this, [
      "save",
      "save_to_disk",
      "load_from_disk",
      "handle_patch_update_queue",
      "sync_remote_and_doc",
      "touch"
    ]);

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
      console.warn("SyncDoc init error -- ", err, err.stack);
      this.emit("error", err);
      this.close();
      return;
    }

    // Success -- everything perfectly initialized with no issues.
    this.set_state("ready");
    this.init_watch();
    this.emit_change(); // from nothing to something.
  }

  /* Set this user's cursors to the given locs. */
  public set_cursor_locs(locs: any[], side_effect: boolean = false): void {
    if (this.cursors_table == null) {
      return;
    }
    const x: {
      string_id: string;
      user_id: number;
      locs: any[];
      time?: Date;
    } = {
      string_id: this.string_id,
      user_id: this.my_user_id,
      locs
    };
    if (!side_effect) {
      x.time = this.client.server_time();
    }
    if (x.time != null) {
      this.cursor_last_time = x.time;
    }
    this.cursors_table.set(x, "none");
  }

  private init_file_use_interval(): void {
    if (!this.file_use_interval || !this.client.is_user()) {
      // file_use_interval has to be set, and we only do
      // this for browser user.
      return;
    }
    const is_chat = filename_extension(this.path) === "sage-chat";
    let action;
    if (is_chat) {
      action = "chat";
    } else {
      action = "edit";
    }
    const file_use = () => {
      // We ONLY count this and record that the file was
      // edited if there was an actual change record in the
      // patches log, by this user, since last time.
      let user_is_active: boolean = false;
      for (let tm in this.my_patches) {
        if (new Date(parseInt(tm)) > this.last_user_change) {
          user_is_active = true;
          break;
        }
      }
      if (!user_is_active) {
        return;
      }
      this.last_user_change = new Date();
      this.client.mark_file({
        project_id: this.project_id,
        path: this.path,
        action,
        ttl: this.file_use_interval
      });
    };

    this.on("user_change", throttle(file_use, this.file_use_interval, true));
  }

  private set_state(state: State): void {
    this.state = state;
    this.emit(state);
  }

  public get_state(): State {
    return this.state;
  }

  private assert_not_closed(): void {
    if (this.state === "closed") {
      throw Error("closed");
    }
  }

  public set_doc(value: Document): void {
    if (value.is_equal(this.doc)) {
      // no change.
      return;
    }
    this.doc = value;
    this.emit_change();
  }

  // Convenience function to avoid having to do
  // get_doc and set_doc constantly.
  public set(x: any): void {
    this.set_doc(this.doc.set(x));
  }

  public delete(x?: any): void {
    this.set_doc(this.doc.delete(x));
  }

  public get(x?: any): void {
    return this.doc.get(x);
  }

  public get_one(x?: any): void {
    return this.doc.get_one(x);
  }

  // Return underlying document, or undefined if document
  // hasn't been set yet.
  public get_doc(): Document {
    if (this.doc == null) {
      throw Error("doc must be set");
    }
    return this.doc;
  }

  // Set this doc from its string representation.
  public from_str(value: string): void {
    this.doc = this._from_str(value);
  }

  // Return string representation of this doc,
  // or exception if not yet ready.
  public to_str(): string {
    if (this.doc == null) {
      throw Error("doc must be set");
    }
    return this.doc.to_str();
  }

  public count(): number {
    return this.doc.count();
  }

  // Version of the document at a given point in time; if no
  // time specified, gives the version right now.
  // If not fully initialized, will return undefined
  public version(time?: Date): Document {
    this.assert_table_is_ready("patches");
    return this.patch_list.value(time);
  }

  /* Compute version of document if the patches at the given times
     were simply not included.  This is a building block that is
     used for implementing undo functionality for client editors. */
  public version_without(times: Date[]): Document {
    this.assert_table_is_ready("patches");
    return this.patch_list.value(undefined, undefined, times);
  }

  public revert(version: Date): void {
    const doc = this.version(version);
    if (doc == null) {
      throw Error(`no document with version ${version}`);
    }
    this.set_doc(doc);
  }

  /* Undo/redo public api.
  Calling this.undo and this.redo returns the version of
  the document after the undo or redo operation, but does
  NOT otherwise change anything! The caller can then do what
  they please with that output (e.g., update the UI).
  The one state change is that the first time calling this.undo
  or this.redo switches into undo/redo state in which additional
  calls to undo/redo move up and down the stack of changes made
  by this user during this session.

  Call this.exit_undo_mode() to exit undo/redo mode.

  Undo and redo *only* impact changes made by this user during
  this session.  Other users edits are unaffected, and work by
  this same user working from another browser tab or session is
  also unaffected.

  Finally, undo of a past patch by definition means "the state
  of the document" if that patch was not applied.  The impact
  of undo is NOT that the patch is removed from the patch history;
  instead it just returns a document here that the client can
  do something with, which may result in future patches.   Thus
  clients could implement a number of different undo strategies
  without impacting other clients code at all.
  */
  public undo(): Document {
    const prev = this._undo();
    this.set_doc(prev);
    return prev;
  }

  public redo(): Document {
    const next = this._redo();
    this.set_doc(next);
    return next;
  }

  private _undo(): Document {
    this.assert_is_ready();
    let state = this.undo_state;
    if (state == null) {
      // not in undo mode
      state = this.undo_state = this.init_undo_state();
    }
    if (state.pointer === state.my_times.length) {
      // pointing at live state (e.g., happens on entering undo mode)
      const value: Document = this.version(); // last saved version
      const live: Document = this.doc;
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

  private _redo(): Document {
    this.assert_is_ready();
    const state = this.undo_state;
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

  public in_undo_mode(): boolean {
    return this.undo_state != null;
  }

  public exit_undo_mode(): void {
    this.undo_state = undefined;
  }

  private init_undo_state(): UndoState {
    if (this.undo_state != null) {
      return this.undo_state;
    }
    const my_times = keys(this.my_patches).map(x => new Date(parseInt(x)));
    my_times.sort(cmp_Date);
    return (this.undo_state = {
      my_times,
      pointer: my_times.length,
      without: []
    });
  }

  /* Make it so the local hub project will automatically save
     the file to disk periodically. */
  private init_project_autosave(): void {
    // Do not autosave sagews until we resolve
    // https://github.com/sagemathinc/cocalc/issues/974
    if (
      !LOCAL_HUB_AUTOSAVE_S ||
      !this.client.is_project() ||
      this.project_autosave_timer ||
      endswith(this.path, ".sagews")
    ) {
      return;
    }

    // Explicit cast due to node vs browser typings.
    this.project_autosave_timer = <any>(
      setInterval(this.save_to_disk.bind(this), LOCAL_HUB_AUTOSAVE_S * 1000)
    );
  }

  // account_id of the user who made the edit at
  // the given point in time.
  public account_id(time: Date): string {
    this.assert_is_ready();
    return this.users[this.user_id(time)];
  }

  /* Approximate time when patch with given timestamp was
     actually sent to the server; returns undefined if time
     sent is approximately the timestamp time.  Only not undefined
     when there is a significant difference. */
  public time_sent(time: Date): Date | undefined {
    this.assert_table_is_ready("patches");
    return this.patch_list.time_sent(time);
  }

  // Integer index of user who made the edit at given
  // point in time.
  public user_id(time: Date): number {
    this.assert_table_is_ready("patches");
    return this.patch_list.user_id(time);
  }

  private syncstring_table_get_one(): Map<string, any> {
    if (this.syncstring_table == null) {
      throw Error("syncstring_table must be defined");
    }
    const t = this.syncstring_table.get_one();
    if (t == null) {
      throw Error("syncstring_table must have an entry");
    }
    return t;
  }

  /* Indicate active interest in syncstring; only updates time
     if last_active is at least min_age_m=5 minutes old (so
     this can be safely called frequently without too much load).
     We do *NOT* use "this.syncstring_table.set(...)" below
     because it is critical to be able to do the touch
     before this.syncstring_table gets initialized, since
     otherwise the initial open a file will be very slow. */
  public async touch(min_age_m: number = 5): Promise<void> {
    let last_active: Date | undefined = undefined;
    if (this.client.is_project()) {
      return;
    }
    if (min_age_m > 0) {
      // if min_age_m is 0 always try to do it immediately;
      // if > 0 check what it was:
      if (this.syncstring_table != null) {
        const t = this.syncstring_table_get_one();
        if (t != null) {
          last_active = t.get("last_active");
          if (
            last_active != null &&
            last_active > server_minutes_ago(min_age_m)
          ) {
            // recently active, so nothing to do.
            return;
          }
        }
      }
    }
    // Now actually do the set.
    // NOTE: it is important to set here, since this is when syncstring
    // is often first created
    await callback2(this.client.query, {
      query: {
        syncstrings: {
          string_id: this.string_id,
          project_id: this.project_id,
          path: this.path,
          deleted: this.deleted,
          last_active: this.client.server_time(),
          doctype: JSON.stringify(this.doctype)
        }
      }
    });
  }

  /* The project calls set_initialized once it has checked for
     the file on disk; this way the frontend knows that the
     syncstring has been initialized in the database, and also
     if there was an error doing the check.
   */
  private async set_initialized(
    error: string,
    read_only: boolean,
    size: number
  ): Promise<void> {
    this.assert_table_is_ready("syncstring");
    this.dbg("set_initialized")();
    const init = { time: this.client.server_time(), size, error };
    this.syncstring_table.set({
      string_id: this.string_id,
      project_id: this.project_id,
      path: this.path,
      init,
      read_only
    });
    await this.syncstring_table.save();
  }

  /* List of timestamps of the versions of this string in the sync
     table that we opened to start editing (so starts with what was
     the most recent snapshot when we started).  The list of timestamps
     is sorted from oldest to newest. */
  public versions(): Date[] {
    this.assert_table_is_ready("patches");
    const v: Date[] = [];
    const s: Map<string, any> | undefined = this.patches_table.get();
    if (s == null) {
      // shouldn't happen do to assert_is_ready above.
      throw Error("patches_table must be initialized");
    }
    s.map((x, _) => {
      v.push(x.get("time"));
    });
    v.sort(cmp_Date);
    return v;
  }

  /* List of all known timestamps of versions of this string, including
     possibly much older versions than returned by this.versions(), in
     case the full history has been loaded.  The list of timestamps
     is sorted from oldest to newest. */
  public all_versions(): Date[] {
    this.assert_table_is_ready("patches");
    return this.patch_list.versions();
  }

  public last_changed(): Date {
    const v = this.versions();
    if (v.length > 0) {
      return v[v.length - 1];
    } else {
      return new Date(0);
    }
  }

  // Close synchronized editing of this string; this stops listening
  // for changes and stops broadcasting changes.
  public close(): void {
    if (this.state === "closed") {
      return;
    }
    this.set_state("closed");
    this.emit("close");

    // must be after this.emit('close') above, so they know
    // what happened and can respond to it.
    this.removeAllListeners();

    if (this.periodically_touch_timer) {
      clearInterval(this.periodically_touch_timer as any);
      this.periodically_touch_timer = 0;
    }
    if (this.project_autosave_timer) {
      clearInterval(this.project_autosave_timer as any);
      this.project_autosave_timer = 0;
    }

    delete this.cursor_map;
    delete this.users;
    this.patch_update_queue = [];

    if (this.syncstring_table != null) {
      this.syncstring_table.close();
      delete this.syncstring_table;
    }

    if (this.patches_table != null) {
      this.patches_table.close();
      delete this.patches_table;
    }

    if (this.patch_list != null) {
      this.patch_list.close();
      delete this.patch_list;
    }

    if (this.cursors_table != null) {
      this.cursors_table.close();
      delete this.cursors_table;
    }

    if (this.client.is_project()) {
      this.update_watch_path(); // no input = closes it
    }

    if (this.evaluator != null) {
      this.evaluator.close();
      delete this.evaluator;
    }

    delete this.settings;
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

    this.syncstring_table = await this.client.synctable_project(
      this.project_id,
      query,
      [{ ephemeral: false }]
    );
    await this.handle_syncstring_update();
    this.syncstring_table.on(
      "change",
      this.handle_syncstring_update.bind(this)
    );

    // Wait until syncstring is not archived -- if we open an
    // older syncstring, the patches may be archived,
    // and we have to wait until
    // after they have been pulled from blob storage before
    // we init the patch table, load from disk, etc.
    function is_not_archived(): boolean {
      const ss = this.syncstring_table_get_one();
      if (ss != null) {
        return !ss.get("archived");
      } else {
        return false;
      }
    }
    await this.syncstring_table.wait(is_not_archived.bind(this), 120);
  }

  // Used for internal debug logging
  private dbg(_f: string = ""): Function {
    return (..._) => {};
    //    return this.client.dbg(`sync-doc("${this.path}").${_f}`);
  }

  private async init_all(): Promise<void> {
    if (this.state !== "init") {
      throw Error("connect can only be called in init state");
    }
    const log = this.dbg("init_all");

    // It is critical to do a quick initial touch so file gets
    // opened on the backend or syncstring gets created (otherwise,
    // creation of various changefeeds below will FATAL fail).
    log("touch");
    await this.touch(0);
    this.assert_not_closed();
    log("syncstring_table");
    await this.init_syncstring_table();
    this.assert_not_closed();
    log("patch_list, cursors, evaluator");
    await Promise.all([
      this.init_patch_list(),
      this.init_cursors(),
      this.init_evaluator()
    ]);

    this.assert_not_closed();
    log("periodic_touch");
    this.init_periodic_touch();
    log("file_use_interval");
    this.init_file_use_interval();

    if (this.client.is_project()) {
      log("load_from_disk");
      // This sets initialized, which is needed to be fully ready.
      await this.load_from_disk_if_newer();
      log("done loading from disk");
    }

    log("wait_until_fully_ready");
    await this.wait_until_fully_ready();

    this.assert_not_closed();

    if (this.client.is_project()) {
      log("init autosave");
      this.init_project_autosave();
    } else {
      // Ensure file is undeleted when explicitly open.
      log("undelete");
      await this.undelete();
      this.assert_not_closed();
    }
    log("done");
  }

  private init_periodic_touch(): void {
    if (!this.client.is_user() || this.periodically_touch_timer) {
      return;
    }
    this.touch(1);
    // touch every few minutes while syncstring is open, so that project
    // (if open) keeps its side open
    this.periodically_touch_timer = <any>(
      setInterval(
        () => this.touch(TOUCH_INTERVAL_M / 2),
        1000 * 60 * TOUCH_INTERVAL_M
      )
    );
  }

  // wait until the syncstring table is ready to be
  // used (so extracted from archive, etc.),
  private async wait_until_fully_ready(): Promise<void> {
    const dbg = this.dbg("wait_until_fully_ready");
    dbg();
    this.assert_not_closed();
    function is_init_and_not_archived(t: SyncTable): any {
      this.assert_not_closed();
      const tbl = t.get_one();
      if (tbl == null) {
        dbg("null");
        return false;
      }
      // init must be set in table and archived must NOT be
      // set, so patches are loaded from blob store.
      const init = tbl.get("init");
      if (init && !tbl.get("archived")) {
        dbg("good to go");
        return init.toJS();
      } else {
        dbg("not init yet");
        return false;
      }
    }
    dbg("waiting for init...");
    const init = await this.syncstring_table.wait(
      is_init_and_not_archived.bind(this),
      0
    );
    dbg("init done");

    if (this.client.is_user() && this.patch_list.count() === 0 && init.size) {
      dbg("waiting for patches for nontrivial file");
      // normally this only happens in a later event loop,
      // so force it now.
      dbg("handling patch update queue since", this.patch_list.count());
      await this.handle_patch_update_queue();
      dbg("done handling, now ", this.patch_list.count());
      if (this.patch_list.count() === 0) {
        // wait for a change -- i.e., project loading the file from
        // disk and making available...  Because init.size > 0, we know that
        // there must be SOMETHING in the patches table once initialization is done.
        // This is the root cause of https://github.com/sagemathinc/cocalc/issues/2382
        await once(this.patches_table, "change");
        dbg("got patches_table change");
        await this.handle_patch_update_queue();
        dbg("handled update queue");
      }
    }
    this.emit("init");
  }

  private assert_table_is_ready(table: string): void {
    const t = this[`${table}_table`];
    if (t == null || t.get_state() != "connected") {
      throw Error(
        `Table ${table} must be connected.  string_id=${this.string_id}`
      );
    }
  }

  public assert_is_ready(): void {
    if (this.state !== "ready") {
      throw Error("must be ready");
    }
  }

  public async wait_until_ready(): Promise<void> {
    this.assert_not_closed();
    if (this.state !== ("ready" as State)) {
      // wait for a state change to ready.
      await once(this, "ready");
    }
  }

  /* Calls wait for the corresponding patches SyncTable, if
     it has been defined.  If it hasn't been defined, it waits
     until it is defined, then calls wait.  Timeout only starts
     when patches_table is already initialized.
  */
  public async wait(until: Function, timeout: number = 30): Promise<any> {
    await this.wait_until_ready();
    return await wait({ obj: this, until, timeout, change_event: "change" });
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
          id: [this.string_id],
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
    const dbg = this.dbg("load_from_disk_if_newer");
    let is_read_only: boolean = false;
    let size: number = 0;
    let error: string = "";
    try {
      dbg("check if path exists");
      if (await callback2(this.client.path_exists, { path: this.path })) {
        // the path exists
        dbg("path exists -- stat file");
        const stats = await callback2(this.client.path_stat, {
          path: this.path
        });
        if (stats.ctime > last_changed) {
          dbg("disk file changed more recently than edits, so loading");
          size = await this.load_from_disk();
          dbg("loaded");
        } else {
          dbg("stick with database version");
        }
        dbg("checking if read only");
        is_read_only = await this.file_is_read_only();
        dbg("read_only", is_read_only);
      }
    } catch (err) {
      error = `${err.toString()} -- ${err.stack}`;
    }

    await this.set_initialized(error, is_read_only, size);
    dbg("done");
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
    if (this.doctype.patch_format != null) {
      (query as any).format = this.doctype.patch_format;
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

    const patch_list = new SortedPatchList(this._from_str);

    this.patches_table = await this.client.synctable_project(
      this.project_id,
      { patches: this.patch_table_query(this.last_snapshot) },
      [{ ephemeral: false }],
      this.patch_interval
    );
    this.assert_not_closed();

    patch_list.add(this.get_patches());

    const doc = patch_list.value();
    this.last = this.doc = doc;
    this.patches_table.on("change", this.handle_patch_update.bind(this));
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
            new_time = this.patch_list.next_available_time(new Date(t), this._user_id, this._users.length)
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
    // We make cursors an ephemeral table, since there is no
    // need to persist it to the database, obviously!
    this.cursors_table = await this.client.synctable_project(
      this.project_id,
      query,
      [{ ephemeral: true }]
    );
    this.assert_not_closed();

    // cursors now initialized; first initialize the
    // local this._cursor_map, which tracks positions
    // of cursors by account_id:
    const s = this.cursors_table.get();
    if (s == null) {
      throw Error("bug -- get should not return null once table initialized");
    }
    s.map((locs: any[], k: string) => {
      const u = JSON.parse(k);
      if (u != null) {
        this.cursor_map = this.cursor_map.set(this.users[u[1]], locs);
      }
    });
    this.cursors_table.on("change", this.handle_cursors_change.bind(this));
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

  /* Returns from account_id to list
     of cursor positions, if cursors are enabled.
  */
  public get_cursors(): Map<string, any[]> {
    const account_id: string = this.client.client_id();
    let map = this.cursor_map;
    if (
      map.has(account_id) &&
      this.cursor_last_time >= map.getIn([account_id, "time"])
    ) {
      map = map.delete(account_id);
    }
    return map;
  }

  /* Set settings map.  (no-op if not yet initialized
     -- thus DO NOT call until initialized...)
  */
  public set_settings(obj): void {
    this.assert_is_ready();
    this.syncstring_table.set({
      string_id: this.string_id,
      settings: obj
    });
  }

  // get settings object
  public get_settings(): Map<string, any> {
    this.assert_is_ready();
    return this.syncstring_table_get_one().get("settings", Map());
  }

  /*
  Save current live syncdoc to backend.  It's safe to
  call this frequently or multiple times at once, since
  it is wrapped in reuseInFlight in the constructor.

  Function only returns when there is nothing needing
  saving.

  Save any changes we have as a new patch.
  Returns true if there are potentially
  unsaved changes when _save is done.
  */
  public async save(): Promise<void> {
    const dbg = this.dbg("save");
    // We just keep trying while syncdoc is ready and there
    // are changes that have not been saved (due to this.doc
    // changing during the while loop!).
    if (this.doc == null || this.last == null) {
      dbg("bug -- not ready");
      throw Error("bug -- cannot save if doc and last are not initialized");
    }
    while (!this.doc.is_equal(this.last)) {
      dbg("something to save");
      const doc = this.doc;
      // TODO: put in a delay if just saved too recently?
      //       Or maybe won't matter since not using database?
      if (this.handle_patch_update_queue_running) {
        dbg("wait until the update queue is done");
        await once(this, "handle_patch_update_queue_done");
        // but wait until next loop (so as to check that needed
        // and state still ready).
        continue;
      }
      dbg("Compute new patch and send it.");
      await this.sync_remote_and_doc();
      dbg("Patch sent, now make a snapshot if we are due for one.");
      this.snapshot_if_necessary();
      // Emit event since this syncstring was
      // changed locally (or we wouldn't have had
      // to save at all).
      this.emit("user_change");
      if (doc.is_equal(this.doc)) {
        dbg("no change during loop -- done!");
        return;
      }
    }
  }

  private next_patch_time(): Date {
    let time = this.client.server_time();
    const min_time = this.patch_list.newest_patch_time();
    if (min_time != null && min_time >= time) {
      time = new Date(min_time.valueOf() + 1);
    }
    time = this.patch_list.next_available_time(
      time,
      this.my_user_id,
      this.users.length
    );
    return time;
  }

  undelete(): void {
    this.assert_not_closed();
    // Version with deleted set to false:
    const x = this.syncstring_table_get_one().set("deleted", false);
    // Now write that as new version to table.
    this.syncstring_table.set(x);
  }

  // Promise resolves when save to the backend done
  private async save_patch(time: Date, patch: XPatch): Promise<void> {
    this.assert_not_closed();
    const obj: any = {
      // version for database
      string_id: this.string_id,
      time,
      patch: JSON.stringify(patch),
      user_id: this.my_user_id
    };

    this.my_patches[time.valueOf()] = obj;

    if (this.doctype.patch_format != null) {
      obj.format = this.doctype.patch_format;
    }
    if (this.deleted) {
      // file was deleted but now change is being made, so undelete it.
      // TODO: maybe change to explicit user request!
      await this.undelete();
    }
    if (this.save_patch_prev != null) {
      // timestamp of last saved patch during this session
      obj.prev = this.save_patch_prev;
    }
    this.save_patch_prev = time;

    // If in undo mode put the just-created patch in our
    // without timestamp list, so it won't be included
    // when doing undo/redo.
    if (this.undo_state != null) {
      this.undo_state.without.unshift(time);
    }

    //console.log 'saving patch with time ', time.valueOf()
    const x = this.patches_table.set(obj, "none");
    const y = this.process_patch(x, undefined, undefined, patch);
    if (y != null) {
      this.patch_list.add([y]);
    }
  }

  /* Create and store in the database a snapshot of the state
     of the string at the given point in time.  This should
     be the time of an existing patch.
  */
  private async snapshot(time: Date, force: boolean = false): Promise<void> {
    const x = this.patch_list.patch(time);
    if (x == null) {
      throw Error(`no patch at time ${time}`);
    }
    if (x.snapshot != null && !force) {
      // there is already a snapshot at this point in time,
      // so nothing further to do.
      return;
    }

    const snapshot: string = this.patch_list.value(time, force).to_str();
    // save the snapshot itself in the patches table.
    const obj: any = {
      string_id: this.string_id,
      time,
      patch: JSON.stringify(x.patch),
      snapshot,
      user_id: x.user_id
    };
    if (force) {
      /* CRITICAL: We are sending the patch/snapshot later, but
         it was valid.   It's important to make this clear or
         this.handle_offline will recompute this snapshot and
         try to update sent on it again, which leads to serious
         problems!
      */
      obj.sent = time;
    }
    // also set snapshot in the this.patch_list, which
    // helps with optimization
    x.snapshot = obj.snapshot;
    this.patches_table.set(obj, "none");
    await this.patches_table.save();
    /* CRITICAL: Only save the snapshot time in the database
       after the set in the patches table was saved
       -- otherwise if the user refreshes their
       browser (or visits later) they lose all their
       early work!
    */
    this.syncstring_table.set({
      string_id: this.string_id,
      project_id: this.project_id,
      path: this.path,
      last_snapshot: time
    });
    await this.syncstring_table.save();
    this.last_snapshot = time;
  }

  // Have a snapshot every this.snapshot_interval patches, except
  // for the very last interval.
  private async snapshot_if_necessary(): Promise<void> {
    const time = this.patch_list.time_of_unmade_periodic_snapshot(
      this.snapshot_interval
    );
    if (time != null) {
      await this.snapshot(time);
    }
  }

  /*- x - patch object
    - time0, time1: optional range of times
        return undefined if patch not in this range
    - patch: if given will be used as an actual patch
        instead of x.patch, which is a JSON string.
  */
  private process_patch(
    x: Map<string, any>,
    time0?: Date,
    time1?: Date,
    patch?: any
  ): Patch | undefined {
    let t = x.get("time");
    if (!is_date(t)) {
      // who knows what is in the database...
      try {
        t = ISO_to_Date(t);
        if (isNaN(t)) {
          // ignore patches with bad times
          return;
        }
      } catch (err) {
        // ignore patches with invalid times
        return;
      }
    }
    const time: Date = t;
    if ((time0 != null && time < time0) || (time1 != null && time > time1)) {
      // out of range
      return;
    }

    const user_id: number = x.get("user_id");
    const sent: Date = x.get("sent");
    const prev: Date | undefined = x.get("prev");
    if (patch == null) {
      /* Do **NOT** use misc.from_json, since we definitely
         do not want to unpack ISO timestamps as Date,
         since patch just contains the raw patches from
         user editing.  This was done for a while, which
         led to horrific bugs in some edge cases...
         See https://github.com/sagemathinc/cocalc/issues/1771
      */
      if (x.has("patch")) {
        patch = JSON.parse(x.get("patch"));
      } else {
        patch = [];
      }
    }

    const snapshot: string = x.get("snapshot");
    const obj: any = {
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

  /* Return all patches with time such that
            time0 <= time <= time1;
     If time0 undefined then sets time0 equal to time of last_snapshot.
     If time1 undefined treated as +oo.
  */
  private get_patches(time0?: Date, time1?: Date): Patch[] {
    this.assert_table_is_ready("patches");

    if (time0 == null) {
      time0 = this.last_snapshot;
    }
    // m below is an immutable map with keys the string that
    // is the JSON version of the primary key
    // [string_id, timestamp, user_number].
    const m: Map<string, any> | undefined = this.patches_table.get();
    if (m == null) {
      // won't happen because of assert above.
      throw Error("patches_table must be initialized");
    }
    const v: Patch[] = [];
    m.forEach((x, _) => {
      const p = this.process_patch(x, time0, time1);
      if (p != null) {
        return v.push(p);
      }
    });
    v.sort(patch_cmp);
    return v;
  }

  public has_full_history(): boolean {
    return !this.last_snapshot || this.load_full_history_done;
  }

  public async load_full_history(): Promise<void> {
    //dbg = this.dbg("load_full_history")
    //dbg()
    if (this.has_full_history()) {
      //dbg("nothing to do, since complete history definitely already loaded")
      return;
    }
    const query = this.patch_table_query();
    const result = await callback2(this.client.query, {
      query: { patches: [query] }
    });
    const v: Patch[] = [];
    // process_patch assumes immutable objects
    fromJS(result.query.patches).forEach(x => {
      const p = this.process_patch(x, new Date(0), this.last_snapshot);
      if (p != null) {
        v.push(p);
      }
    });
    this.patch_list.add(v);
    this.load_full_history_done = true;
    return;
  }

  public show_history(opts = {}): void {
    this.patch_list.show_history(opts);
  }

  public get_path(): string {
    return this.path;
  }

  public get_project_id(): string {
    return this.project_id;
  }

  public set_snapshot_interval(n: number): void {
    this.syncstring_table.set(
      this.syncstring_table_get_one().set("snapshot_interval", n)
    );
  }

  /* Check if any patches that just got confirmed as saved
     are relatively old; if so, we mark them as such and
     also possibly recompute snapshots.
  */
  private async handle_offline(data): Promise<void> {
    //dbg = this.dbg("handle_offline")
    //dbg("data='#{misc.to_json(data)}'")
    this.assert_not_closed();
    const now: Date = this.client.server_time();
    let oldest: Date | undefined = undefined;
    for (let obj of data) {
      if (obj.sent) {
        // CRITICAL: ignore anything already processed! (otherwise, infinite loop)
        continue;
      }
      if (now.valueOf() - obj.time.valueOf() >= 1000 * OFFLINE_THRESH_S) {
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
      for (let snapshot_time of this.patch_list.snapshot_times()) {
        if (snapshot_time >= oldest) {
          //console.log("recomputing snapshot #{snapshot_time}")
          await this.snapshot(snapshot_time, true);
        }
      }
    }
  }

  private handle_syncstring_save_state(state: string, time: Date): void {
    /* This is used to make it possible to emit a
       'save-to-disk' event, whenever the state changes
       to indicate a save completed.

       NOTE: it is intentional that this.syncstring_save_state is not defined
       the first time this function is called, so that save-to-disk
       with last save time gets emitted on initial load (which, e.g., triggers
       latex compilation properly in case of a .tex file).
    */
    if (state === "done" && this.syncstring_save_state !== "done") {
      this.emit("save-to-disk", time);
    }

    if (
      this.state === "ready" &&
      this.client.is_project() &&
      this.syncstring_save_state !== "requested" &&
      state === "requested"
    ) {
      // state just changed to requesting a save to disk...
      // so we do it (unless of course syncstring is still
      // being initialized).
      this.save_to_disk();
    }

    this.syncstring_save_state = state;
  }

  private async handle_syncstring_update(): Promise<void> {
    const dbg = this.dbg("handle_syncstring_update");
    dbg();
    if (this.state === "closed") {
      return;
    }

    const data = this.syncstring_table_get_one();
    const x = data != null ? data.toJS() : undefined;

    if (x != null && x.save != null) {
      this.handle_syncstring_save_state(x.save.state, x.save.time);
    }

    dbg(JSON.stringify(x));
    // Below "x.users == null" works because the initial touch sets
    // only string_id and last_active, and nothing else.
    if (x == null || x.users == null) {
      dbg("new_document");
      await this.handle_syncstring_update_new_document();
    } else {
      dbg("update_existing");
      await this.handle_syncstring_update_existing_document(x, data);
    }
  }

  private async handle_syncstring_update_new_document(): Promise<void> {
    // Brand new document
    this.emit("load-time-estimate", { type: "new", time: 1 });
    this.last_snapshot = undefined;
    this.snapshot_interval =
      schema.SCHEMA.syncstrings.user_query.get.fields.snapshot_interval;

    // Brand new syncstring
    // TODO: worry about race condition with everybody making themselves
    // have user_id 0... ?
    this.my_user_id = 0;
    this.users = [this.client.client_id()];
    const obj = {
      string_id: this.string_id,
      project_id: this.project_id,
      path: this.path,
      last_snapshot: this.last_snapshot,
      users: this.users,
      deleted: this.deleted,
      doctype: JSON.stringify(this.doctype)
    };
    this.syncstring_table.set(obj);
    this.settings = Map();
    this.emit("metadata-change");
    this.emit("settings-change", this.settings);
  }

  private async handle_syncstring_update_existing_document(
    x: any,
    data: Map<string, any>
  ): Promise<void> {
    // Existing document.

    if (this.path == null) {
      // We just opened the file -- emit a load time estimate.
      if (x.archived) {
        this.emit("load-time-estimate", { type: "archived", time: 3 });
      } else {
        this.emit("load-time-estimate", { type: "ready", time: 1 });
      }
    }
    // TODO: handle doctype change here (?)
    this.last_snapshot = x.last_snapshot;
    this.snapshot_interval = x.snapshot_interval;
    this.users = x.users;
    this.project_id = x.project_id;
    this.path = x.path;

    const settings = data.get("settings", Map());
    if (settings !== this.settings) {
      this.settings = settings;
      this.emit("settings-change", settings);
    }

    if (this.deleted != null && x.deleted && !this.deleted) {
      // change to deleted
      this.emit("deleted");
    }
    this.deleted = x.deleted;

    // Ensure that this client is in the list of clients
    const client_id: string = this.client.client_id();
    this.my_user_id = this.users.indexOf(client_id);
    if (this.my_user_id === -1) {
      this.my_user_id = this.users.length;
      this.users.push(client_id);
      this.syncstring_table.set({
        string_id: this.string_id,
        project_id: this.project_id,
        path: this.path,
        users: this.users
      });
      await this.syncstring_table.save();
    }

    this.emit("metadata-change");
  }

  private async init_watch(): Promise<void> {
    if (!this.client.is_project()) {
      return;
    }

    // If path isn't being properly watched, make it so.
    if (this.watch_path !== this.path) {
      await this.update_watch_path(this.path);
    }

    await this.pending_save_to_disk();
  }

  private async pending_save_to_disk(): Promise<void> {
    this.assert_table_is_ready("syncstring");
    if (!this.client.is_project()) {
      return;
    }

    const x = this.syncstring_table.get_one();
    // Check if there is a pending save-to-disk that is needed.
    if (x != null && x.getIn(["save", "state"]) === "requested") {
      await this.save_to_disk();
    }
  }

  private async update_watch_path(path?: string): Promise<void> {
    const dbg = this.dbg("update_watch_path");
    if (this.file_watcher != null) {
      // clean up
      dbg("close");
      this.file_watcher.close();
      delete this.file_watcher;
      delete this.watch_path;
    }
    if (path == null) {
      dbg("not opening another watcher");
      this.watch_path = path;
      return;
    }
    if (this.watch_path != null) {
      dbg("watch_path already defined");
      return;
    }
    dbg("opening watcher...");
    if (this.state === "closed") {
      throw Error("must not be closed");
    }
    this.watch_path = path;
    if (!(await callback2(this.client.path_exists, { path }))) {
      // path does not exist
      dbg(`write '${path}' to disk from syncstring in-memory database version`);
      const data = this.to_str();
      await callback2(this.client.write_file, { path, data });
      dbg(`wrote '${path}' to disk`);
    }

    dbg("now requesting to watch file");
    this.file_watcher = this.client.watch_file({ path });
    this.file_watcher.on("change", this.handle_file_watcher_change.bind(this));
    this.file_watcher.on("delete", this.handle_file_watcher_delete.bind(this));
  }

  private handle_file_watcher_change(ctime: Date): void {
    const dbg = this.dbg("handle_file_watcher_change");
    const time: number = ctime.valueOf();
    dbg(
      `file_watcher: change, ctime=${time}, this.save_to_disk_start_ctime=${
        this.save_to_disk_start_ctime
      }, this.save_to_disk_end_ctime=${this.save_to_disk_end_ctime}`
    );
    if (
      time -
        (this.save_to_disk_start_ctime != null
          ? this.save_to_disk_start_ctime
          : 0) >=
      7 * 1000
    ) {
      // last attempt to save was at least 7s ago, so definitely
      // this change event was not caused by it.
      dbg("load_from_disk since no recent save");
      this.load_from_disk();
      return;
    }
    if (this.save_to_disk_end_ctime == null) {
      // save event started less than 15s and isn't done.
      // ignore this load.
      dbg(
        "unfinished this.save_to_disk just happened, so ignoring file change"
      );
      return;
    }
    if (this.save_to_disk_start_ctime == null) {
      // this can't happen due to checks above, but it makes
      // typescript happier.
      return;
    }
    if (
      this.save_to_disk_start_ctime <= time &&
      time <= this.save_to_disk_end_ctime
    ) {
      // changed triggered during the save
      dbg("change happened during this.save_to_disk, so ignoring file change");
      return;
    }
    // Changed happened near to when there was a save... ignore.
    dbg("happened too close to recent save, so ignoring");
  }

  private async handle_file_watcher_delete(): Promise<void> {
    const dbg = this.dbg("handle_file_watcher_delete");
    this.assert_is_ready();
    dbg("delete: setting deleted=true and closing");
    this.from_str("");
    await this.save();
    // NOTE: setting deleted=true must be done **after** setting
    // document to blank above,
    // since otherwise the set would set deleted=false.
    this.syncstring_table.set(
      this.syncstring_table_get_one().set("deleted", true)
    );
    // make sure deleted:true is saved:
    await this.syncstring_table.save();
    this.close();
  }

  private async load_from_disk(): Promise<number> {
    const path = this.path;
    const dbg = this.dbg("load_from_disk");
    dbg();
    let exists: boolean = await callback2(this.client.path_exists, { path });
    let size: number;
    if (!exists) {
      dbg("file no longer exists -- setting to blank");
      size = 0;
      this.from_str("");
    } else {
      dbg("file exists");
      await this.update_if_file_is_read_only();
      const data = await callback2(this.client.path_read, {
        path,
        maxsize_MB: MAX_FILE_SIZE_MB
      });
      size = data.length;
      dbg(`got it -- length=${size}`);
      this.from_str(data);
      // we also know that this is the version on disk, so we update the hash
      await this.set_save({
        state: "done",
        error: "",
        hash: hash_string(data)
      });
    }
    // save new version (just set via from_str) to database.
    await this.save();
    return size;
  }

  private async set_save(x: {
    state: string;
    error: string;
    hash?: number;
    expected_hash?: number;
    time?: number;
  }): Promise<void> {
    this.assert_table_is_ready("syncstring");
    // set timestamp of when the save happened; this can be useful
    // for coordinating running code, etc.... and is just generally useful.
    x.time = new Date().valueOf();
    this.syncstring_table.set(
      this.syncstring_table_get_one().set("save", fromJS(x))
    );
    await this.syncstring_table.save();
  }

  private async set_read_only(read_only: boolean): Promise<void> {
    this.assert_table_is_ready("syncstring");
    this.syncstring_table.set(
      this.syncstring_table_get_one().set("read_only", read_only)
    );
    await this.syncstring_table.save();
  }

  public is_read_only(): boolean {
    this.assert_table_is_ready("syncstring");
    return this.syncstring_table_get_one().get("read_only");
  }

  public async wait_until_read_only_known(): Promise<void> {
    await this.wait_until_ready();
    function read_only_defined(t: SyncTable): boolean {
      const x = t.get_one();
      if (x == null) {
        return false;
      }
      return x.get("read_only") != null;
    }
    await this.syncstring_table.wait(read_only_defined, 5 * 60);
  }

  /* Returns true if the current live version of this document has
     a different hash than the version mostly recently saved to disk.
     I.e., if there are changes that have not yet been **saved to
     disk**.  See the other function has_uncommitted_changes below
     for determining whether there are changes that haven't been
     commited to the database yet.  Returns *undefined* if
     initialization not even done yet. */
  public has_unsaved_changes(): boolean | undefined {
    if (this.state !== "ready") {
      return;
    }
    return this.hash_of_saved_version() !== this.hash_of_live_version();
  }

  // Returns hash of last version saved to disk (as far as we know).
  public hash_of_saved_version(): number | undefined {
    if (this.state !== "ready") {
      return;
    }
    return this.syncstring_table_get_one().getIn(["save", "hash"]);
  }

  /* Return hash of the live version of the document,
     or undefined if the document isn't loaded yet.
     (TODO: write faster version of this for syncdb, which
     avoids converting to a string, which is a waste of time.) */
  hash_of_live_version(): number | undefined {
    if (this.state !== "ready") {
      return;
    }
    return hash_string(this.doc.to_str());
  }

  /* Return true if there are changes to this syncstring that
     have not been committed to the database (with the commit
     acknowledged).  This does not mean the file has been
     written to disk; however, it does mean that it safe for
     the user to close their browser.
  */
  public has_uncommitted_changes(): boolean {
    if (this.state !== "ready") {
      return false;
    }
    return this.patches_table.has_uncommitted_changes();
  }

  /* Initiates a save of file to disk, then waits for the
     state to change. */
  public async save_to_disk(): Promise<void> {
    this.assert_is_ready();
    const dbg = this.dbg("save_to_disk");
    dbg("initiating the save");
    if (!this.has_unsaved_changes()) {
      // no unsaved changes, so don't save --
      // CRITICAL: this optimization is assumed by
      // autosave, etc.
      return;
    }

    if (this.is_read_only()) {
      // save should fail if file is read only and there are changes
      throw Error("can't save readonly file with changes to disk");
    }

    if (this.deleted) {
      // nothing to do -- no need to attempt to save if file
      // is already deleted
      return;
    }

    // First make sure any changes are saved to the database.
    // One subtle case where this matters is that loading a file
    // with \r's into codemirror changes them to \n...
    await this.save();

    // Now do actual save to the *disk*.
    await this.save_to_disk_1();
  }

  // Auxiliary function 1 for saving to disk:
  private async save_to_disk_1(): Promise<void> {
    this.assert_is_ready();
    await this.save_to_disk_2();
    this.assert_is_ready();
    await this.wait_for_save_done();
  }

  // wait for save.state to change to state.
  private async wait_for_save_done(): Promise<void> {
    function until(table): boolean {
      return table.get_one().getIn(["save", "state"]) === "done";
    }

    let last_err = undefined;
    async function f(): Promise<void> {
      if (this.state != "ready" || this.deleted) {
        // not ready or deleted - no longer trying to save.
        return;
      }
      try {
        await this.syncstring_table.wait(until, 10);
      } catch (err) {
        // timed out after 10s
        await this.touch(0); // get backend attention!
        throw Error("timed out");
      }
      if (this.state != "ready" || this.deleted) {
        return;
      }
      const err = this.syncstring_table_get_one().getIn(["save", "error"]);
      if (err) {
        last_err = err;
        await this.touch(0); // get backend attention!
        throw Error(err);
      }
      // done, with no error.
      last_err = undefined;
      return;
    }
    await retry_until_success({
      f,
      max_tries: 4
    });
    if (this.state != "ready") {
      return;
    }
    if (last_err && typeof this.client.log_error === "function") {
      this.client.log_error({
        string_id: this.string_id,
        path: this.path,
        project_id: this.project_id,
        error: `Error saving file -- ${last_err}`
      });
    }
  }

  /* Auxiliary function 2 for saving to disk:
     If this is associated with
     a project and has a filename.
     A user (web browsers) sets the save state to requested.
     The project sets the state to saving, does the save
     to disk, then sets the state to done.
  */
  private async save_to_disk_2(): Promise<void> {
    this.assert_is_ready();

    if (this.client.is_user()) {
      return await this.save_to_disk_user();
    }

    try {
      await this.save_to_disk_project();
    } catch (err) {
      this.emit("save_to_disk_project", err);
      throw err;
    }
  }

  private async save_to_disk_user(): Promise<void> {
    this.assert_is_ready();

    if (!this.has_unsaved_changes()) {
      /* Browser client has no unsaved changes,
         so don't need to save --
         CRITICAL: this optimization is assumed by autosave.
       */
      return;
    }
    const x = this.syncstring_table.get_one();
    if (x != null && x.getIn(["save", "state"]) === "requested") {
      // Nothing to do -- save already requested, which is
      // all the browser client has to do.
      return;
    }

    // string version of this doc
    const data: string = this.to_str();
    const expected_hash = hash_string(data);
    await this.set_save({ state: "requested", error: "", expected_hash });
  }

  private async save_to_disk_project(): Promise<void> {
    this.assert_is_ready();

    // check if on-disk version is same as in memory, in
    // which case no save is needed.
    const data = this.to_str(); // string version of this doc
    const hash = hash_string(data);

    /*
    // TODO: put this consistency check back in (?).
    const expected_hash = this.syncstring_table
      .get_one()
      .getIn(["save", "expected_hash"]);
    */

    if (hash === this.hash_of_saved_version()) {
      // No actual save to disk needed; still we better
      // record this fact in table in case it
      // isn't already recorded
      await this.set_save({ state: "done", error: "", hash });
      return;
    }

    const path = this.path;
    if (!path) {
      const err = "cannot save without path";
      await this.set_save({ state: "done", error: err });
      throw Error(err);
    }

    //dbg("project - write to disk file")
    // set window to slightly earlier to account for clock
    // imprecision.
    // Over an sshfs mount, all stats info is **rounded down
    // to the nearest second**, which this also takes care of.
    this.save_to_disk_start_ctime = new Date().valueOf() - 1500;
    this.save_to_disk_end_ctime = undefined;
    try {
      await callback2(this.client.write_file, { path, data });
      this.assert_is_ready();
      const stat = await callback2(this.client.path_stat, { path });
      this.assert_is_ready();
      this.save_to_disk_end_ctime = stat.ctime.valueOf();
      await this.set_save({
        state: "done",
        error: "",
        hash: hash_string(data)
      });
    } catch (err) {
      await this.set_save({ state: "done", error: JSON.stringify(err) });
      throw err;
    }
  }

  /*
    When the underlying synctable that defines the state
    of the document changes due to new remote patches, this
    function is called.
    It handles update of the remote version, updating our
    live version as a result.
  */
  private handle_patch_update(changed_keys): void {
    //console.log("_handle_patch_update #{misc.to_json(changed_keys)}")
    if (changed_keys == null || changed_keys.length === 0) {
      // this happens right now when we do a save.
      return;
    }

    //dbg = this.dbg("_handle_patch_update")
    //dbg(new Date(), changed_keys)
    if (this.patch_update_queue == null) {
      this.patch_update_queue = [];
    }
    for (let key of changed_keys) {
      this.patch_update_queue.push(key);
    }

    // Clear patch update_queue in a later event loop.
    setTimeout(this.handle_patch_update_queue.bind(this), 1);
  }

  /*
  Whenever new patches are added to this.patches_table,
  their timestamp gets added to this.patch_update_queue.
  */
  private async handle_patch_update_queue(): Promise<void> {
    try {
      this.handle_patch_update_queue_running = true;
      while (this.patch_update_queue.length > 0) {
        const v: Patch[] = [];
        for (let key of this.patch_update_queue) {
          const x = this.patches_table.get(key);
          if (x != null) {
            // may be null, e.g., when deleted.
            const t = x.get("time");
            // Only need to process patches that we didn't
            // create ourselves.
            if (t && !this.my_patches[`${t.valueOf()}`]) {
              const p = this.process_patch(x);
              if (p != null) {
                v.push(p);
              }
            }
          }
        }
        this.patch_update_queue = [];
        this.patch_list.add(v);

        // NOTE: The below sync_remote_and_doc can sometimes
        // *cause* new entries to be added to this.patch_update_queue.
        await this.sync_remote_and_doc();

        if (this.patch_update_queue.length > 0) {
          // It is very important that next loop happen in a later
          // event loop to avoid the this.sync_remote_and_doc call
          // in this.handle_patch_update_queue above from causing
          // sync_remote_and_doc to get called from within itself,
          // due to synctable changes being emited on save.
          await delay(1);
        } else {
          // OK, done and nothing in the queue
          // Notify save() to try again -- it may have
          // paused waiting for this to clear.
          this.emit("handle_patch_update_queue_done");
        }
      }
    } finally {
      this.handle_patch_update_queue_running = false;
    }
  }

  /*Merge remote patches and live version to create new live version,
    which is equal to result of applying all patches.

    Only returns once any newly created patches have
    been sent out.
    */
  private async sync_remote_and_doc(): Promise<void> {
    if (this.last == null || this.doc == null) {
      return;
    }

    this.emit("before-change");
    if (!this.last.is_equal(this.doc)) {
      // compute transformation from this.last to this.doc
      const patch = this.last.make_patch(this.doc); // must be nontrivial
      this.last = this.doc;
      // ... and save that to patch table since there
      // is a nontrivial change
      const time = this.next_patch_time();
      await this.save_patch(time, patch);
      if (this.state !== "ready") {
        return;
      }
    }

    const new_remote = this.patch_list.value();
    if (!this.doc.is_equal(new_remote)) {
      // There is a possibility that document changed, so
      // set to new version.
      this.last = this.doc = new_remote;
      this.emit("after-change");
      this.emit_change();
    }
  }

  private emit_change(): void {
    this.emit("change", this.doc.changes(this.before_change));
    this.before_change = this.doc;
  }
}
