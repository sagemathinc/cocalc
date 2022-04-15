/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
SyncDoc -- the core class for editing with a synchronized document.

This code supports both string-doc and db-doc, for editing both
strings and small database tables efficiently, with history,
undo, save to disk, etc.

This code is run *both* in browser clients and under node.js
in projects, and behaves slightly differently in each case.

EVENTS:

- before-change: fired before merging in changes from upstream
- ... TODO
*/

/* OFFLINE_THRESH_S - If the client becomes disconnected from
   the backend for more than this long then---on reconnect---do
   extra work to ensure that all snapshots are up to date (in
   case snapshots were made when we were offline), and mark the
   sent field of patches that weren't saved.   I.e., we rebase
   all offline changes. */
const OFFLINE_THRESH_S = 5 * 60; // 5 minutes.

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
const MAX_FILE_SIZE_MB = 5;

// This parameter determines throttling when broadcasting cursor position
// updates.   Make this larger to reduce bandwidth at the expense of making
// cursors less responsive.
const CURSOR_THROTTLE_MS = 750;

type XPatch = any;

import { EventEmitter } from "events";
import { debounce, throttle } from "lodash";
import { Map, fromJS } from "immutable";
import { delay } from "awaiting";
import {
  callback2,
  cancel_scheduled,
  once,
  retry_until_success,
  reuse_in_flight_methods,
} from "@cocalc/util/async-utils";
import { wait } from "@cocalc/util/async-wait";
import {
  assertDefined,
  close,
  cmp_Date,
  endswith,
  filename_extension,
  keys,
  uuid,
  hash_string,
  is_date,
  ISO_to_Date,
  minutes_ago,
  server_minutes_ago,
} from "@cocalc/util/misc";
import { Evaluator } from "./evaluator";
import { IpywidgetsState } from "./ipywidgets-state";
import * as schema from "@cocalc/util/schema";
import { SyncTable } from "@cocalc/sync/table/synctable";
import {
  Client,
  CompressedPatch,
  DocType,
  Document,
  Patch,
  FileWatcher,
} from "./types";
import { SortedPatchList } from "./sorted-patch-list";
import { patch_cmp } from "./util";
import { export_history, HistoryEntry, HistoryExportOptions } from "./export";

export type State = "init" | "ready" | "closed";
export type DataServer = "project" | "database";

export interface SyncOpts0 {
  project_id: string;
  path: string;
  client: Client;
  patch_interval?: number;

  // file_use_interval defaults to 10000 for chat and 60000
  // for everything else.  Specify 0 to disable.
  file_use_interval?: number;

  string_id?: string;
  cursors?: boolean;
  change_throttle?: number;

  // persistent backend session in project, so only close
  // backend when explicitly requested:
  persistent?: boolean;

  // If true, entire sync-doc is assumed completely ephemeral
  // This option should be set only in the project.
  ephemeral?: boolean;

  // which data/changefeed server to use
  data_server?: DataServer;
}

export interface SyncOpts extends SyncOpts0 {
  from_str: (str: string) => Document;
  doctype: DocType;
}

export interface UndoState {
  my_times: Date[];
  pointer: number;
  without: Date[];
  final?: CompressedPatch;
}

export class SyncDoc extends EventEmitter {
  public project_id: string; // project_id that contains the doc
  private path: string; // path of the file corresponding to the doc
  private string_id: string;
  private my_user_id: number;

  // This id is used for equality test and caching.
  private id: string = uuid();

  private client: Client;
  private _from_str: (str: string) => Document; // creates a doc from a string.

  // Throttling of incoming upstream patches from project to client.
  private patch_interval: number = 250;

  // This is what's actually output by setInterval -- it's
  // not an amount of time.
  private project_autosave_timer: number = 0;

  // throttling of change events -- e.g., is useful for course
  // editor where we have hundreds of changes and the UI gets
  // overloaded unless we throttle and group them.
  private change_throttle: number = 0;

  // file_use_interval throttle: default is 60s for everything
  // except .sage-chat files, where it is 10s.
  private file_use_interval: number;
  private throttled_file_use?: Function;

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

  public evaluator?: Evaluator;

  public ipywidgets_state?: IpywidgetsState;

  private patch_list?: SortedPatchList;

  private last: Document;
  private doc: Document;
  private before_change?: Document;

  private last_user_change: Date = minutes_ago(60);
  private last_save_to_disk_time: Date = new Date(0);

  private last_snapshot: Date | undefined;
  private snapshot_interval: number;

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

  private persistent: boolean = false;
  public readonly data_server: DataServer = "project";

  private last_has_unsaved_changes?: boolean = undefined;

  private ephemeral: boolean = false;

  private sync_is_disabled: boolean = false;
  private delay_sync_timer: any;

  constructor(opts: SyncOpts) {
    super();
    if (opts.string_id === undefined) {
      this.string_id = schema.client_db.sha1(opts.project_id, opts.path);
    } else {
      this.string_id = opts.string_id;
    }

    for (const field of [
      "project_id",
      "path",
      "client",
      "patch_interval",
      "file_use_interval",
      "change_throttle",
      "cursors",
      "doctype",
      "from_patch_str",
      "persistent",
      "data_server",
      "ephemeral",
    ]) {
      if (opts[field] != undefined) {
        this[field] = opts[field];
      }
    }
    this._from_str = opts.from_str;

    // Initialize to time when we create the syncstring, so we don't
    // see our own cursor when we refresh the browser (before we move
    // to update this).
    this.cursor_last_time = this.client?.server_time();

    reuse_in_flight_methods(this, [
      "save",
      "save_to_disk",
      "load_from_disk",
      "handle_patch_update_queue",
    ]);

    if (this.change_throttle) {
      this.emit_change = throttle(this.emit_change, this.change_throttle);
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
    this.assert_not_closed("init");
    const log = this.dbg("init");

    log("initializing all tables...");
    try {
      //const t0 = new Date();
      await this.init_all();
      //console.log(  // TODO remove at some point.
      //  `time to open file ${this.path}: ${new Date().valueOf() - t0.valueOf()}`
      //);
    } catch (err) {
      if (this.state == "closed") {
        return;
      }
      log(`WARNING -- error initializing ${err}`);
      // completely normal that this could happen on frontend - it just means
      // that we closed the file before finished opening it...
      if (this.state != ("closed" as State)) {
        log(
          "Error -- NOT caused by closing during the init_all, so we report it."
        );
        this.emit("error", err);
      }
      await this.close();
      return;
    }

    // Success -- everything perfectly initialized with no issues.
    this.set_state("ready");
    this.init_watch();
    this.emit_change(); // from nothing to something.
  }

  /* Set this user's cursors to the given locs. */
  public set_cursor_locs(locs: any[], side_effect: boolean = false): void {
    if (this.state != "ready") return;
    if (this.cursors_table == null) {
      throw Error("cursors are not enabled");
    }
    const x: {
      string_id: string;
      user_id: number;
      locs: any[];
      time?: Date;
    } = {
      string_id: this.string_id,
      user_id: this.my_user_id,
      locs,
    };
    if (!side_effect) {
      x.time = this.client.server_time();
    }
    if (x.time != null) {
      this.cursor_last_time = x.time;
    }
    this.cursors_table.set(x, "none");
    this.cursors_table.save();
  }

  private init_file_use_interval(): void {
    const is_chat = filename_extension(this.path) === "sage-chat";
    if (this.file_use_interval == null) {
      if (is_chat) {
        this.file_use_interval = 10 * 1000;
      } else {
        this.file_use_interval = 60 * 1000;
      }
    }

    if (!this.file_use_interval || !this.client.is_user()) {
      // file_use_interval has to be nonzero, and we only do
      // this for browser user.
      return;
    }
    //const dbg = this.dbg('init_file_use_interval')
    let action;
    if (is_chat) {
      action = "chat";
    } else {
      action = "edit";
    }
    const file_use = async () => {
      if (!is_chat) {
        await delay(100); // wait a little so my_patches and gets updated.
        // We ONLY count this and record that the file was
        // edited if there was an actual change record in the
        // patches log, by this user, since last time.
        let user_is_active: boolean = false;
        for (const tm in this.my_patches) {
          if (new Date(parseInt(tm)) > this.last_user_change) {
            user_is_active = true;
            break;
          }
        }
        if (!user_is_active) {
          return;
        }
      }
      this.last_user_change = new Date();
      this.client.mark_file({
        project_id: this.project_id,
        path: this.path,
        action,
        ttl: this.file_use_interval,
      });
    };
    this.throttled_file_use = throttle(file_use, this.file_use_interval, {
      leading: true,
    });

    this.on("user-change", this.throttled_file_use as any);
  }

  private set_state(state: State): void {
    this.state = state;
    this.emit(state);
  }

  public get_state(): State {
    return this.state;
  }

  public get_project_id(): string {
    return this.project_id;
  }

  public get_path(): string {
    return this.path;
  }

  public get_string_id(): string {
    return this.string_id;
  }

  public get_my_user_id(): number {
    return this.my_user_id != null ? this.my_user_id : 0;
  }

  private assert_not_closed(desc: string): void {
    if (this.state === "closed") {
      //console.trace();
      throw Error(`must not be closed -- ${desc}`);
    }
  }

  public set_doc(doc: Document, exit_undo_mode: boolean = true): void {
    if (doc.is_equal(this.doc)) {
      // no change.
      return;
    }
    if (exit_undo_mode) this.undo_state = undefined;
    // console.log(`sync-doc.set_doc("${doc.to_str()}")`);
    this.doc = doc;

    // debounced, so don't immediately alert, in case there are many
    // more sets comming in the same loop:
    this.emit_change_debounced();
  }

  // Convenience function to avoid having to do
  // get_doc and set_doc constantly.
  public set(x: any): void {
    this.set_doc(this.doc.set(x));
  }

  public delete(x?: any): void {
    this.set_doc(this.doc.delete(x));
  }

  public get(x?: any): any {
    return this.doc.get(x);
  }

  public get_one(x?: any): any {
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
    // console.log(`sync-doc.from_str("${value}")`);
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
  // If not fully initialized, will throw exception.
  public version(time?: Date): Document {
    this.assert_table_is_ready("patches");
    assertDefined(this.patch_list);
    return this.patch_list.value(time);
  }

  /* Compute version of document if the patches at the given times
     were simply not included.  This is a building block that is
     used for implementing undo functionality for client editors. */
  public version_without(times: Date[]): Document {
    this.assert_table_is_ready("patches");
    assertDefined(this.patch_list);
    return this.patch_list.value(undefined, undefined, times);
  }

  // Revert document to what it was at the given point in time.
  // There doesn't have to be a patch at exactly that point in
  // time -- if there isn't it just uses the patch before that
  // point in time.
  public revert(time: Date): void {
    this.set_doc(this.version(time));
  }

  /* Undo/redo public api.
  Calling this.undo and this.redo returns the version of
  the document after the undo or redo operation, and records
  a commit changing to that.
  The first time calling this.undo switches into undo
  state in which additional
  calls to undo/redo move up and down the stack of changes made
  by this user during this session.

  Call this.exit_undo_mode() to exit undo/redo mode.

  Undo and redo *only* impact changes made by this user during
  this session.  Other users edits are unaffected, and work by
  this same user working from another browser tab or session is
  also unaffected.

  Finally, undo of a past patch by definition means "the state
  of the document" if that patch was not applied.  The impact
  of undo is NOT that the patch is removed from the patch history.
  Instead, it records a new patch that is what would have happened
  had we replayed history with the patches being undone not there.

  Doing any set_doc explicitly exits undo mode automatically.
  */
  public undo(): Document {
    const prev = this._undo();
    this.set_doc(prev, false);
    this.commit();
    return prev;
  }

  public redo(): Document {
    const next = this._redo();
    this.set_doc(next, false);
    this.commit();
    return next;
  }

  private _undo(): Document {
    this.assert_is_ready("_undo");
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
    this.assert_is_ready("_redo");
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
    const my_times = keys(this.my_patches).map((x) => new Date(parseInt(x)));
    my_times.sort(cmp_Date);
    return (this.undo_state = {
      my_times,
      pointer: my_times.length,
      without: [],
    });
  }

  private async save_to_disk_autosave(): Promise<void> {
    const dbg = this.dbg("save_to_disk_autosave");
    dbg();
    try {
      await this.save_to_disk();
    } catch (err) {
      dbg(`failed -- ${err}`);
    }
  }

  /* Make it so the local hub project will automatically save
     the file to disk periodically. */
  private init_project_autosave(): void {
    // Do not autosave sagews until we resolve
    //   https://github.com/sagemathinc/cocalc/issues/974
    // Similarly, do not autosave ipynb because of
    //   https://github.com/sagemathinc/cocalc/issues/5216
    if (
      !LOCAL_HUB_AUTOSAVE_S ||
      !this.client.is_project() ||
      this.project_autosave_timer ||
      endswith(this.path, ".sagews") ||
      endswith(this.path, ".ipynb.sage-jupyter2")
    ) {
      return;
    }

    // Explicit cast due to node vs browser typings.
    this.project_autosave_timer = <any>(
      setInterval(
        this.save_to_disk_autosave.bind(this),
        LOCAL_HUB_AUTOSAVE_S * 1000
      )
    );
  }

  // account_id of the user who made the edit at
  // the given point in time.
  public account_id(time: Date): string {
    this.assert_is_ready("account_id");
    return this.users[this.user_id(time)];
  }

  /* Approximate time when patch with given timestamp was
     actually sent to the server; returns undefined if time
     sent is approximately the timestamp time.  Only defined
     when there is a significant difference, due to editing
     when offline! */
  public time_sent(time: Date): Date | undefined {
    this.assert_table_is_ready("patches");
    assertDefined(this.patch_list);
    return this.patch_list.time_sent(time);
  }

  // Integer index of user who made the edit at given
  // point in time.
  public user_id(time: Date): number {
    this.assert_table_is_ready("patches");
    assertDefined(this.patch_list);
    return this.patch_list.user_id(time);
  }

  private syncstring_table_get_one(): Map<string, any> {
    if (this.syncstring_table == null) {
      throw Error("syncstring_table must be defined");
    }
    const t = this.syncstring_table.get_one();
    if (t == null) {
      // project has not initialized it yet.
      return Map();
    }
    return t;
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
      read_only,
      last_active: this.client.server_time(),
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
    assertDefined(this.patch_list);
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

  private init_table_close_handlers(): void {
    for (const x of ["syncstring", "patches", "cursors"]) {
      const t = this[`${x}_table`];
      if (t != null) {
        t.on("close", () => this.close());
      }
    }
  }

  // Close synchronized editing of this string; this stops listening
  // for changes and stops broadcasting changes.
  public async close(): Promise<void> {
    if (this.state == "closed") {
      return;
    }
    if (this.client.is_user() && this.state == "ready") {
      try {
        await this.save_to_disk();
      } catch (err) {
        // has to be non-fatal since we are closing the document,
        // and of couse we need to clear up everything else.
        // Do nothing here.
      }
    }
    // WARNING: that 'closed' is emitted at the beginning of the
    // close function (before anything async) for the project is
    // assumed in src/packages/project/sync/sync-doc.ts, because
    // that ensures that the moment close is called we lock trying
    // try create the syncdoc again until closing is finished.
    // (This set_state call emits "closed"):
    this.set_state("closed");

    this.emit("close");

    // must be after the emits above, so clients know
    // what happened and can respond.
    this.removeAllListeners();

    if (this.throttled_file_use != null) {
      // Cancel any pending file_use calls.
      cancel_scheduled(this.throttled_file_use);
      (this.throttled_file_use as any).cancel();
    }

    if (this.emit_change != null) {
      // Cancel any pending change emit calls.
      cancel_scheduled(this.emit_change);
    }

    if (this.project_autosave_timer) {
      clearInterval(this.project_autosave_timer as any);
      this.project_autosave_timer = 0;
    }

    this.patch_update_queue = [];

    if (this.syncstring_table != null) {
      await this.syncstring_table.close();
    }

    if (this.patches_table != null) {
      await this.patches_table.close();
    }

    if (this.patch_list != null) {
      await this.patch_list.close();
    }

    if (this.cursors_table != null) {
      await this.cursors_table.close();
    }

    if (this.client.is_project()) {
      this.update_watch_path(); // no input = closes it
    }

    if (this.evaluator != null) {
      await this.evaluator.close();
    }

    if (this.ipywidgets_state != null) {
      await this.ipywidgets_state.close();
    }

    close(this);
    this.set_state("closed");
  }

  // TODO: We **have** to do this on the client, since the backend
  // **security model** for accessing the patches table only
  // knows the string_id, but not the project_id/path.  Thus
  // there is no way currently to know whether or not the client
  // has access to the patches, and hence the patches table
  // query fails.  This costs significant time -- a roundtrip
  // and write to the database -- whenever the user opens a file.
  // This fix should be to change the patches schema somehow
  // to have the user also provide the project_id and path, thus
  // proving they have access to the sha1 hash (string_id), but
  // don't actually use the project_id and path as columns in
  // the table.  This requires some new idea I guess of virtual
  // fields....
  // Also, this also establishes the correct doctype.

  // Since this MUST succeed before doing anything else. This is critical
  // because the patches table can't be opened anywhere if the syncstring
  // object doesn't exist, due to how our security works, *AND* that the
  // patches table uses the string_id, which is a SHA1 hash.
  private async ensure_syncstring_exists_in_db(): Promise<void> {
    const dbg = this.dbg("ensure_syncstring_exists_in_db");
    if (this.ephemeral) {
      dbg("ephemeral -- nothing to do (since database not used)");
      return;
    }

    if (!this.client.is_connected()) {
      dbg("wait until connected...", this.client.is_connected());
      await once(this.client, "connected");
    }

    if (this.client.is_user() && !this.client.is_signed_in()) {
      await once(this.client, "signed_in");
    }

    if (this.state == ("closed" as State)) return;

    dbg("do syncstring write query...");

    await callback2(this.client.query, {
      query: {
        syncstrings: {
          string_id: this.string_id,
          project_id: this.project_id,
          path: this.path,
          doctype: JSON.stringify(this.doctype),
        },
      },
    });
    dbg("wrote syncstring to db - done.");
  }

  private async synctable(
    query,
    options: any[],
    throttle_changes?: undefined | number
  ): Promise<SyncTable> {
    this.assert_not_closed("synctable");
    if (this.persistent && this.data_server == "project") {
      options = options.concat([{ persistent: true }]);
    }
    switch (this.data_server) {
      case "project":
        return await this.client.synctable_project(
          this.project_id,
          query,
          options,
          throttle_changes,
          this.id
        );
      case "database":
        return await this.client.synctable_database(
          query,
          options,
          throttle_changes
        );
      default:
        throw Error(`uknown server ${this.data_server}`);
    }
  }

  private async init_syncstring_table(): Promise<void> {
    const dbg = this.dbg("init_syncstring_table");
    const query = {
      syncstrings: [
        {
          string_id: this.string_id,
          project_id: this.project_id,
          path: this.path,
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
          settings: null,
        },
      ],
    };

    dbg("getting table...");
    this.syncstring_table = await this.synctable(query, []);
    if (this.ephemeral && this.client.is_project()) {
      this.syncstring_table.set({
        string_id: this.string_id,
        project_id: this.project_id,
        path: this.path,
        doctype: JSON.stringify(this.doctype),
      });
      await this.syncstring_table.save();
    } else {
      dbg("waiting for, then handling the first update...");
      await this.handle_syncstring_update();
    }
    this.syncstring_table.on(
      "change",
      this.handle_syncstring_update.bind(this)
    );

    // Wait until syncstring is not archived -- if we open an
    // older syncstring, the patches may be archived,
    // and we have to wait until
    // after they have been pulled from blob storage before
    // we init the patch table, load from disk, etc.
    const is_not_archived: () => boolean = () => {
      const ss = this.syncstring_table_get_one();
      if (ss != null) {
        return !ss.get("archived");
      } else {
        return false;
      }
    };
    dbg("waiting for syncstring to be not archived");
    await this.syncstring_table.wait(is_not_archived, 120);
  }

  // Used for internal debug logging
  private dbg(_f: string = ""): Function {
    if (!this.client?.is_project() || this.state == "closed") {
      return (..._) => {};
    }
    return this.client.dbg(`sync-doc("${this.path}").${_f}`);
  }

  private async init_all(): Promise<void> {
    if (this.state !== "init") {
      throw Error("connect can only be called in init state");
    }
    const log = this.dbg("init_all");

    log("ensure syncstring exists in database");
    this.assert_not_closed("init_all -- before ensuring syncstring exists");
    await this.ensure_syncstring_exists_in_db();

    log("syncstring_table");
    this.assert_not_closed("init_all -- before init_syncstring_table");
    await this.init_syncstring_table();

    log("patch_list, cursors, evaluator, ipywidgets");
    this.assert_not_closed(
      "init_all -- before init patch_list, cursors, evaluator, ipywidgets"
    );
    await Promise.all([
      this.init_patch_list(),
      this.init_cursors(),
      this.init_evaluator(),
      this.init_ipywidgets(),
    ]);
    this.assert_not_closed("init_all -- after init patch_list");

    this.init_table_close_handlers();

    log("file_use_interval");
    this.init_file_use_interval();

    if (this.client.is_project()) {
      log("load_from_disk");
      // This sets initialized, which is needed to be fully ready.
      // We keep trying this load from disk until sync-doc is closed
      // or it succeeds.  It may fail if, e.g., the file is too
      // large or is not readable by the user. They are informed to
      // fix the problem... and once they do (and wait up to 10s),
      // this will finish.
      await retry_until_success({
        f: this.init_load_from_disk.bind(this),
        max_delay: 10000,
        desc: "syncdoc -- load_from_disk",
      });
      log("done loading from disk");
      this.assert_not_closed("init_all -- load from disk");
    }

    log("wait_until_fully_ready");
    await this.wait_until_fully_ready();

    this.assert_not_closed("init_all -- after waiting until fully ready");

    if (this.client.is_project()) {
      log("init autosave");
      this.init_project_autosave();
    }
    this.update_has_unsaved_changes();
    log("done");
  }

  private init_error(): string | undefined {
    const x = this.syncstring_table.get_one();
    if (x != null && x.get("init") != null) {
      return x.get("init").get("error");
    }
    return undefined;
  }

  // wait until the syncstring table is ready to be
  // used (so extracted from archive, etc.),
  private async wait_until_fully_ready(): Promise<void> {
    const dbg = this.dbg("wait_until_fully_ready");
    dbg();
    this.assert_not_closed("wait_until_fully_ready");

    if (this.client.is_user() && this.init_error()) {
      // init is set and is in error state.  Give the backend a few seconds
      // to try to fix this error before giving up.  The browser client
      // can close and open the file to retry this (as instructed).
      try {
        await this.syncstring_table.wait(() => !this.init_error(), 5);
      } catch (err) {
        // fine -- let the code below deal with this problem...
      }
    }

    const is_init_and_not_archived = (t: SyncTable) => {
      this.assert_not_closed("is_init_and_not_archived");
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
    };
    dbg("waiting for init...");
    const init = await this.syncstring_table.wait(
      is_init_and_not_archived.bind(this),
      0
    );
    dbg("init done");
    if (init.error) {
      throw Error(init.error);
    }

    assertDefined(this.patch_list);
    if (this.client.is_user() && this.patch_list.count() === 0 && init.size) {
      dbg("waiting for patches for nontrivial file");
      // normally this only happens in a later event loop,
      // so force it now.
      dbg("handling patch update queue since", this.patch_list.count());
      await this.handle_patch_update_queue();
      assertDefined(this.patch_list);
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

  public assert_is_ready(desc: string): void {
    if (this.state != "ready") {
      throw Error(`must be ready -- ${desc}`);
    }
  }

  public async wait_until_ready(): Promise<void> {
    this.assert_not_closed("wait_until_ready");
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
    if (this.ephemeral) {
      return; // not in database.
    }
    const queries = [
      {
        patches_delete: {
          id: [this.string_id],
          dummy: null,
        },
      },
      {
        syncstrings_delete: {
          project_id: this.project_id,
          path: this.path,
        },
      },
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
        mode: "w",
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

  private async init_load_from_disk(): Promise<void> {
    if (this.state == "closed") {
      // stop trying, no error -- this is assumed
      // in a retry_until_success elsewhere.
      return;
    }
    if (await this.load_from_disk_if_newer()) {
      throw Error("failed to load from disk");
    }
  }

  private async load_from_disk_if_newer(): Promise<boolean> {
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
          path: this.path,
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
    return !!error;
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
      prev: null,
    };
    if (this.doctype.patch_format != null) {
      (query as any).format = this.doctype.patch_format;
    }
    return query;
  }

  private async init_patch_list(): Promise<void> {
    const dbg = this.dbg("init_patch_list");
    dbg();
    this.assert_not_closed("init_patch_list - start");

    // CRITICAL: note that handle_syncstring_update checks whether
    // init_patch_list is done by testing whether this.patch_list is defined!
    // That is why we first define "patch_list" below, then set this.patch_list
    // to it only after we're done.
    delete this.patch_list;

    const patch_list = new SortedPatchList(this._from_str);

    dbg("opening the table...");
    this.patches_table = await this.synctable(
      { patches: [this.patch_table_query(this.last_snapshot)] },
      [],
      this.patch_interval
    );
    this.assert_not_closed("init_patch_list -- after making synctable");

    const update_has_unsaved_changes = debounce(
      this.update_has_unsaved_changes.bind(this),
      500,
      { leading: true, trailing: true }
    );

    this.patches_table.on("has-uncommitted-changes", (val) => {
      this.emit("has-uncommitted-changes", val);
    });

    this.on("change", () => {
      update_has_unsaved_changes();
    });

    this.syncstring_table.on("change", () => {
      update_has_unsaved_changes();
    });

    dbg("adding patches");
    patch_list.add(this.get_patches());

    const doc = patch_list.value();
    this.last = this.doc = doc;
    this.patches_table.on("change", this.handle_patch_update.bind(this));
    this.patches_table.on("saved", this.handle_offline.bind(this));
    this.patch_list = patch_list;
    dbg("done");

    /*
      TODO/CRITICAL: We are temporarily disabling same-user
      collision detection, since this seems to be leading to
      serious issues involving a feedback loop, which may
      be way worse than the 1 in a million issue
      that this addresses.  This only address the *same*
      account being used simultaneously on the same file
      by multiple people. which isn't something users should
      ever do (but they might do in big public demos?).

      this.patch_list.on 'overwrite', (t) =>
          * ensure that any outstanding save is done
          this.patches_table.save () =>
              this.check_for_timestamp_collision(t)
    */
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
    const dbg = this.dbg("init_evaluator");
    const ext = filename_extension(this.path);
    if (ext !== "sagews") {
      dbg("done -- only use init_evaluator for sagews");
      return;
    }
    dbg("creating the evaluator and waiting for init");
    this.evaluator = new Evaluator(
      this,
      this.client,
      this.synctable.bind(this)
    );
    await this.evaluator.init();
    dbg("done");
  }

  private async init_ipywidgets(): Promise<void> {
    const dbg = this.dbg("init_evaluator");
    const ext = filename_extension(this.path);
    if (ext != "sage-jupyter2") {
      dbg("done -- only use ipywidgets for jupyter");
      return;
    }
    dbg("creating the ipywidgets state table, and waiting for init");
    this.ipywidgets_state = new IpywidgetsState(
      this,
      this.client,
      this.synctable.bind(this)
    );
    await this.ipywidgets_state.init();
    dbg("done");
  }

  private async init_cursors(): Promise<void> {
    const dbg = this.dbg("init_cursors");
    if (!this.client.is_user()) {
      dbg("done -- only users care about cursors.");
      return;
    }
    if (!this.cursors) {
      dbg("done -- do not care about cursors for this syncdoc.");
      return;
    }
    dbg("getting cursors ephemeral table");
    const query = {
      cursors: [
        {
          string_id: this.string_id,
          user_id: null,
          locs: null,
          time: null,
        },
      ],
    };
    // We make cursors an ephemeral table, since there is no
    // need to persist it to the database, obviously!
    // Also, queue_size:1 makes it so only the last cursor position is
    // saved, e.g., in case of disconnect and reconnect.
    let options;
    if (this.data_server == "project") {
      options = [{ ephemeral: true }, { queue_size: 1 }];
    } else {
      options = [];
    }
    this.cursors_table = await this.synctable(query, options, 1000);
    this.assert_not_closed("init_cursors -- after making synctable");

    // cursors now initialized; first initialize the
    // local this._cursor_map, which tracks positions
    // of cursors by account_id:
    dbg("loading initial state");
    const s = this.cursors_table.get();
    if (s == null) {
      throw Error("bug -- get should not return null once table initialized");
    }
    s.forEach((locs: any, k: string) => {
      if (locs == null) {
        return;
      }
      const u = JSON.parse(k);
      if (u != null) {
        this.cursor_map = this.cursor_map.set(this.users[u[1]], locs);
      }
    });
    this.cursors_table.on("change", this.handle_cursors_change.bind(this));

    this.set_cursor_locs = throttle(
      this.set_cursor_locs.bind(this),
      CURSOR_THROTTLE_MS,
      { leading: true, trailing: true }
    );
    dbg("done");
  }

  private handle_cursors_change(keys): void {
    if (this.state === "closed") {
      return;
    }
    for (const k of keys) {
      const u = JSON.parse(k);
      if (u == null) {
        continue;
      }
      const account_id = this.users[u[1]];
      const locs = this.cursors_table.get(k);
      if (locs == null && !this.cursor_map.has(account_id)) {
        // gone, and already gone.
        continue;
      }
      if (locs != null) {
        // changed
        this.cursor_map = this.cursor_map.set(account_id, locs);
      } else {
        // deleted
        this.cursor_map = this.cursor_map.delete(account_id);
      }
      this.emit("cursor_activity", account_id);
    }
  }

  /* Returns *immutable* Map from account_id to list
     of cursor positions, if cursors are enabled.
  */
  public get_cursors(oldMinutes: number = 1): Map<string, any> {
    if (!this.cursors) {
      throw Error("cursors are not enabled");
    }
    if (this.cursors_table == null) {
      return Map(); // not loaded yet -- so no info yet.
    }
    const account_id: string = this.client.client_id();
    let map = this.cursor_map;
    if (
      map.has(account_id) &&
      this.cursor_last_time >= map.getIn([account_id, "time"])
    ) {
      map = map.delete(account_id);
    }
    if (oldMinutes) {
      // Remove any old cursors, where "old" is by default more than 1 minute old; this is never useful.
      const cutoff = server_minutes_ago(oldMinutes);
      for (const [a] of map as any) {
        if (map.getIn([a, "time"]) < cutoff) {
          map = map.delete(a);
        }
      }
    }
    return map;
  }

  /* Set settings map.  Used for custom configuration just for
     this one file, e.g., overloading the spell checker language.
   */
  public async set_settings(obj): Promise<void> {
    this.assert_is_ready("set_settings");
    this.syncstring_table.set({
      string_id: this.string_id,
      project_id: this.project_id,
      path: this.path,
      settings: obj,
    });
    await this.syncstring_table.save();
  }

  // get settings object
  public get_settings(): Map<string, any> {
    this.assert_is_ready("get_settings");
    return this.syncstring_table_get_one().get("settings", Map());
  }

  /*
  Commits and saves current live syncdoc to backend.  It's safe to
  call this frequently or multiple times at once, since
  it is wrapped in reuseInFlight in the constructor.

  Function only returns when there is nothing needing
  saving.

  Save any changes we have as a new patch.
  */
  public async save(): Promise<void> {
    const dbg = this.dbg("save");
    dbg();
    if (this.client.is_deleted(this.path, this.project_id)) {
      dbg("not saving because deleted");
      return;
    }
    // We just keep trying while syncdoc is ready and there
    // are changes that have not been saved (due to this.doc
    // changing during the while loop!).
    if (this.doc == null || this.last == null) {
      dbg("bug -- not ready");
      throw Error("bug -- cannot save if doc and last are not initialized");
    }
    if (this.state == "closed") {
      // There's nothing to do regarding save if the table is
      // already closed.  Note that we *do* have to save when
      // the table is init stage, since the project has to
      // record the newly opened version of the file to the
      // database! See
      //    https://github.com/sagemathinc/cocalc/issues/4986
      dbg(`state=${this.state} not ready so not saving`);
      return;
    }
    // Compute any patches.
    while (!this.doc.is_equal(this.last)) {
      dbg("something to save");
      this.emit("user-change");
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
      dbg("Compute new patch.");
      this.sync_remote_and_doc(false);
      // Emit event since this syncstring was
      // changed locally (or we wouldn't have had
      // to save at all).
      if (doc.is_equal(this.doc)) {
        dbg("no change during loop -- done!");
        break;
      }
    }
    // Ensure all patches are saved to backend.
    // We do this after the above, so that creating the newest patch
    // happens immediately on save, which makes it possible for clients
    // to save current state without having to wait on an async, which is
    // useful to ensure specific undo points (e.g., right before a paste).
    await this.patches_table.save();
  }

  private next_patch_time(): Date {
    let time = this.client.server_time();
    assertDefined(this.patch_list);
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

  private commit_patch(time: Date, patch: XPatch): void {
    this.assert_not_closed("commit_patch");
    const obj: any = {
      // version for database
      string_id: this.string_id,
      time,
      patch: JSON.stringify(patch),
      user_id: this.my_user_id,
    };

    this.my_patches[time.valueOf()] = obj;

    if (this.doctype.patch_format != null) {
      obj.format = this.doctype.patch_format;
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
      assertDefined(this.patch_list);
      this.patch_list.add([y]);
    }
  }

  /* Create and store in the database a snapshot of the state
     of the string at the given point in time.  This should
     be the time of an existing patch.
  */
  private async snapshot(time: Date, force: boolean = false): Promise<void> {
    assertDefined(this.patch_list);
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
      user_id: x.user_id,
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
    if (this.state != "ready") return;

    /* CRITICAL: Only save the snapshot time in the database
       after the set in the patches table was definitely saved
       -- otherwise if the user refreshes their
       browser (or visits later) they lose all their
       early work due to trying to apply patches
       to a blank snapshot.  That would be VERY bad.
    */
    if (!this.ephemeral) {
      /*
       PARANOID: We are extra paranoid and ensure the
       snapshot is definitely stored in the database
       before we change the syncstrings table's last_snapshot time.
       Indeed, we do a query to the database itself
       to ensure that the snapshot was really saved
       before changing last_snapshot, since the above
       patches_table.save only ensures that the snapshot
       was (presumably) saved *from the browser to the project*.
       We do give this several chances, since it might
       take a little while for the project to save it.
       */
      let success: boolean = false;
      for (let i = 0; i < 6; i++) {
        const x = await callback2(this.client.query, {
          query: {
            patches: {
              string_id: this.string_id,
              time,
              snapshot: null,
            },
          },
        });
        if (this.state != "ready") return;
        if (x.query.patches == null || x.query.patches.snapshot != snapshot) {
          await delay((i + 1) * 3000);
        } else {
          success = true;
          break;
        }
      }
      if (!success) {
        throw Error(
          "unable to confirm that snapshot was saved to the database"
        );

        /* Should this be non-fatal?
        // We make this non-fatal, because throwing an exception could break
        // other things.
        console.warn(
          "WARNING: unable to confirm that snapshot was saved to the database"
        );
        return;
        */
      }
    }

    if (this.state != "ready") return;
    this.syncstring_table.set({
      string_id: this.string_id,
      project_id: this.project_id,
      path: this.path,
      last_snapshot: time,
    });
    await this.syncstring_table.save();
    this.last_snapshot = time;
  }

  // Have a snapshot every this.snapshot_interval patches, except
  // for the very last interval.
  private async snapshot_if_necessary(): Promise<void> {
    const dbg = this.dbg("snapshot_if_necessary");
    if (this.get_state() !== "ready") return;
    const max_size = Math.floor(1.2 * MAX_FILE_SIZE_MB * 1000000);
    const interval = this.snapshot_interval;
    dbg("check if we need to make a snapshot:", { interval, max_size });
    assertDefined(this.patch_list);
    const time = this.patch_list.time_of_unmade_periodic_snapshot(
      interval,
      max_size
    );
    if (time != null) {
      dbg("yes, make a snapshot at time", time);
      await this.snapshot(time);
    } else {
      dbg("no need to make a snapshot yet");
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
    let size: number;
    if (patch == null) {
      /* Do **NOT** use misc.from_json, since we definitely
         do not want to unpack ISO timestamps as Date,
         since patch just contains the raw patches from
         user editing.  This was done for a while, which
         led to horrific bugs in some edge cases...
         See https://github.com/sagemathinc/cocalc/issues/1771
      */
      if (x.has("patch")) {
        const p: string = x.get("patch");
        patch = JSON.parse(p);
        size = p.length;
      } else {
        patch = [];
        size = 2;
      }
    } else {
      const p = x.get("patch");
      // Looking at other code, I think this JSON.stringify (which
      // would be a waste of time) never gets called in practice.
      size = p != null ? p.length : JSON.stringify(patch).length;
    }

    const obj: any = {
      time,
      user_id,
      patch,
      size,
    };
    const snapshot: string = x.get("snapshot");
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
    if (this.has_full_history() || this.ephemeral) {
      //dbg("nothing to do, since complete history definitely already loaded")
      return;
    }
    const query = this.patch_table_query();
    const result = await callback2(this.client.query, {
      query: { patches: [query] },
    });
    const v: Patch[] = [];
    // process_patch assumes immutable objects
    fromJS(result.query.patches).forEach((x) => {
      const p = this.process_patch(x, new Date(0), this.last_snapshot);
      if (p != null) {
        v.push(p);
      }
    });
    assertDefined(this.patch_list);
    this.patch_list.add(v);
    this.load_full_history_done = true;
    return;
  }

  public show_history(opts = {}): void {
    assertDefined(this.patch_list);
    this.patch_list.show_history(opts);
  }

  public async set_snapshot_interval(n: number): Promise<void> {
    this.syncstring_table.set(
      this.syncstring_table_get_one().set("snapshot_interval", n)
    );
    await this.syncstring_table.save();
  }

  /* Check if any patches that just got confirmed as saved
     are relatively old; if so, we mark them as such and
     also possibly recompute snapshots.
  */
  private async handle_offline(data): Promise<void> {
    //dbg = this.dbg("handle_offline")
    //dbg("data='#{misc.to_json(data)}'")
    this.assert_not_closed("handle_offline");
    const now: Date = this.client.server_time();
    let oldest: Date | undefined = undefined;
    for (const obj of data) {
      if (obj.sent) {
        // CRITICAL: ignore anything already processed! (otherwise, infinite loop)
        continue;
      }
      if (now.valueOf() - obj.time.valueOf() >= 1000 * OFFLINE_THRESH_S) {
        // patch is "old" -- mark it as likely being sent as a result of being
        // offline, so clients could potentially discard it.
        obj.sent = now;
        this.patches_table.set(obj);
        this.patches_table.save();
        if (oldest == null || obj.time < oldest) {
          oldest = obj.time;
        }
      }
    }
    if (oldest) {
      //dbg("oldest=#{oldest}, so check whether any snapshots need to be recomputed")
      assertDefined(this.patch_list);
      for (const snapshot_time of this.patch_list.snapshot_times()) {
        if (snapshot_time >= oldest) {
          //console.log("recomputing snapshot #{snapshot_time}")
          await this.snapshot(snapshot_time, true);
        }
      }
    }
  }

  public get_last_save_to_disk_time(): Date {
    return this.last_save_to_disk_time;
  }

  private async handle_syncstring_save_state(
    state: string,
    time: Date
  ): Promise<void> {
    // Called when the save state changes.

    /* this.syncstring_save_state is used to make it possible to emit a
       'save-to-disk' event, whenever the state changes
       to indicate a save completed.

       NOTE: it is intentional that this.syncstring_save_state is not defined
       the first time this function is called, so that save-to-disk
       with last save time gets emitted on initial load (which, e.g., triggers
       latex compilation properly in case of a .tex file).
    */
    if (state === "done" && this.syncstring_save_state !== "done") {
      this.last_save_to_disk_time = time;
      this.emit("save-to-disk", time);
    }
    const dbg = this.dbg("handle_syncstring_save_state");
    dbg(
      `state=${state}; this.syncstring_save_state=${this.syncstring_save_state}; this.state=${state}`
    );
    if (
      this.state === "ready" &&
      this.client.is_project() &&
      this.syncstring_save_state !== "requested" &&
      state === "requested"
    ) {
      this.syncstring_save_state = state; // only used in the if above
      dbg("requesting save to disk -- calling save_to_disk");
      // state just changed to requesting a save to disk...
      // so we do it (unless of course syncstring is still
      // being initialized).
      try {
        // Uncomment the following to test simulating a
        // random failure in save_to_disk:
        // if (Math.random() < 0.5) throw Error("CHAOS MONKEY!"); // FOR TESTING ONLY.
        await this.save_to_disk();
      } catch (err) {
        // CRITICAL: we must unset this.syncstring_save_state (and set the save state);
        // otherwise, it stays as "requested" and this if statement would never get
        // run again, thus completely breaking saving this doc to disk.
        // It is normal behavior that *sometimes* this.save_to_disk might
        // throw an exception, e.g., if the file is temporarily deleted
        // or save it called before everything is initialized, or file
        // is temporarily set readonly, or maybe there is a filesystem error.
        // Of course, the finally below will also take care of this.  However,
        // it's nice to record the error here.
        this.syncstring_save_state = "done";
        await this.set_save({ state: "done", error: `${err}` });
        dbg(`ERROR saving to disk in handle_syncstring_save_state-- ${err}`);
      } finally {
        // No matter what, after the above code is run,
        // the save state in the table better be "done".
        // We triple check that here, though of course
        // we believe the logic in save_to_disk and above
        // should always accomplish this.
        dbg("had to set the state to done in finally block");
        if (
          this.state === "ready" &&
          (this.syncstring_save_state != "done" ||
            this.syncstring_table_get_one().getIn(["save", "state"]) != "done")
        ) {
          this.syncstring_save_state = "done";
          await this.set_save({ state: "done", error: "" });
        }
      }
    }
  }

  private async handle_syncstring_update(): Promise<void> {
    const dbg = this.dbg("handle_syncstring_update");
    dbg();
    if (this.state === "closed") {
      return;
    }

    const data = this.syncstring_table_get_one();
    const x: any = data != null ? data.toJS() : undefined;

    if (x != null && x.save != null) {
      this.handle_syncstring_save_state(x.save.state, x.save.time);
    }

    dbg(JSON.stringify(x));
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
      schema.SCHEMA.syncstrings.user_query?.get?.fields.snapshot_interval;

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
      doctype: JSON.stringify(this.doctype),
      last_active: this.client.server_time(),
    };
    this.syncstring_table.set(obj);
    await this.syncstring_table.save();
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
        users: this.users,
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
      try {
        await this.save_to_disk();
      } catch (err) {
        const dbg = this.dbg("pending_save_to_disk");
        dbg(`ERROR saving to disk in pending_save_to_disk -- ${err}`);
      }
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
    try {
      if (!(await callback2(this.client.path_exists, { path }))) {
        // path does not exist
        dbg(
          `write '${path}' to disk from syncstring in-memory database version`
        );
        const data = this.to_str();
        await callback2(this.client.write_file, { path, data });
        dbg(`wrote '${path}' to disk`);
      }
    } catch (err) {
      // This should happen, e.g, if path is read only.
      dbg(`could NOT write '${path}' to disk -- ${err}`);
      // In this case, can't really setup a file watcher.
      return;
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
      `file_watcher: change, ctime=${time}, this.save_to_disk_start_ctime=${this.save_to_disk_start_ctime}, this.save_to_disk_end_ctime=${this.save_to_disk_end_ctime}`
    );
    if (
      this.save_to_disk_start_ctime == null ||
      (this.save_to_disk_end_ctime != null &&
        time - this.save_to_disk_end_ctime >= 7 * 1000)
    ) {
      // Either we never saved to disk, or the last attempt
      // to save was at least 7s ago, and it finished,
      // so definitely this change event was not caused by it.
      dbg("load_from_disk since no recent save to disk");
      this.load_from_disk();
      return;
    }
  }

  private async handle_file_watcher_delete(): Promise<void> {
    const dbg = this.dbg("handle_file_watcher_delete");
    this.assert_is_ready("handle_file_watcher_delete");
    dbg("delete: set_deleted and closing");
    await this.client.set_deleted(this.path, this.project_id);
    this.close();
  }

  private async load_from_disk(): Promise<number> {
    const path = this.path;
    const dbg = this.dbg("load_from_disk");
    dbg();
    const exists: boolean = await callback2(this.client.path_exists, { path });
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
        maxsize_MB: MAX_FILE_SIZE_MB,
      });
      size = data.length;
      dbg(`got it -- length=${size}`);
      this.from_str(data);
      // we also know that this is the version on disk, so we update the hash
      this.commit();
      await this.set_save({
        state: "done",
        error: "",
        hash: hash_string(data),
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
    try {
      return this.hash_of_saved_version() !== this.hash_of_live_version();
    } catch (err) {
      // This could happen, e.g. when syncstring_table isn't connected
      // in some edge case. Better to just say we don't know then crash
      // everything. See https://github.com/sagemathinc/cocalc/issues/3577
      return;
    }
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
  public hash_of_live_version(): number | undefined {
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

  // Commit any changes to the live document to
  // history as a new patch.  Returns true if there
  // were changes and false otherwise.   This works
  // fine offline, and does not wait until anything
  // is saved to the network, etc.
  public commit(emitChangeImmediately = false): boolean {
    if (this.last == null || this.doc == null || this.last.is_equal(this.doc)) {
      return false;
    }

    if (emitChangeImmediately) {
      // used for local clients.   NOTE: don't do this without explicit
      // request, since it could in some cases cause serious trouble.
      // E.g., for the jupyter backend doing this by default causes
      // an infinite recurse.  Having this as an option is important, e.g.,
      // to avoid flicker/delay in the UI.
      this.emit_change();
    }

    // Now save to backend as a new patch:
    this.emit("user-change");
    const patch = this.last.make_patch(this.doc); // must be nontrivial
    this.last = this.doc;
    // ... and save that to patches table
    const time = this.next_patch_time();
    this.commit_patch(time, patch);
    this.save(); // so eventually also gets sent out.
    return true;
  }

  /* Initiates a save of file to disk, then waits for the
     state to change. */
  public async save_to_disk(): Promise<void> {
    if (this.state != "ready") {
      // We just make save_to_disk a successful
      // no operation, if the document is either
      // closed or hasn't finished opening, since
      // there's a lot of code that tries to save
      // on exit/close or automatically, and it
      // is difficult to ensure it all checks state
      // properly.
      return;
    }
    const dbg = this.dbg("save_to_disk");
    if (this.client.is_deleted(this.path, this.project_id)) {
      dbg("not saving to disk because deleted");
      await this.set_save({ state: "done", error: "" });
      return;
    }

    // Make sure to include changes to the live document.
    // A side effect of save if we didn't do this is potentially
    // discarding them, which is obviously not good.
    this.commit();

    dbg("initiating the save");
    if (!this.has_unsaved_changes()) {
      dbg("no unsaved changes, so don't save");
      // CRITICAL: this optimization is assumed by
      // autosave, etc.
      await this.set_save({ state: "done", error: "" });
      return;
    }

    if (this.is_read_only()) {
      dbg("read only, so can't save to disk");
      // save should fail if file is read only and there are changes
      throw Error("can't save readonly file with changes to disk");
    }

    // First make sure any changes are saved to the database.
    // One subtle case where this matters is that loading a file
    // with \r's into codemirror changes them to \n...
    if (this.client.is_user()) {
      dbg("browser client -- sending any changes over network");
      await this.save();
      dbg("save done; now do actual save to the *disk*.");
      this.assert_is_ready("save_to_disk - after save");
    }

    try {
      await this.save_to_disk_aux();
    } catch (err) {
      const error = `save to disk failed -- ${err}`;
      dbg(error);
      if (this.client.is_project()) {
        this.set_save({ error, state: "done" });
      }
    }

    if (this.client.is_user()) {
      dbg("now wait for the save to disk to finish");
      this.assert_is_ready("save_to_disk - waiting to finish");
      await this.wait_for_save_to_disk_done();
    }
    this.update_has_unsaved_changes();
  }

  /* Export the (currently loaded) history of editing of this
     document to a simple JSON-able object. */
  public export_history(options: HistoryExportOptions = {}): HistoryEntry[] {
    this.assert_is_ready("export_history");
    const info = this.syncstring_table.get_one();
    if (info == null || !info.has("users")) {
      throw Error("syncstring table must be defined and users initialized");
    }
    const account_ids: string[] = info.get("users").toJS();
    assertDefined(this.patch_list);
    return export_history(account_ids, this.patch_list, options);
  }

  private update_has_unsaved_changes(): void {
    if (this.state != "ready") {
      // This can happen, since this is called by a debounced function.
      // Make it a no-op in case we're not ready.
      // See https://github.com/sagemathinc/cocalc/issues/3577
      return;
    }
    const cur = this.has_unsaved_changes();
    if (cur !== this.last_has_unsaved_changes) {
      this.emit("has-unsaved-changes", cur);
      this.last_has_unsaved_changes = cur;
    }
  }

  // wait for save.state to change state.
  private async wait_for_save_to_disk_done(): Promise<void> {
    const dbg = this.dbg("wait_for_save_to_disk_done");
    dbg();
    function until(table): boolean {
      const done = table.get_one().getIn(["save", "state"]) === "done";
      dbg("checking... done=", done);
      return done;
    }

    let last_err = undefined;
    const f = async () => {
      dbg("f");
      if (
        this.state != "ready" ||
        this.client.is_deleted(this.path, this.project_id)
      ) {
        dbg("not ready or deleted - no longer trying to save.");
        return;
      }
      try {
        dbg("waiting until done...");
        await this.syncstring_table.wait(until, 15);
      } catch (err) {
        dbg("timed out after 15s");
        throw Error("timed out");
      }
      if (
        this.state != "ready" ||
        this.client.is_deleted(this.path, this.project_id)
      ) {
        dbg("not ready or deleted - no longer trying to save.");
        return;
      }
      const err = this.syncstring_table_get_one().getIn(["save", "error"]);
      if (err) {
        dbg("error", err);
        last_err = err;
        throw Error(err);
      }
      dbg("done, with no error.");
      last_err = undefined;
      return;
    };
    await retry_until_success({
      f,
      max_tries: 8,
      desc: "wait_for_save_to_disk_done",
    });
    if (
      this.state != "ready" ||
      this.client.is_deleted(this.path, this.project_id)
    ) {
      return;
    }
    if (last_err && typeof this.client.log_error === "function") {
      this.client.log_error({
        string_id: this.string_id,
        path: this.path,
        project_id: this.project_id,
        error: `Error saving file -- ${last_err}`,
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
  private async save_to_disk_aux(): Promise<void> {
    this.assert_is_ready("save_to_disk_aux");

    if (this.client.is_user()) {
      return await this.save_to_disk_user();
    }

    try {
      return await this.save_to_disk_project();
    } catch (err) {
      this.emit("save_to_disk_project", err);
      throw err;
    }
  }

  private async save_to_disk_user(): Promise<void> {
    this.assert_is_ready("save_to_disk_user");

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
    this.assert_is_ready("save_to_disk_project");

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
      this.set_save({ state: "done", error: "", hash });
      return;
    }

    const path = this.path;
    if (!path) {
      const err = "cannot save without path";
      this.set_save({ state: "done", error: err });
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
      this.assert_is_ready("save_to_disk_project -- after write_file");
      const stat = await callback2(this.client.path_stat, { path });
      this.assert_is_ready("save_to_disk_project -- after path_state");
      this.save_to_disk_end_ctime = stat.ctime.valueOf() + 1500;
      this.set_save({
        state: "done",
        error: "",
        hash: hash_string(data),
      });
    } catch (err) {
      this.set_save({ state: "done", error: JSON.stringify(err) });
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
  private async handle_patch_update(changed_keys): Promise<void> {
    if (changed_keys == null || changed_keys.length === 0) {
      // this happens right now when we do a save.
      return;
    }

    const dbg = this.dbg("handle_patch_update");
    dbg(changed_keys);
    if (this.patch_update_queue == null) {
      this.patch_update_queue = [];
    }
    for (const key of changed_keys) {
      this.patch_update_queue.push(key);
    }

    dbg("Clear patch update_queue in a later event loop...");
    await delay(1);
    await this.handle_patch_update_queue();
    dbg("done");
  }

  /*
  Whenever new patches are added to this.patches_table,
  their timestamp gets added to this.patch_update_queue.
  */
  private async handle_patch_update_queue(): Promise<void> {
    const dbg = this.dbg("handle_patch_update_queue");
    try {
      this.handle_patch_update_queue_running = true;
      while (this.state != "closed" && this.patch_update_queue.length > 0) {
        dbg("queue size = ", this.patch_update_queue.length);
        const v: Patch[] = [];
        for (const key of this.patch_update_queue) {
          const x = this.patches_table.get(key);
          if (x != null) {
            // may be null, e.g., when deleted.
            const t = x.get("time");
            // Only need to process patches that we didn't
            // create ourselves.
            if (t && !this.my_patches[`${t.valueOf()}`]) {
              const p = this.process_patch(x);
              dbg(`patch=${JSON.stringify(p)}`);
              if (p != null) {
                v.push(p);
              }
            }
          }
        }
        this.patch_update_queue = [];
        assertDefined(this.patch_list);
        this.patch_list.add(v);

        dbg("waiting for remote and doc to sync...");
        this.sync_remote_and_doc(v.length > 0);
        await this.patches_table.save();
        if (this.state === ("closed" as State)) return; // closed during await; nothing further to do
        dbg("remote and doc now synced");

        if (this.patch_update_queue.length > 0) {
          // It is very important that next loop happen in a later
          // event loop to avoid the this.sync_remote_and_doc call
          // in this.handle_patch_update_queue above from causing
          // sync_remote_and_doc to get called from within itself,
          // due to synctable changes being emited on save.
          dbg("wait for next event loop");
          await delay(1);
        } else {
          dbg("Patch sent, now make a snapshot if we are due for one.");
          await this.snapshot_if_necessary();
        }
      }
    } finally {
      if (this.state == "closed") return; // got closed, so nothing further to do

      // OK, done and nothing in the queue
      // Notify save() to try again -- it may have
      // paused waiting for this to clear.
      dbg("done");
      this.handle_patch_update_queue_running = false;
      this.emit("handle_patch_update_queue_done");
    }
  }

  /* Disable and enable sync.   When disabled we still
     collect patches from upstream (but do not apply them
     locally), and changes we make are broadcast into
     the patch stream.   When we re-enable sync, all
     patches are put together in the stream and
     everything is synced as normal.  This is useful, e.g.,
     to make it so a user **actively** editing a document is
     not interrupted by being forced to sync (in particular,
     by the 'before-change' event that they use to update
     the live document).

     Also, delay_sync will delay syncing local with upstream
     for the given number of ms.  Calling it regularly while
     user is actively editing to avoid them being bothered
     by upstream patches getting merged in.

     IMPORTANT: I implemented this, but it is NOT used anywhere
     else in the codebase, so don't trust that it works.
  */

  public disable_sync(): void {
    this.sync_is_disabled = true;
  }

  public enable_sync(): void {
    this.sync_is_disabled = false;
    this.sync_remote_and_doc(true);
  }

  public delay_sync(timeout_ms = 2000): void {
    clearTimeout(this.delay_sync_timer);
    this.disable_sync();
    this.delay_sync_timer = setTimeout(() => {
      this.enable_sync();
    }, timeout_ms);
  }

  /*
    Merge remote patches and live version to create new live version,
    which is equal to result of applying all patches.
  */
  private sync_remote_and_doc(upstreamPatches: boolean): void {
    if (this.last == null || this.doc == null || this.sync_is_disabled) {
      return;
    }

    // Critical to save what we have now so it doesn't get overwritten during
    // before-change or setting this.doc below.  This caused
    //    https://github.com/sagemathinc/cocalc/issues/5871
    this.commit();

    if (upstreamPatches && this.state == "ready") {
      // First save any unsaved changes from the live document, which this
      // sync-doc doesn't acutally know the state of.  E.g., this is some
      // rapidly changing live editor with changes not yet saved here.
      this.emit("before-change");
      // As a result of the emit in the previous line, all kinds of
      // nontrivial listener code probably just ran, and it should
      // have updated this.doc.  We commit this.doc, so that the
      // upstream patches get applied against the correct live this.doc.
      this.commit();
    }

    // Compute the global current state of the document,
    // which is got by applying all patches in order.
    // It is VERY important to do this, even if the
    // document is not yet ready, since it is critical
    // to properly set the state of this.doc to the value
    // of the patch list (e.g., not doing this 100% breaks
    // opening a file for the first time on cocalc-docker).
    assertDefined(this.patch_list);
    const new_remote = this.patch_list.value();
    if (!this.doc.is_equal(new_remote)) {
      // There is a possibility that live document changed, so
      // set to new version.
      this.last = this.doc = new_remote;
      if (this.state == "ready") {
        this.emit("after-change");
        this.emit_change();
      }
    }
  }

  // Immediately alert all watchers of all changes since
  // last time.
  private emit_change(): void {
    this.emit("change", this.doc.changes(this.before_change));
    this.before_change = this.doc;
  }

  // Alert to changes soon, but debounced in case there are a large
  // number of calls in a group.  This is called by default.
  // The debounce param is 0, since the idea is that this just waits
  // until the next "render loop" to avoid huge performance issues
  // with a nested for loop of sets.  Doing it this way, massively
  // simplifies client code.
  emit_change_debounced = debounce(this.emit_change.bind(this), 0);
}
