/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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

// How big of files we allow users to open using syncstrings.
const MAX_FILE_SIZE_MB = 32;

// This parameter determines throttling when broadcasting cursor position
// updates.   Make this larger to reduce bandwidth at the expense of making
// cursors less responsive.
const CURSOR_THROTTLE_MS = 150;

// If file does not exist for this long, then syncdoc emits a 'deleted' event.
export const DELETED_THRESHOLD = 2000;
export const DELETED_CHECK_INTERVAL = 750;
export const WATCH_RECREATE_WAIT = 3000;

// Length of time file is locked for reading (so that only
// one client reads it at a time), very first time reading it:
const FIRST_READ_LOCK_TIMEOUT = 2000;

// reading file when it changes on disk is debounced this much, e.g.,
// if the file keeps changing you won't see those changes until it
// stops changing for this long.
const WATCH_DEBOUNCE = 250;

import {
  COMPUTE_THRESH_MS,
  COMPUTER_SERVER_CURSOR_TYPE,
  decodeUUIDtoNum,
} from "@cocalc/util/compute/manager";

const STAT_DEBOUNCE = 10000;

import { DEFAULT_SNAPSHOT_INTERVAL } from "@cocalc/util/db-schema/syncstring-schema";

type XPatch = any;

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { SyncTable } from "@cocalc/sync/table/synctable";
import {
  callback2,
  cancel_scheduled,
  once,
  until,
  asyncDebounce,
} from "@cocalc/util/async-utils";
import { wait } from "@cocalc/util/async-wait";
import {
  assertDefined,
  close,
  field_cmp,
  filename_extension,
  hash_string,
  keys,
  minutes_ago,
} from "@cocalc/util/misc";
import * as schema from "@cocalc/util/schema";
import { delay } from "awaiting";
import { EventEmitter } from "events";
import { Map, fromJS } from "immutable";
import { debounce, throttle } from "lodash";
import { Evaluator } from "./evaluator";
import { HistoryEntry, HistoryExportOptions, export_history } from "./export";
import { IpywidgetsState } from "./ipywidgets-state";
import { SortedPatchList } from "./sorted-patch-list";
import type {
  Client,
  CompressedPatch,
  DocType,
  Document,
  Patch,
} from "./types";
import { isTestClient, patch_cmp } from "./util";
import mergeDeep from "@cocalc/util/immutable-deep-merge";
import { JUPYTER_SYNCDB_EXTENSIONS } from "@cocalc/util/jupyter/names";
import { LegacyHistory } from "./legacy";
import { type Filesystem, type Stats } from "@cocalc/conat/files/fs";
import { type WatchIterator } from "@cocalc/conat/files/watch";
import { getLogger } from "@cocalc/conat/client";
import * as remote from "./remote";
import { apply_patch } from "@cocalc/util/patch";

const DEBUG = false;

export type State = "init" | "ready" | "closed";
export type DataServer = "project" | "database";

export interface SyncOpts0 {
  project_id: string;
  path: string;
  client: Client;
  fs: Filesystem;

  compute_server_id?: number;
  patch_interval?: number;

  // file_use_interval defaults to 60000.
  // Specify 0 to disable.
  file_use_interval?: number;

  string_id?: string;
  cursors?: boolean;
  change_throttle?: number;

  // persistent backend session in project, so only close
  // backend when explicitly requested:
  persistent?: boolean;

  // If true, entire sync-doc is assumed ephemeral, in the
  // sense that no edit history gets saved via patches to
  // the database.  The one syncstring record for coordinating
  // users does get created in the database.
  ephemeral?: boolean;

  // which data/changefeed server to use
  data_server?: DataServer;

  // if true, do not implicitly save on commit.  This is very
  // useful for unit testing to easily simulate offline state.
  noAutosave?: boolean;

  // if true, never saves to disk or loads from disk -- this is NOT
  // ephemeral -- the history is tracked in the conat database!
  noSaveToDisk?: boolean;

  // optional timeout for how long to wait from when a file is
  // deleted until emiting a 'deleted' event.
  deletedThreshold?: number;
  deletedCheckInterval?: number;
  // how long to wait before trying to recreate a watch -- this mainly
  // matters in cases when the file is deleted and the client ignores
  // the 'deleted' event.
  watchRecreateWait?: number;

  watchDebounce?: number;
  readLockTimeout?: number;
  firstReadLockTimeout?: number;
}

export interface SyncOpts extends SyncOpts0 {
  from_str: (str: string) => Document;
  doctype: DocType;
}

export interface UndoState {
  my_times: number[];
  pointer: number;
  without: number[];
  final?: CompressedPatch;
}

// NOTE: Do not make multiple SyncDoc's for the same document, especially
// not on the frontend.

const logger = getLogger("sync-doc");
logger.debug("init");

export class SyncDoc extends EventEmitter {
  static events = new EventEmitter();
  static lite = false;

  public readonly opts: SyncOpts;
  public readonly compute_server_id: number;
  public readonly project_id: string; // project_id that contains the doc
  public readonly path: string; // path of the file corresponding to the doc
  private string_id: string;
  private my_user_id: number;

  private client: Client;
  private _from_str: (str: string) => Document; // creates a doc from a string.

  // Throttling of incoming upstream patches from project to client.
  private patch_interval: number = 250;

  // throttling of change events -- e.g., is useful for course
  // editor where we have hundreds of changes and the UI gets
  // overloaded unless we throttle and group them.
  private change_throttle: number = 0;

  // file_use_interval throttle: default is 60s for everything
  private file_use_interval: number;
  private throttled_file_use?: Function;

  private cursors: boolean = false; // if true, also provide cursor tracking functionality
  private cursor_map: Map<string, any> = Map();
  private cursor_last_time: Date = new Date(0);

  // doctype: object describing document constructor
  // (used by project to open file)
  public doctype: DocType;

  private state: State = "init";

  private syncstring_table: SyncTable;
  public patches_table: SyncTable;
  private cursors_table: SyncTable;

  public evaluator?: Evaluator;

  public ipywidgets_state?: IpywidgetsState;

  private patch_list?: SortedPatchList;

  private last: Document;
  private doc: Document;
  private before_change?: Document;

  private last_user_change: Date = minutes_ago(60);
  private last_save_to_disk_time: Date = new Date(0);

  private last_snapshot?: number;
  private last_seq?: number;
  private snapshot_interval: number;

  private users: string[];

  private settings: Map<string, any> = Map();

  // patches that this client made during this editing session.
  private my_patches: { [time: string]: XPatch } = {};

  private handle_patch_update_queue_running: boolean;
  private patch_update_queue: string[] = [];

  private undo_state: UndoState | undefined;

  private persistent: boolean = false;

  private last_has_unsaved_changes?: boolean = undefined;

  private ephemeral: boolean = false;

  private sync_is_disabled: boolean = false;
  private delay_sync_timer: any;

  private useConat: boolean;
  legacy: LegacyHistory;

  public readonly fs: Filesystem;

  private noAutosave?: boolean;

  private readFileDebounced: Function;
  public isDeleted: boolean = false;

  constructor(opts: SyncOpts) {
    super();
    this.opts = opts;
    this.compute_server_id = opts.compute_server_id ?? 0;

    if (opts.string_id === undefined) {
      this.string_id = schema.client_db.sha1(opts.project_id, opts.path);
    } else {
      this.string_id = opts.string_id;
    }

    // TODO: it might be better to just use this.opts.field everywhere...?
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
      "fs",
      "noAutosave",
    ]) {
      if (opts[field] != undefined) {
        this[field] = opts[field];
      }
    }

    this.readFileDebounced = asyncDebounce(
      async () => {
        try {
          this.emit("handle-file-change");
          if (this.isClosed()) return;
          await this.readFile();
          if (this.isClosed()) return;
          await this.stat();
        } catch (err) {
          console.log("readFileDebounced error", err);
        }
      },
      this.opts.watchDebounce ?? WATCH_DEBOUNCE,
      {
        leading: false,
        trailing: true,
      },
    );

    this.client.once("closed", this.close);

    this.legacy = new LegacyHistory({
      project_id: this.project_id,
      path: this.path,
      client: this.client,
    });

    // NOTE: Do not use conat in test mode, since there we use a minimal
    // "fake" client that does all communication internally and doesn't
    // use conat.  We also use this for the messages composer.
    this.useConat = !isTestClient(opts.client);
    if (this.ephemeral) {
      // So the doctype written to the database reflects the
      // ephemeral state.  Here ephemeral determines whether
      // or not patches are written to the database by the
      // project.
      this.doctype.opts = { ...this.doctype.opts, ephemeral: true };
    }
    if (this.cursors) {
      // similarly to ephemeral, but for cursors.   We track them
      // on the backend since they can also be very useful, e.g.,
      // with jupyter they are used for connecting remote compute,
      // and **should** also be used for broadcasting load and other
      // status information (TODO).
      this.doctype.opts = { ...this.doctype.opts, cursors: true };
    }
    this._from_str = opts.from_str;

    // Initialize to time when we create the syncstring, so we don't
    // see our own cursor when we refresh the browser (before we move
    // to update this).
    this.cursor_last_time = this.client?.server_time();

    if (this.change_throttle) {
      this.emit_change = throttle(this.emit_change, this.change_throttle);
    }

    this.setMaxListeners(100);

    this.init();
    // This makes it possible for other parts of the app to react to
    // creation of new synchronized docs.
    SyncDoc.events.emit("new", this);
  }

  /*
  Initialize everything.
  This should be called *exactly* once by the constructor,
  and no other time.  It tries to set everything up.  If
  the browser isn't connected to the network, it'll wait
  until it is (however long, etc.).  If this fails, it closes
  this SyncDoc.
  */
  private initialized = false;
  init = reuseInFlight(async () => {
    if (this.initialized) {
      throw Error("init can only be called once");
    }
    // const start = Date.now();
    this.assert_not_closed("init");
    const log = this.dbg("init");
    await until(
      async () => {
        if (this.state != "init") {
          return true;
        }
        try {
          log("initializing all tables...");
          await this.initAll();
          log("initAll succeeded");
          return true;
        } catch (err) {
          if (this.isClosed()) {
            return true;
          }
          const m = `WARNING: problem initializing ${this.path} -- ${err}`;
          log(m);
          if (DEBUG || true) {
            console.trace(err);
          }
          // log always
          console.log(m);
        }
        log("wait then try again");
        return false;
      },
      { start: 3000, max: 15000, decay: 1.3 },
    );
    if (this.isClosed()) return;

    // Success -- everything initialized with no issues.
    this.set_state("ready");
    this.emit_change(); // from nothing to something.
  });

  // Return id of ACTIVE remote compute server, if one is connected and pinging, or 0
  // if none is connected.  This is used by Jupyter to determine who
  // should evaluate code.
  // We always take the smallest id of the remote
  // compute servers, in case there is more than one, so exactly one of them
  // takes control.  Always returns 0 if cursors are not enabled for this
  // document, since the cursors table is used to coordinate the compute
  // server.
  getComputeServerId = (): number => {
    if (!this.cursors) {
      return 0;
    }
    // This info is in the "cursors" table instead of the document itself
    // to avoid wasting space in the database longterm.  Basically a remote
    // Jupyter client that can provide compute announces this by reporting it's
    // cursor to look a certain way.
    const cursors = this.get_cursors({
      maxAge: COMPUTE_THRESH_MS,
      // don't exclude self since getComputeServerId called from the compute
      // server also to know if it is the chosen one.
      excludeSelf: "never",
    });
    const dbg = this.dbg("getComputeServerId");
    dbg("num cursors = ", cursors.size);
    let minId = Infinity;
    // NOTE: similar code is in frontend/jupyter/cursor-manager.ts
    for (const [client_id, cursor] of cursors) {
      if (cursor.getIn(["locs", 0, "type"]) == COMPUTER_SERVER_CURSOR_TYPE) {
        try {
          minId = Math.min(minId, decodeUUIDtoNum(client_id));
        } catch (err) {
          // this should never happen unless a client were being malicious.
          dbg(
            "WARNING -- client_id should encode server id, but is",
            client_id,
          );
        }
      }
    }

    return isFinite(minId) ? minId : 0;
  };

  registerAsComputeServer = () => {
    this.setCursorLocsNoThrottle([{ type: COMPUTER_SERVER_CURSOR_TYPE }]);
  };

  /* Set this user's cursors to the given locs. */
  setCursorLocsNoThrottle = async (
    // locs is 'any' and not any[] because of a codemirror syntax highlighting bug!
    locs: any,
    side_effect: boolean = false,
  ) => {
    if (!this.isReady()) {
      return;
    }
    if (this.cursors_table == null) {
      if (!this.cursors) {
        throw Error("cursors are not enabled");
      }
      // table not initialized yet
      return;
    }
    if (this.useConat) {
      const time = this.client.server_time().valueOf();
      const x: {
        user_id: number;
        locs: any;
        time: number;
      } = {
        user_id: this.my_user_id,
        locs,
        time,
      };
      // will actually always be non-null due to above
      this.cursor_last_time = new Date(x.time);
      this.cursors_table.set(x);
      return;
    }

    const x: {
      string_id?: string;
      user_id: number;
      locs: any[];
      time?: Date;
    } = {
      string_id: this.string_id,
      user_id: this.my_user_id,
      locs,
    };
    const now = this.client.server_time();
    if (!side_effect || (x.time ?? now) >= now) {
      // the now comparison above is in case the cursor time
      // is in the future (due to clock issues) -- always fix that.
      x.time = now;
    }
    if (x.time != null) {
      // will actually always be non-null due to above
      this.cursor_last_time = x.time;
    }
    this.cursors_table.set(x, "none");
    await this.cursors_table.save();
  };

  set_cursor_locs: typeof this.setCursorLocsNoThrottle = throttle(
    this.setCursorLocsNoThrottle,
    CURSOR_THROTTLE_MS,
    {
      leading: true,
      trailing: true,
    },
  );

  private init_file_use_interval = (): void => {
    if (this.file_use_interval == null) {
      this.file_use_interval = 60 * 1000;
    }

    if (!this.file_use_interval || !this.client.is_browser()) {
      // file_use_interval has to be nonzero, and we only do
      // this for browser user.
      return;
    }

    const file_use = async () => {
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
      this.last_user_change = new Date();
      this.client.mark_file?.({
        project_id: this.project_id,
        path: this.path,
        action: "edit",
        ttl: this.file_use_interval,
      });
    };
    this.throttled_file_use = throttle(file_use, this.file_use_interval, {
      leading: true,
    });

    this.on("user-change", this.throttled_file_use as any);
  };

  isClosed = () => (this.state ?? "closed") == "closed";
  isReady = () => this.state == "ready";

  private set_state = (state: State): void => {
    this.state = state;
    this.emit(state);
  };

  get_state = (): State => {
    return this.state;
  };

  get_project_id = (): string => {
    return this.project_id;
  };

  get_path = (): string => {
    return this.path;
  };

  get_string_id = (): string => {
    return this.string_id;
  };

  get_my_user_id = (): number => {
    return this.my_user_id != null ? this.my_user_id : 0;
  };

  private assert_not_closed(desc: string): void {
    if (this.state === "closed") {
      //console.trace();
      throw Error(`must not be closed -- ${desc}`);
    }
  }

  set_doc = (doc: Document, exit_undo_mode: boolean = true): void => {
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
  };

  // Convenience function to avoid having to do
  // get_doc and set_doc constantly.
  set = (x: any): void => {
    this.set_doc(this.doc.set(x));
  };

  delete = (x?: any): void => {
    this.set_doc(this.doc.delete(x));
  };

  get = (x?: any): any => {
    return this.doc.get(x);
  };

  get_one(x?: any): any {
    return this.doc.get_one(x);
  }

  // Return underlying document, or undefined if document
  // hasn't been set yet.
  get_doc = (): Document => {
    if (this.doc == null) {
      throw Error("doc must be set");
    }
    return this.doc;
  };

  // Set this doc from its string representation.
  from_str = (value: string): void => {
    // console.log(`sync-doc.from_str("${value}")`);
    this.doc = this._from_str(value);
  };

  // Return string representation of this doc,
  // or exception if not yet ready.
  to_str = (): string => {
    if (this.doc == null) {
      throw Error("doc must be set");
    }
    return this.doc.to_str();
  };

  count = (): number => {
    return this.doc.count();
  };

  // Version of the document at a given point in time; if no
  // time specified, gives the version right now.
  // If not fully initialized, will throw exception.
  version = (time?: number): Document => {
    this.assert_table_is_ready("patches");
    assertDefined(this.patch_list);
    return this.patch_list.value({ time });
  };

  /* Compute version of document if the patches at the given times
     were simply not included.  This is a building block that is
     used for implementing undo functionality for client editors. */
  version_without = (without_times: number[]): Document => {
    this.assert_table_is_ready("patches");
    assertDefined(this.patch_list);
    return this.patch_list.value({ without_times });
  };

  // Revert document to what it was at the given point in time.
  // There doesn't have to be a patch at exactly that point in
  // time -- if there isn't it just uses the patch before that
  // point in time.
  revert = (time: number): void => {
    this.set_doc(this.version(time));
  };

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
  undo = (): Document => {
    const prev = this._undo();
    this.set_doc(prev, false);
    this.commit();
    return prev;
  };

  redo = (): Document => {
    const next = this._redo();
    this.set_doc(next, false);
    this.commit();
    return next;
  };

  private _undo(): Document {
    this.assert_is_ready("_undo");
    let state = this.undo_state;
    if (state == null) {
      // not in undo mode
      state = this.initUndoState();
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

  in_undo_mode = (): boolean => {
    return this.undo_state != null;
  };

  exit_undo_mode = (): void => {
    this.undo_state = undefined;
  };

  private initUndoState = (): UndoState => {
    if (this.undo_state != null) {
      return this.undo_state;
    }
    const my_times = keys(this.my_patches).map((x) => parseInt(x));
    my_times.sort();
    this.undo_state = {
      my_times,
      pointer: my_times.length,
      without: [],
    };
    return this.undo_state;
  };

  // account_id of the user who made the edit at
  // the given point in time.
  account_id = (time: number): string | undefined => {
    this.assert_is_ready("account_id");
    try {
      if (this.patch_list?.patch(time)?.file) {
        return this.project_id;
      }
    } catch {
      return;
    }
    return this.users[this.user_id(time)];
  };

  // Integer index of user who made the edit at given
  // point in time.
  user_id = (time: number): number => {
    this.assert_table_is_ready("patches");
    assertDefined(this.patch_list);
    return this.patch_list.user_id(time);
  };

  private syncstring_table_get_one = (): Map<string, any> => {
    if (this.syncstring_table == null) {
      throw Error("syncstring_table must be defined");
    }
    const t = this.syncstring_table.get_one();
    if (t == null) {
      // project has not initialized it yet.
      return Map();
    }
    return t;
  };

  /* List of logical timestamps of the versions of this string in the sync
     table that we opened to start editing (so starts with what was
     the most recent snapshot when we started).  The list of timestamps
     is sorted from oldest to newest. */
  versions = (): number[] => {
    assertDefined(this.patch_list);
    return this.patch_list.versions();
  };

  wallTime = (version: number): number | undefined => {
    return this.patch_list?.wallTime(version);
  };

  // newest version of any non-staging known patch on this client,
  // including ones just made that might not be in patch_list yet.
  newestVersion = (): number | undefined => {
    return this.patch_list?.newest_patch_time();
  };

  hasVersion = (time: number): boolean => {
    assertDefined(this.patch_list);
    return this.patch_list.hasVersion(time);
  };

  historyFirstVersion = () => {
    this.assert_table_is_ready("patches");
    assertDefined(this.patch_list);
    return this.patch_list.firstVersion();
  };

  historyLastVersion = () => {
    this.assert_table_is_ready("patches");
    assertDefined(this.patch_list);
    return this.patch_list.lastVersion();
  };

  historyVersionNumber = (time: number): number | undefined => {
    return this.patch_list?.versionNumber(time);
  };

  last_changed = (): number => {
    const v = this.versions();
    return v[v.length - 1] ?? 0;
  };

  private init_table_close_handlers(): void {
    for (const x of ["syncstring", "patches", "cursors"]) {
      const t = this[x + "_table"];
      if (t != null) {
        t.on("close", this.close);
      }
    }
  }

  // more gentle version -- this can cause the project actions
  // to be *created* etc.
  end = reuseInFlight(async () => {
    if (this.client.is_browser() && this.state == "ready") {
      try {
        await this.save_to_disk();
      } catch (err) {
        // has to be non-fatal since we are closing the document,
        // and of couse we need to clear up everything else.
        // Do nothing here.
      }
    }
    this.close();
  });

  // Close synchronized editing of this string; this stops listening
  // for changes and stops broadcasting changes.
  close = reuseInFlight(async () => {
    if (this.state == "closed") {
      return;
    }
    const dbg = this.dbg("close");
    dbg("close");

    //
    // SYNC STUFF
    //

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

    this.patch_update_queue = [];

    // Stop watching for file changes.  It's important to
    // do this *before* all the await's below, since
    // this syncdoc can't do anything in response to a
    // a file change in its current state.
    this.closeFileWatcher();

    if (this.patch_list != null) {
      // not async -- just a data structure in memory
      this.patch_list.close();
    }

    try {
      this.closeTables();
      dbg("closeTables -- successfully saved all data to database");
    } catch (err) {
      dbg(`closeTables -- ERROR -- ${err}`);
    }
    // this avoids memory leaks:
    close(this);

    // after doing that close, we need to keep the state (which just got deleted) as 'closed'
    this.set_state("closed");
    dbg("close done");
  });

  private closeTables = async () => {
    this.syncstring_table?.close();
    this.patches_table?.close();
    this.cursors_table?.close();
    this.evaluator?.close();
    this.ipywidgets_state?.close();
  };

  private synctable = async (
    query,
    options: any[],
    throttle_changes?: undefined | number,
  ): Promise<SyncTable> => {
    this.assert_not_closed("synctable");
    const dbg = this.dbg("synctable");
    if (!this.useConat && !this.ephemeral && this.persistent) {
      // persistent table in a non-ephemeral syncdoc, so ensure that table is
      // persisted to database (not just in memory).
      options = options.concat([{ persistent: true }]);
    }
    if (this.ephemeral) {
      options.push({ ephemeral: true });
    }
    let synctable;
    let ephemeral = false;
    for (const x of options) {
      if (x.ephemeral) {
        ephemeral = true;
        break;
      }
    }
    if (this.useConat && query.patches) {
      synctable = await this.client.synctable_conat(query, {
        obj: {
          project_id: this.project_id,
          path: this.path,
        },
        stream: true,
        atomic: true,
        desc: { path: this.path },
        start_seq: this.last_seq,
        ephemeral,
        noAutosave: this.noAutosave,
      });

      if (this.last_seq) {
        // any possibility last_seq is wrong?
        if (!isCompletePatchStream(synctable.dstream)) {
          // we load everything and fix it.  This happened
          // for data moving to conat when the seq numbers changed.
          console.log("updating invalid timetravel -- ", this.path);

          synctable.close();
          synctable = await this.client.synctable_conat(query, {
            obj: {
              project_id: this.project_id,
              path: this.path,
            },
            stream: true,
            atomic: true,
            desc: { path: this.path },
            ephemeral,
            noAutosave: this.noAutosave,
          });

          // also find the correct last_seq:
          let n = synctable.dstream.length - 1;
          for (; n >= 0; n--) {
            const x = synctable.dstream[n];
            if (x?.is_snapshot) {
              const time = x.time;
              // find the seq number with time
              let m = n - 1;
              let last_seq = 0;
              while (m >= 1) {
                if (synctable.dstream[m].time == time) {
                  last_seq = synctable.dstream.seq(m);
                  break;
                }
                m -= 1;
              }
              this.last_seq = last_seq;
              await this.set_syncstring_table({
                last_snapshot: time,
                last_seq,
              });
              this.setLastSnapshot(time);
              break;
            }
          }
          if (n == -1) {
            // no snapshot?  should never happen, but just in case.
            delete this.last_seq;
            await this.set_syncstring_table({
              last_seq: undefined,
            });
          }
        }
      }
    } else if (this.useConat && query.syncstrings) {
      synctable = await this.client.synctable_conat(query, {
        obj: {
          project_id: this.project_id,
          path: this.path,
        },
        stream: false,
        atomic: false,
        immutable: true,
        desc: { path: this.path },
        ephemeral,
        noAutosave: this.noAutosave,
      });
    } else if (this.useConat && query.ipywidgets) {
      synctable = await this.client.synctable_conat(query, {
        obj: {
          project_id: this.project_id,
          path: this.path,
        },
        stream: false,
        atomic: true,
        immutable: true,
        // for now just putting a 1-day limit on the ipywidgets table
        // so we don't waste a ton of space.
        config: { max_age: 1000 * 60 * 60 * 24 },
        desc: { path: this.path },
        ephemeral: true, // ipywidgets state always ephemeral
        noAutosave: this.noAutosave,
      });
    } else if (this.useConat && (query.eval_inputs || query.eval_outputs)) {
      synctable = await this.client.synctable_conat(query, {
        obj: {
          project_id: this.project_id,
          path: this.path,
        },
        stream: false,
        atomic: true,
        immutable: true,
        config: { max_age: 5 * 60 * 1000 },
        desc: { path: this.path },
        ephemeral: true, // eval state (for sagews) is always ephemeral
        noAutosave: this.noAutosave,
      });
    } else if (this.useConat) {
      synctable = await this.client.synctable_conat(query, {
        obj: {
          project_id: this.project_id,
          path: this.path,
        },
        stream: false,
        atomic: true,
        immutable: true,
        desc: { path: this.path },
        ephemeral,
        noAutosave: this.noAutosave,
      });
    } else {
      // only used for unit tests and the ephemeral messaging composer
      if (this.client.synctable_ephemeral == null) {
        throw Error(`client does not support sync properly`);
      }
      synctable = await this.client.synctable_ephemeral(
        this.project_id,
        query,
        options,
        throttle_changes,
      );
    }
    // We listen and log error events.  This is useful because in some settings, e.g.,
    // in the project, an eventemitter with no listener for errors, which has an error,
    // will crash the entire process.
    synctable.on("error", (error) => dbg("ERROR", error));
    return synctable;
  };

  private init_syncstring_table = async (): Promise<void> => {
    const query = {
      syncstrings: [
        {
          string_id: this.string_id,
          project_id: this.project_id,
          path: this.path,
          users: null,
          last_snapshot: null,
          last_seq: null,
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
    const dbg = this.dbg("init_syncstring_table");

    dbg("getting table...");
    this.syncstring_table = await this.synctable(query, []);
    dbg("handling the first update...");
    this.handle_syncstring_update();
    this.syncstring_table.on("change", this.handle_syncstring_update);
    this.syncstring_table.on("change", this.update_has_unsaved_changes);
  };

  // Used for internal debug logging
  private dbg = (_f: string = ""): Function => {
    if (DEBUG) {
      return (...args) => {
        logger.debug(this.path, _f, ...args);
      };
    } else {
      return (..._args) => {};
    }
  };

  private initAll = async (): Promise<void> => {
    //const t0 = Date.now();
    if (this.state !== "init") {
      throw Error("connect can only be called in init state");
    }
    const log = this.dbg("initAll");

    log("patch_list, cursors, evaluator, ipywidgets");
    this.assert_not_closed(
      "initAll -- before init patch_list, cursors, evaluator, ipywidgets",
    );
    await Promise.all([
      this.init_syncstring_table(),
      this.init_patch_list(),
      this.init_cursors(),
      this.init_evaluator(),
      this.init_ipywidgets(),
      this.initFileWatcherFirstTime(),
    ]);
    this.assert_not_closed(
      "initAll -- successful init patch_list, cursors, evaluator, and ipywidgets",
    );

    this.init_table_close_handlers();
    this.assert_not_closed("initAll -- successful init_table_close_handlers");

    log("file_use_interval");
    this.init_file_use_interval();

    if (!SyncDoc.lite) {
      await this.loadFromDiskIfNewer();
    }

    this.emit("init");
    this.assert_not_closed("initAll -- after waiting until fully ready");

    this.update_has_unsaved_changes();
    log("done");
    //console.log("initAll: done", Date.now() - t0);
  };

  private assert_table_is_ready = (table: string): void => {
    const t = this[table + "_table"]; // not using string template only because it breaks codemirror!
    if (t == null || t.get_state() != "connected") {
      throw Error(
        `Table ${table} must be connected.  string_id=${this.string_id}`,
      );
    }
  };

  assert_is_ready = (desc: string): void => {
    if (!this.isReady()) {
      throw Error(`must be ready -- ${desc}`);
    }
  };

  wait_until_ready = async (): Promise<void> => {
    this.assert_not_closed("wait_until_ready");
    if (this.state !== ("ready" as State)) {
      // wait for a state change to ready.
      await once(this, "ready");
    }
  };

  /* Calls wait for the corresponding patches SyncTable, if
     it has been defined.  If it hasn't been defined, it waits
     until it is defined, then calls wait.  Timeout only starts
     when patches_table is already initialized.
  */
  wait = async (until: Function, timeout: number = 30): Promise<any> => {
    await this.wait_until_ready();
    //console.trace("SYNC WAIT -- start...");
    const result = await wait({
      obj: this,
      until,
      timeout,
      change_event: "change",
    });
    //console.trace("SYNC WAIT -- got it!");
    return result;
  };

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
  delete_from_database = async (): Promise<void> => {
    const queries: object[] = this.ephemeral
      ? []
      : [
          {
            patches_delete: {
              id: [this.string_id],
              dummy: null,
            },
          },
        ];
    queries.push({
      syncstrings_delete: {
        project_id: this.project_id,
        path: this.path,
      },
    });

    const v: Promise<any>[] = [];
    for (let i = 0; i < queries.length; i++) {
      v.push(callback2(this.client.query, { query: queries[i] }));
    }
    await Promise.all(v);
  };

  loadFromDiskIfNewer = async ({
    lastChanged,
  }: { lastChanged?: number } = {}): Promise<boolean> => {
    const dbg = this.dbg("loadFromDiskIfNewer");
    let stats;
    try {
      stats = await this.stat();
    } catch (err) {
      this.valueOnDisk = undefined; // nonexistent or don't know
      if (err.code == "ENOENT") {
        // path does not exist -- nothing further to do
        return false;
      } else {
        // no clue
        return true;
      }
    }
    dbg("path exists");
    lastChanged = lastChanged ?? this.last_changed();
    const firstLoad = this.versions().length == 0;
    const mtime = stats.mtime.valueOf();
    if (firstLoad || mtime > lastChanged) {
      dbg(
        `disk file changed more recently than edits, so loading ${mtime} > ${lastChanged}; firstLoad=${firstLoad}`,
      );
      try {
        await this.readFile();
      } catch (err) {
        if (err.code != "LOCK") {
          throw err;
        }
      }
      if (firstLoad) {
        dbg("emitting first-load event");
        // this event is emited the first time the document is ever
        // loaded from disk.  It's used, e.g., for notebook "trust" state,
        // so important from a security POV.
        this.emit("first-load");
      }
      dbg("loaded");
    } else {
      dbg("stick with sync version");
    }
    return false;
  };

  private patch_table_query = (cutoff?: number) => {
    const query = {
      string_id: this.string_id,
      is_snapshot: false, // only used with conat
      time: cutoff ? { ">=": cutoff } : null,
      wall: null,
      // compressed format patch as a JSON *string*
      patch: null,
      // integer id of user (maps to syncstring table)
      user_id: null,
      // (optional) a snapshot at this point in time
      snapshot: null,
      // info about sequence number, count, etc. of this snapshot
      seq_info: null,
      parents: null,
      version: null,
    };
    if (this.doctype.patch_format != null) {
      (query as any).format = this.doctype.patch_format;
    }
    return query;
  };

  private setLastSnapshot(last_snapshot?: number) {
    // only set last_snapshot here, so we can keep it in sync with patch_list.last_snapshot
    // and also be certain about the data type (being number or undefined).
    if (last_snapshot !== undefined && typeof last_snapshot != "number") {
      throw Error("type of last_snapshot must be number or undefined");
    }
    this.last_snapshot = last_snapshot;
  }

  private init_patch_list = async (): Promise<void> => {
    this.assert_not_closed("init_patch_list - start");
    const dbg = this.dbg("init_patch_list");
    dbg();

    // CRITICAL: note that handle_syncstring_update checks whether
    // init_patch_list is done by testing whether this.patch_list is defined!
    // That is why we first define "patch_list" below, then set this.patch_list
    // to it only after we're done.
    delete this.patch_list;

    const patch_list = new SortedPatchList({
      from_str: this._from_str,
    });

    dbg("opening the table...");
    const query = { patches: [this.patch_table_query(this.last_snapshot)] };
    this.patches_table = await this.synctable(query, [], this.patch_interval);
    this.assert_not_closed("init_patch_list -- after making synctable");

    const update_has_unsaved_changes = debounce(
      this.update_has_unsaved_changes,
      500,
      { leading: true, trailing: true },
    );

    this.patches_table.on("has-uncommitted-changes", (val) => {
      this.emit("has-uncommitted-changes", val);
    });

    this.on("change", () => {
      update_has_unsaved_changes();
    });

    dbg("adding all known patches");
    patch_list.add(this.get_patches());

    dbg("possibly kick off loading more history");
    let last_start_seq: null | number = null;
    while (patch_list.needsMoreHistory()) {
      // @ts-ignore
      const dstream = this.patches_table.dstream;
      if (dstream == null) {
        break;
      }
      const snap = patch_list.getOldestSnapshot();
      if (snap == null) {
        break;
      }
      const seq_info = snap.seq_info ?? {
        prev_seq: 1,
      };
      const start_seq = seq_info.prev_seq ?? 1;
      if (last_start_seq != null && start_seq >= last_start_seq) {
        // no progress, e.g., corruption would cause this.
        // "corruption" is EXPECTED, since a user might be submitting
        // patches after being offline, and get disconnected halfway through.
        break;
      }
      last_start_seq = start_seq;
      await dstream.load({ start_seq });
      dbg("load more history");
      patch_list.add(this.get_patches());
      if (start_seq <= 1) {
        // loaded everything
        break;
      }
    }

    //this.patches_table.on("saved", this.handle_offline);
    this.patch_list = patch_list;

    let doc;
    try {
      doc = patch_list.value();
    } catch (err) {
      console.warn("error getting doc", err);
      doc = this._from_str("");
    }
    this.last = this.doc = doc;
    this.patches_table.on("change", this.handle_patch_update);

    dbg("done");
  };

  private init_evaluator = async () => {
    if (this.isClosed()) return;
    const dbg = this.dbg("init_evaluator");
    const ext = filename_extension(this.path);
    if (ext !== "sagews") {
      dbg("done -- only use init_evaluator for sagews");
      return;
    }
    dbg("creating the evaluator and waiting for init");
    this.evaluator = new Evaluator(this, this.client, this.synctable);
    await this.evaluator.init();
    dbg("done");
  };

  private init_ipywidgets = async () => {
    const dbg = this.dbg("init_evaluator");
    const ext = filename_extension(this.path);
    if (ext != JUPYTER_SYNCDB_EXTENSIONS) {
      dbg("done -- only use ipywidgets for jupyter");
      return;
    }
    dbg("creating the ipywidgets state table, and waiting for init");
    this.ipywidgets_state = new IpywidgetsState(
      this,
      this.client,
      this.synctable,
    );
    await this.ipywidgets_state.init();
    dbg("done");
  };

  private init_cursors = async () => {
    const dbg = this.dbg("init_cursors");
    if (!this.cursors) {
      dbg("done -- do not care about cursors for this syncdoc.");
      return;
    }
    if (this.useConat) {
      dbg("cursors broadcast using pub/sub");
      this.cursors_table = await this.client.pubsub_conat({
        project_id: this.project_id,
        path: this.path,
        name: "cursors",
      });
      this.cursors_table.on(
        "change",
        (obj: { user_id: number; locs: any; time: number }) => {
          const account_id = this.users[obj.user_id];
          if (!account_id) {
            return;
          }
          if (obj.locs == null && !this.cursor_map.has(account_id)) {
            // gone, and already gone.
            return;
          }
          if (obj.locs != null) {
            // changed
            this.cursor_map = this.cursor_map.set(account_id, fromJS(obj));
          } else {
            // deleted
            this.cursor_map = this.cursor_map.delete(account_id);
          }
          this.emit("cursor_activity", account_id);
        },
      );
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
    const options = [{ ephemeral: true }, { queue_size: 1 }]; // probably deprecated
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
    this.cursors_table.on("change", this.handle_cursors_change);

    dbg("done");
  };

  private handle_cursors_change = (keys) => {
    if (this.state === "closed") {
      return;
    }
    for (const k of keys) {
      const u = JSON.parse(k);
      if (u == null) {
        continue;
      }
      const account_id = this.users[u[1]];
      if (!account_id) {
        // this happens for ephemeral table when project restarts and browser
        // has data it is trying to send.
        continue;
      }
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
  };

  /* Returns *immutable* Map from account_id to list
     of cursor positions, if cursors are enabled.

     - excludeSelf: do not include our own cursor
     - maxAge: only include cursors that have been updated with maxAge ms from now.
  */
  get_cursors = ({
    maxAge = 60 * 1000,
    // excludeSelf:
    // 'always' -- *always* exclude self
    // 'never' -- never exclude self
    // 'heuristic' -- exclude self is older than last set from here, e.g., useful on
    // frontend so we don't see our own cursor unless more than one browser.
    excludeSelf = "always",
  }: {
    maxAge?: number;
    excludeSelf?: "always" | "never" | "heuristic";
  } = {}): Map<string, any> => {
    this.assert_not_closed("get_cursors");
    if (!this.cursors) {
      throw Error("cursors are not enabled");
    }
    if (this.cursors_table == null) {
      return Map(); // not loaded yet -- so no info yet.
    }
    const account_id: string = this.client_id();
    let map = this.cursor_map;
    if (map.has(account_id) && excludeSelf != "never") {
      if (
        excludeSelf == "always" ||
        (excludeSelf == "heuristic" &&
          this.cursor_last_time >=
            new Date(map.getIn([account_id, "time"], 0) as number))
      ) {
        map = map.delete(account_id);
      }
    }
    // Remove any old cursors, where "old" is by default more than maxAge old.
    const now = Date.now();
    for (const [client_id, value] of map as any) {
      const time = value.get("time");
      if (time == null) {
        // this should always be set.
        map = map.delete(client_id);
        continue;
      }
      if (maxAge) {
        // we use abs to implicitly exclude a bad value that is somehow in the future,
        // if that were to happen.
        if (Math.abs(now - time.valueOf()) >= maxAge) {
          map = map.delete(client_id);
          continue;
        }
      }
      if (time >= now + 10 * 1000) {
        // We *always* delete any cursors more than 10 seconds in the future, since
        // that can only happen if a client inserts invalid data (e.g., clock not
        // yet synchronized). See https://github.com/sagemathinc/cocalc/issues/7969
        map = map.delete(client_id);
        continue;
      }
    }
    return map;
  };

  /* Set settings map.  Used for custom configuration just for
     this one file, e.g., overloading the spell checker language.
   */
  set_settings = async (obj): Promise<void> => {
    this.assert_is_ready("set_settings");
    await this.set_syncstring_table({
      settings: obj,
    });
  };

  client_id = () => {
    return this.client.client_id();
  };

  // get settings object
  get_settings = (): Map<string, any> => {
    this.assert_is_ready("get_settings");
    return this.syncstring_table_get_one().get("settings", Map());
  };

  /*
  Commits and saves current live syncdoc to backend.

  Function only returns when there is nothing needing
  saving.

  Save any changes we have as a new patch.
  */
  save = reuseInFlight(async () => {
    const dbg = this.dbg("save");
    dbg();
    // We just keep trying while syncdoc is ready and there
    // are changes that have not been saved (due to this.doc
    // changing during the while loop!).
    if (this.doc == null || this.last == null || this.state == "closed") {
      // EXPECTED: this happens after document is closed
      // There's nothing to do regarding save if the table is
      // already closed.  Note that we *do* have to save when
      // the table is init stage, since the project has to
      // record the newly opened version of the file to the
      // database! See
      //    https://github.com/sagemathinc/cocalc/issues/4986
      return;
    }
    if (this.client?.is_deleted(this.path, this.project_id)) {
      dbg("not saving because deleted");
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
    if (!this.isReady()) {
      // above async waits could have resulted in state change.
      return;
    }
    await this.handle_patch_update_queue(true);
    if (!this.isReady()) {
      return;
    }

    // Ensure all patches are saved to backend.
    // We do this after the above, so that creating the newest patch
    // happens immediately on save, which makes it possible for clients
    // to save current state without having to wait on an async, which is
    // useful to ensure specific undo points (e.g., right before a paste).
    await this.patches_table.save();
  });

  private timeOfLastCommit: number | undefined = undefined;
  private next_patch_time = (): number => {
    let time = this.client.server_time().valueOf();
    if (time == this.timeOfLastCommit) {
      time = this.timeOfLastCommit + 1;
    }
    assertDefined(this.patch_list);
    time = this.patch_list.next_available_time(
      time,
      this.my_user_id,
      this.users.length,
    );
    return time;
  };

  private commit_patch = (time: number, patch: XPatch, file = false): void => {
    this.timeOfLastCommit = time;
    this.assert_not_closed("commit_patch");
    assertDefined(this.patch_list);
    const obj: any = {
      // version for database
      string_id: this.string_id,
      // logical time -- usually the sync'd walltime, but
      // guaranteed to be increasing.
      time,
      // what we show user
      wall: this.client.server_time().valueOf(),
      patch: JSON.stringify(patch),
      user_id: this.my_user_id,
      is_snapshot: false,
      parents: this.patch_list.getHeads(),
      version: this.patch_list.lastVersion() + 1,
    };
    if (file) {
      obj.file = true;
    }

    this.my_patches[time.valueOf()] = obj;

    if (this.doctype.patch_format != null) {
      obj.format = this.doctype.patch_format;
    }

    // If in undo mode put the just-created patch in our
    // without timestamp list, so it won't be included
    // when doing undo/redo.
    if (this.undo_state != null) {
      this.undo_state.without.unshift(time);
    }

    //console.log 'saving patch with time ', time.valueOf()
    let x = this.patches_table.set(obj, "none");
    if (x == null) {
      // TODO: just for NATS right now!
      x = fromJS(obj);
    }
    const y = this.processPatch({ x, patch, size: obj.patch.size });
    this.patch_list.add([y]);
    // Since *we* just made a definite change to the document, we're
    // active, so we check if we should make a snapshot. There is the
    // potential of a race condition where more than one clients make
    // a snapshot at the same time -- this would waste a little space
    // in the stream, but is otherwise harmless, since the snapshots
    // are identical.
    this.snapshotIfNecessary();
  };

  private dstream = () => {
    // @ts-ignore -- in general patches_table might not be a conat one still,
    // or at least dstream is an internal implementation detail.
    const { dstream } = this.patches_table ?? {};
    if (dstream == null) {
      throw Error("dstream must be defined");
    }
    return dstream;
  };

  // return the conat-assigned sequence number of the oldest entry in the
  // patch list with the given time, and also:
  //    - prev_seq -- the sequence number of previous patch before that, for use in "load more"
  //    - index -- the global index of the entry with the given time.
  private conatSnapshotSeqInfo = (
    time: number,
  ): { seq: number; prev_seq?: number } => {
    const dstream = this.dstream();
    // seq = actual sequence number of the message with the patch that we're
    // snapshotting at -- i.e., at time
    let seq: number | undefined = undefined;
    // prev_seq = sequence number of patch of *previous* snapshot, if there is a previous one.
    // This is needed for incremental loading of more history.
    let prev_seq: number | undefined;
    let i = 0;
    for (const mesg of dstream.getAll()) {
      if (mesg.is_snapshot && mesg.time < time) {
        // the seq field of this message has the actual sequence number of the patch
        // that was snapshotted, along with the index of that patch.
        prev_seq = mesg.seq_info.seq;
      }
      if (seq === undefined && mesg.time == time) {
        seq = dstream.seq(i);
      }
      i += 1;
    }
    if (seq == null) {
      throw Error(
        `unable to find message with time '${time}'=${new Date(time)}`,
      );
    }
    return { seq, prev_seq };
  };

  /* Create and store in the database a snapshot of the state
     of the string at the given point in time.  This should
     be the time of an existing patch.

     The point of a snapshot is that if you load all patches recorded
     >= this point in time, then you don't need any earlier ones to
     reconstruct the document, since otherwise, why have the snapshot at
     all, as it does not good.  Due to potentially long offline users
     putting old data into history, this can fail. However, in the usual
     case we should never record a snapshot with this bad property.
  */
  private snapshot = reuseInFlight(async (time: number): Promise<void> => {
    assertDefined(this.patch_list);
    const x = this.patch_list.patch(time);
    if (x == null) {
      throw Error(`no patch at time ${time}`);
    }
    if (x.snapshot != null) {
      // there is already a snapshot at this point in time,
      // so nothing further to do.
      return;
    }

    const snapshot: string = this.patch_list.value({ time }).to_str();
    // save the snapshot itself in the patches table.
    const seq_info = this.conatSnapshotSeqInfo(time);
    const obj = {
      size: snapshot.length,
      string_id: this.string_id,
      time,
      wall: time,
      is_snapshot: true,
      snapshot,
      user_id: x.user_id,
      seq_info,
    };
    // also set snapshot in the this.patch_list, which which saves a little time.
    // and ensures that "(x.snapshot != null)" above works if snapshot is called again.
    this.patch_list.add([obj]);
    this.patches_table.set(obj);
    await this.patches_table.save();
    if (!this.isReady()) {
      return;
    }

    const last_seq = seq_info.seq;
    await this.set_syncstring_table({
      last_snapshot: time,
      last_seq,
    });
    this.setLastSnapshot(time);
    this.last_seq = last_seq;
  });

  // Have a snapshot every this.snapshot_interval patches, except
  // for the very last interval.  Throttle so we don't try to make
  // snapshots too frequently, as making them is always optional and
  // now part of the UI.
  private snapshotIfNecessary = throttle(async (): Promise<void> => {
    if (this.get_state() !== "ready") {
      // especially important due to throttle
      return;
    }
    const dbg = this.dbg("snapshotIfNecessary");
    const max_size = Math.floor(1.2 * MAX_FILE_SIZE_MB * 1000000);
    const interval = this.snapshot_interval;
    dbg("check if we need to make a snapshot:", { interval, max_size });
    assertDefined(this.patch_list);
    const time = this.patch_list.time_of_unmade_periodic_snapshot(
      interval,
      max_size,
    );
    if (time != null) {
      dbg("yes, try to make a snapshot at time", time);
      try {
        await this.snapshot(time);
      } catch (err) {
        // this is expected to happen sometimes, e.g., when sufficient information
        // isn't known about the stream of patches.
        console.log(
          `(expected) WARNING: client temporarily unable to make a snapshot of ${this.path}  -- ${err}`,
        );
      }
    } else {
      dbg("no need to make a snapshot yet");
    }
  }, 60000);

  /*- x - patch object
    - patch: if given will be used as an actual patch
        instead of x.patch, which is a JSON string.
  */
  private processPatch = ({
    x,
    patch,
    size: size0,
  }: {
    x: Map<string, any>;
    patch?: any;
    size?: number;
  }): Patch => {
    let t = x.get("time");
    if (typeof t != "number") {
      // backwards compat
      t = new Date(t).valueOf();
    }
    const time: number = t;
    const wall = x.get("wall") ?? time;
    const user_id: number = x.get("user_id");
    let parents: number[] = x.get("parents")?.toJS() ?? [];
    let size: number;
    const is_snapshot = x.get("is_snapshot");
    if (is_snapshot) {
      size = x.get("snapshot")?.length ?? 0;
    } else {
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
        size = p?.length ?? size0 ?? JSON.stringify(patch).length;
      }
    }

    const obj: Patch = {
      time,
      wall,
      user_id,
      patch,
      size,
      is_snapshot,
      parents,
      version: x.get("version"),
      file: x.get("file"),
    };
    if (is_snapshot) {
      obj.snapshot = x.get("snapshot"); // this is a string
      obj.seq_info = x.get("seq_info")?.toJS();
      if (obj.snapshot == null || obj.seq_info == null) {
        console.warn("WARNING: message = ", x.toJS());
        throw Error(
          `message with is_snapshot true must also set snapshot and seq_info fields -- time=${time}`,
        );
      }
    }
    return obj;
  };

  /* Return all patches with time such that
            time0 <= time <= time1;
     If time0 undefined then sets time0 equal to time of last_snapshot.
     If time1 undefined treated as +oo.
  */
  private get_patches = (): Patch[] => {
    this.assert_table_is_ready("patches");

    // m below is an immutable map with keys the string that
    // is the JSON version of the primary key
    // [string_id, timestamp, user_number].
    let m: Map<string, any> | undefined = this.patches_table.get();
    if (m == null) {
      // won't happen because of assert above.
      throw Error("patches_table must be initialized");
    }
    if (!Map.isMap(m)) {
      // TODO: this is just for proof of concept NATS!!
      m = fromJS(m);
    }
    const v: Patch[] = [];
    m.forEach((x, _) => {
      const p = this.processPatch({ x });
      if (p != null) {
        return v.push(p);
      }
    });
    v.sort(patch_cmp);
    return v;
  };

  hasFullHistory = (): boolean => {
    if (this.patch_list == null) {
      return false;
    }
    return this.patch_list.hasFullHistory();
  };

  // returns true if there may be additional history to load
  // after loading this. return false if definitely done.
  loadMoreHistory = async ({
    all,
  }: {
    // if true, loads all history
    all?: boolean;
  } = {}): Promise<boolean> => {
    if (this.hasFullHistory() || this.ephemeral || this.patch_list == null) {
      return false;
    }
    let start_seq;
    if (all) {
      start_seq = 1;
    } else {
      const seq_info = this.patch_list.getOldestSnapshot()?.seq_info;
      if (seq_info == null) {
        // nothing more to load
        return false;
      }
      start_seq = seq_info.prev_seq ?? 1;
    }
    // Doing this load triggers change events for all the patch info
    // that gets loaded.
    // TODO: right now we load everything, since the seq_info is wrong
    // from the NATS migration.  Maybe this is fine since it is very efficient.
    // @ts-ignore
    await this.patches_table.dstream?.load({ start_seq: 0 });

    // Wait until patch update queue is empty
    while (this.patch_update_queue.length > 0) {
      await once(this, "patch-update-queue-empty");
    }
    return start_seq > 1;
  };

  legacyHistoryExists = async () => {
    const info = await this.legacy.getInfo();
    return !!info.uuid;
  };

  private loadedLegacyHistory = false;
  loadLegacyHistory = reuseInFlight(async () => {
    if (this.loadedLegacyHistory) {
      return;
    }
    this.loadedLegacyHistory = true;
    if (!this.hasFullHistory()) {
      throw Error("must first load full history first");
    }
    const { patches, users } = await this.legacy.getPatches();
    if (this.patch_list == null) {
      return;
    }
    // @ts-ignore - cheating here
    const first = this.patch_list.patches[0];
    if ((first?.parents ?? []).length > 0) {
      throw Error("first patch should have no parents");
    }
    for (const patch of patches) {
      // @ts-ignore
      patch.time = new Date(patch.time).valueOf();
    }
    patches.sort(field_cmp("time"));
    const v: Patch[] = [];
    let version = -patches.length;
    let i = 0;
    for (const patch of patches) {
      // @ts-ignore
      patch.version = version;
      version += 1;
      if (i > 0) {
        // @ts-ignore
        patch.parents = [patches[i - 1].time];
      } else {
        // @ts-ignore
        patch.parents = [];
      }

      // remap the user_id field
      const account_id = users[patch.user_id];
      let user_id = this.users.indexOf(account_id);
      if (user_id == -1) {
        this.users.push(account_id);
        user_id = this.users.length - 1;
      }
      patch.user_id = user_id;

      const p = this.processPatch({ x: fromJS(patch) });
      i += 1;
      v.push(p);
    }
    if (first != null) {
      // @ts-ignore
      first.parents = [patches[patches.length - 1].time];
      first.is_snapshot = true;
      first.snapshot = this.patch_list.value({ time: first.time }).to_str();
    }
    this.patch_list.add(v);
    this.emit("change");
  });

  show_history = (opts = {}): void => {
    assertDefined(this.patch_list);
    this.patch_list.show_history(opts);
  };

  set_snapshot_interval = async (n: number): Promise<void> => {
    await this.set_syncstring_table({
      snapshot_interval: n,
    });
    await this.syncstring_table.save();
  };

  get_last_save_to_disk_time = (): Date => {
    return this.last_save_to_disk_time;
  };

  private handle_syncstring_update = async (): Promise<void> => {
    if (this.state === "closed") {
      return;
    }
    const dbg = this.dbg("handle_syncstring_update");
    dbg();

    const data = this.syncstring_table_get_one();
    const x: any = data != null ? data.toJS() : undefined;

    dbg(JSON.stringify(x));
    if (x == null || x.users == null) {
      dbg("new_document");
      await this.handle_syncstring_update_new_document();
    } else {
      dbg("update_existing");
      await this.handle_syncstring_update_existing_document(x, data);
    }
  };

  private handle_syncstring_update_new_document = async (): Promise<void> => {
    // Brand new document
    this.emit("load-time-estimate", { type: "new", time: 1 });
    this.setLastSnapshot();
    this.last_seq = undefined;
    this.snapshot_interval =
      schema.SCHEMA.syncstrings.user_query?.get?.fields.snapshot_interval ??
      DEFAULT_SNAPSHOT_INTERVAL;

    // Brand new syncstring
    // TODO: worry about race condition with everybody making themselves
    // have user_id 0... and also setting doctype.
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
  };

  private handle_syncstring_update_existing_document = async (
    x: any,
    data: Map<string, any>,
  ): Promise<void> => {
    if (this.state === "closed") {
      return;
    }
    // Existing document.

    if (this.path == null) {
      // We just opened the file -- emit a load time estimate.
      this.emit("load-time-estimate", { type: "ready", time: 1 });
    }
    // TODO: handle doctype change here (?)
    this.setLastSnapshot(x.last_snapshot);
    this.last_seq = x.last_seq;
    this.snapshot_interval = x.snapshot_interval ?? DEFAULT_SNAPSHOT_INTERVAL;
    this.users = x.users ?? [];
    if (x.project_id) {
      // @ts-ignore
      this.project_id = x.project_id;
    }
    if (x.path) {
      // @ts-ignore
      this.path = x.path;
    }

    const settings = data.get("settings", Map());
    if (settings !== this.settings) {
      this.settings = settings;
      this.emit("settings-change", settings);
    }

    if (this.client != null) {
      // Ensure that this client is in the list of clients
      const client_id: string = this.client_id();
      this.my_user_id = this.users.indexOf(client_id);
      if (this.my_user_id === -1) {
        this.my_user_id = this.users.length;
        this.users.push(client_id);
        await this.set_syncstring_table({
          users: this.users,
        });
      }
    }
    this.emit("metadata-change");
  };

  private lastReadFile: number = 0;
  readFile = reuseInFlight(async (): Promise<void> => {
    if (this.isClosed() || this.opts.noSaveToDisk) {
      return;
    }
    const dbg = this.dbg("readFile");

    try {
      // This lock is *extremely* important when opening the document
      // since it prevents having two identical patches, e.g,. when
      // two clients initialize the doc at the same time, which would
      // result in "doubled content" (when the merge conflict happens).
      let lock = 0;
      if (!this.lastReadFile) {
        lock = this.opts.firstReadLockTimeout ?? FIRST_READ_LOCK_TIMEOUT;
      }
      const contents: string = (await this.fs.readFile(
        this.path,
        "utf8",
        lock,
      )) as string;
      this.lastReadFile = Date.now();
      // console.log(this.client.client.id, "read from disk --isDeleted = false");
      this.isDeleted = false;
      this.valueOnDisk = contents;
      dbg("file exists");
      this.from_str(contents);
    } catch (err) {
      if (err.code == "ENOENT") {
        // console.log(this.client.client.id, "reset doc and set isDeleted=true");
        if (!this.isDeleted) {
          this.isDeleted = true;
          this.emit("deleted");
        }
        dbg("file no longer exists -- setting to blank");
        this.from_str("");
        this.commit({ file: true });
      } else {
        throw err;
      }
    }
    // save new version to stream, which we just set via from_str
    this.commit({ emitChangeImmediately: true, file: true });
    await this.save();
    this.emit("after-change");
  });

  is_read_only = (): boolean => {
    if (this.stats) {
      return isReadOnlyForOwner(this.stats);
    } else {
      return false;
    }
  };

  private stats?: Stats;
  stat = async (): Promise<Stats> => {
    if (this.opts.noSaveToDisk) {
      throw Error("the noSaveToDisk options is set");
    }
    const prevStats = this.stats;
    this.stats = (await this.fs.stat(this.path)) as Stats;
    this.isDeleted = false; // definitely not deleted since we just stat' it
    this.lastReadFile = Date.now();
    if (prevStats?.mode != this.stats.mode) {
      // used by clients to track read-only state.
      this.emit("metadata-change");
    }
    return this.stats;
  };

  debouncedStat = debounce(
    async () => {
      try {
        await this.stat();
      } catch {}
    },
    STAT_DEBOUNCE,
    { leading: true, trailing: true },
  );

  wait_until_read_only_known = async (): Promise<void> => {
    await until(
      async () => {
        if (this.isClosed()) {
          return true;
        }
        if (this.stats != null) {
          return true;
        }
        try {
          await this.stat();
          return true;
        } catch {}
        return false;
      },
      { min: 3000 },
    );
  };

  /* Returns true if the current live version of this document has
     a different hash than the version mostly recently saved to disk.
     I.e., if there are changes that have not yet been **saved to
     disk**.  See the other function has_uncommitted_changes below
     for determining whether there are changes that haven't been
     commited to the database yet.  Returns *undefined* if
     initialization not even done yet. */
  has_unsaved_changes = (): boolean | undefined => {
    if (!this.isReady()) {
      return;
    }
    return this.hasUnsavedChanges();
  };

  // Returns hash of last version that we saved to disk or undefined
  // if we haven't saved yet.
  // NOTE: this does not take into account saving by another client
  // anymore; it used to, but that made things much more complicated.
  hash_of_saved_version = (): number | undefined => {
    if (!this.isReady() || this.valueOnDisk == null || this.isDeleted) {
      return;
    }
    return hash_string(this.valueOnDisk);
  };

  /* Return hash of the live version of the document,
     or undefined if the document isn't loaded yet.
     (TODO: write faster version of this for syncdb, which
     avoids converting to a string, which is a waste of time.) */
  hash_of_live_version = (): number | undefined => {
    if (!this.isReady()) {
      return;
    }
    return hash_string(this.doc.to_str());
  };

  /* Return true if there are changes to this syncstring that
     have not been committed to the database (with the commit
     acknowledged).  This does not mean the file has been
     written to disk; however, it does mean that it safe for
     the user to close their browser.
  */
  has_uncommitted_changes = (): boolean => {
    if (!this.isReady()) {
      return false;
    }
    return this.patches_table.has_uncommitted_changes();
  };

  // Commit any changes to the live document to
  // history as a new patch.  Returns true if there
  // were changes and false otherwise.   This works
  // fine offline, and does not wait until anything
  // is saved to the network, etc.
  commit = ({
    emitChangeImmediately = false,
    file = false,
  }: {
    emitChangeImmediately?: boolean;
    // mark this as a commit obtained by loading the file from disk,
    // which can be used as input to the merge conflict resolution.
    file?: boolean;
  } = {}): boolean => {
    if (
      this.last == null ||
      this.doc == null ||
      (this.last.is_equal(this.doc) &&
        (this.patch_list?.getHeads().length ?? 0) <= 1)
    ) {
      return false;
    }
    // console.trace("commit");

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
    const patch = this.last.make_patch(this.doc);
    this.last = this.doc;
    // ... and save that to patches table
    const time = this.next_patch_time();
    this.commit_patch(time, patch, file);
    if (!this.noAutosave) {
      this.save(); // so eventually also gets sync'd out to other clients
    }
    this.touchProject();
    return true;
  };

  // valueOnDisk = value of the file on disk, if known.  If there's an
  // event indicating  what was on disk may have changed, this
  // this.valueOnDisk is deleted until the new version is loaded.
  private valueOnDisk: string | undefined = undefined;

  private hasUnsavedChanges = (): boolean => {
    return this.valueOnDisk != this.to_str() || this.isDeleted;
  };

  writeFile = async () => {
    if (this.opts.noSaveToDisk) {
      return;
    }
    const dbg = this.dbg("writeFile");
    if (this.client.is_deleted(this.path, this.project_id)) {
      dbg("not saving to disk because deleted");
      return;
    }
    dbg();
    if (this.is_read_only()) {
      await this.stat();
      if (this.is_read_only()) {
        // it is definitely still read only.
        return;
      }
    }

    const value = this.to_str();
    // include {ignore:true} with events for this long,
    // so no clients waste resources loading in response to us saving
    // to disk.
    if (this.isClosed()) return;
    this.last_save_to_disk_time = new Date();
    this.emit("before-save-to-disk");
    try {
      // also lock so no other client can read the file
      // (which is a waste and confusing)
      await this.fs.writeFile(this.path, value, true);
      if (this.isClosed()) return;
      this.lastReadFile = Date.now();
    } catch (err) {
      if (err.code == "EACCES") {
        try {
          // update read only knowledge -- that may have caused save error.
          await this.stat();
        } catch {}
      }
      throw err;
    }
    if (this.isClosed()) return;
    const lastChanged = this.last_changed();
    await this.fs.utimes(this.path, lastChanged / 1000, lastChanged / 1000);
    if (this.isClosed()) return;
    this.valueOnDisk = value;
    this.emit("save-to-disk");
  };

  /* Initiates a save of file to disk, then waits for the
     state to change. */
  save_to_disk = reuseInFlight(async (): Promise<void> => {
    if (!this.isReady()) {
      // We just make save_to_disk a successful
      // no operation, if the document is either
      // closed or hasn't finished opening, since
      // there's a lot of code that tries to save
      // on exit/close or automatically, and it
      // is difficult to ensure it all checks state
      // properly.
      return;
    }
    this.commit();
    await this.writeFile();
    this.update_has_unsaved_changes();
  });

  /* Export the (currently loaded) history of editing of this
     document to a simple JSON-able object. */
  export_history = (options: HistoryExportOptions = {}): HistoryEntry[] => {
    this.assert_is_ready("export_history");
    const info = this.syncstring_table.get_one();
    if (info == null || !info.has("users")) {
      throw Error("syncstring table must be defined and users initialized");
    }
    const account_ids: string[] = info.get("users").toJS();
    assertDefined(this.patch_list);
    return export_history(account_ids, this.patch_list, options);
  };

  private update_has_unsaved_changes = (): void => {
    if (!this.isReady()) {
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
  };

  /*
    When the underlying synctable that defines the state
    of the document changes due to new remote patches, this
    function is called.
    It handles update of the remote version, updating our
    live version as a result.
  */
  private handle_patch_update = async (changed_keys): Promise<void> => {
    // console.log("handle_patch_update", { changed_keys });
    if (changed_keys == null || changed_keys.length === 0) {
      // this happens right now when we do a save.
      return;
    }

    const dbg = this.dbg("handle_patch_update");
    //dbg(changed_keys);
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
  };

  /*
  Whenever new patches are added to this.patches_table,
  their timestamp gets added to this.patch_update_queue.
  */
  private handle_patch_update_queue = reuseInFlight(
    async (save = false): Promise<void> => {
      const dbg = this.dbg("handle_patch_update_queue");
      try {
        this.handle_patch_update_queue_running = true;
        while (this.state != "closed" && this.patch_update_queue.length > 0) {
          dbg("queue size = ", this.patch_update_queue.length);
          const v: Patch[] = [];
          for (const key of this.patch_update_queue) {
            let x = this.patches_table.get(key);
            if (x == null) {
              continue;
            }
            if (!Map.isMap(x)) {
              // TODO: my NATS synctable-stream doesn't convert to immutable on get.
              x = fromJS(x);
            }
            // may be null, e.g., when deleted.
            const t = x.get("time");
            // Optimization: only need to process patches that we didn't
            // create ourselves during this session.
            if (t && !this.my_patches[t.valueOf()]) {
              const p = this.processPatch({ x });
              //dbg(`patch=${JSON.stringify(p)}`);
              if (p != null) {
                v.push(p);
              }
            }
          }
          this.patch_update_queue = [];
          this.emit("patch-update-queue-empty");
          assertDefined(this.patch_list);
          this.patch_list.add(v);

          dbg("waiting for remote and doc to sync...");
          this.sync_remote_and_doc(v.length > 0);
          if (save || !this.noAutosave) {
            await this.patches_table.save();
            if (this.state === ("closed" as State)) return; // closed during await; nothing further to do
            dbg("remote and doc now synced");
          }

          if (this.patch_update_queue.length > 0) {
            // It is very important that next loop happen in a later
            // event loop to avoid the this.sync_remote_and_doc call
            // in this.handle_patch_update_queue above from causing
            // sync_remote_and_doc to get called from within itself,
            // due to synctable changes being emited on save.
            dbg("wait for next event loop");
            await delay(1);
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
    },
  );

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

  disable_sync = (): void => {
    this.sync_is_disabled = true;
  };

  enable_sync = (): void => {
    this.sync_is_disabled = false;
    this.sync_remote_and_doc(true);
  };

  delay_sync = (timeout_ms = 2000): void => {
    clearTimeout(this.delay_sync_timer);
    this.disable_sync();
    this.delay_sync_timer = setTimeout(() => {
      this.enable_sync();
    }, timeout_ms);
  };

  /*
    Merge remote patches and live version to create new live version,
    which is equal to result of applying all patches.
  */
  private sync_remote_and_doc = (upstreamPatches: boolean): void => {
    if (this.last == null || this.doc == null || this.sync_is_disabled) {
      return;
    }

    if (!this.last.is_equal(this.doc)) {
      // If live versions differs from last commit (or merge of heads), it is
      // commit what we have now so it doesn't get overwritten during
      // before-change or setting this.doc below.  This caused
      //    https://github.com/sagemathinc/cocalc/issues/5871
      this.commit();
    }

    if (upstreamPatches && this.state == "ready") {
      // First save any unsaved changes from the live document, which this
      // sync-doc doesn't acutally know the state of.  E.g., this is some
      // rapidly changing live editor with changes not yet saved here.
      this.emit("before-change");
      // As a result of the emit in the previous line, all kinds of
      // nontrivial listener code may have just ran, and it could
      // have updated this.doc.  We commit this.doc, so that the
      // upstream patches get applied against the correct live this.doc.
      if (!this.last.is_equal(this.doc)) {
        this.commit();
      }
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
  };

  // Immediately alert all watchers of all changes since
  // last time.
  private emit_change = (): void => {
    this.emit("change", this.doc?.changes(this.before_change));
    this.before_change = this.doc;
  };

  // Alert to changes soon, but debounced in case there are a large
  // number of calls in a group.  This is called by default.
  // The debounce param is 0, since the idea is that this just waits
  // until the next "render loop" to avoid huge performance issues
  // with a nested for loop of sets.  Doing it this way, massively
  // simplifies client code.
  emit_change_debounced: typeof this.emit_change = debounce(
    this.emit_change,
    0,
  );

  private set_syncstring_table = async (obj, save = true) => {
    const value0 = this.syncstring_table_get_one();
    const value = mergeDeep(value0, fromJS(obj));
    if (value0.equals(value)) {
      return;
    }
    this.syncstring_table.set(value);
    if (save) {
      await this.syncstring_table.save();
    }
  };

  // this keeps the project from idle timing out -- it happens
  // whenever there is an edit to the file by a browser, and
  // keeps the project from stopping.
  private touchProject = throttle(() => {
    if (this.client?.is_browser()) {
      this.client.touch_project?.(this.project_id);
    }
  }, 60000);

  private initFileWatcherFirstTime = () => {
    // set this going, but don't await it.
    (async () => {
      await until(
        async () => {
          if (this.isClosed()) return true;
          try {
            await this.initFileWatcher();
            return true;
          } catch {
            return false;
          }
        },
        { min: this.opts?.watchRecreateWait ?? WATCH_RECREATE_WAIT },
      );
    })();
  };

  private fileWatcher?: WatchIterator;
  private initFileWatcher = async () => {
    if (this.opts.noSaveToDisk) {
      return;
    }
    // use this.fs interface to watch path for changes -- we try once:
    try {
      this.fileWatcher = await this.fs.watch(this.path, { unique: true });
      if (this.isDeleted) {
        await this.readFile();
      }
    } catch (err) {
      // console.log("error creating watcher", err);
      if (err.code == "ENOENT") {
        // the file was deleted -- check if this stays deleted long enough to count
        await this.signalIfFileDeleted();
      }
      // throwing this error just causes initFileWatcher to get
      // initialized again soon (a few seconds), again attemping a watch,
      // unless it is the first time initializing the document.
      throw err;
    }
    if (this.isClosed()) return;

    // not closed -- so if above succeeds we start watching.
    // if not, we loop waiting for file to be created so we can watch it
    (async () => {
      if (this.fileWatcher != null) {
        this.emit("watching");
        for await (const { event, ignore, patch } of this.fileWatcher) {
          // console.log({ event, ignore, patch, path: this.path });
          if (this.isClosed()) return;
          if (event.startsWith("unlink")) {
            break;
          }
          if (!ignore) {
            if (patch != null) {
              if (patch.length > 0) {
                const value = this.to_str();
                const [newValue] = apply_patch(patch, value);
                this.from_str(newValue);
                this.commit({ emitChangeImmediately: true, file: true });
                await this.save();
                this.emit("after-change");
              }
            } else {
              // we don't know what's on disk anymore,
              this.valueOnDisk = undefined;
              // and we should find out!
              this.readFileDebounced();
            }
          } else {
            this.debouncedStat();
          }
        }
        // check if file was deleted
        this.signalIfFileDeleted();
        this.fileWatcher?.close();
        delete this.fileWatcher;
      }
      if (this.isClosed()) return;
      // start a new watcher since file descriptor probably changed or maybe file deleted
      await delay(this.opts?.watchRecreateWait ?? WATCH_RECREATE_WAIT);
      await until(
        async () => {
          if (this.isClosed()) return true;
          try {
            await this.initFileWatcher();
            return true;
          } catch {
            return false;
          }
        },
        { min: this.opts?.watchRecreateWait ?? WATCH_RECREATE_WAIT },
      );
    })();
  };

  private closeFileWatcher = () => {
    this.fileWatcher?.close();
    delete this.fileWatcher;
  };

  // returns true if file definitely exists right now,
  // false if it definitely does not, and throws exception otherwise,
  // e.g., network error.
  private fileExists = async (): Promise<boolean> => {
    try {
      await this.stat();
      return true;
    } catch (err) {
      // console.log("sync fileExists err", err);
      if (err.code == "ENOENT") {
        // file not there now.
        return false;
      }
      throw err;
    }
  };

  private signalIfFileDeleted = async (): Promise<void> => {
    if (this.isClosed()) return;
    if (!this.lastReadFile) {
      // can't be a 'deleted' because it doesn't even exist yet.
      return;
    }
    const start = Date.now();
    const threshold = this.opts.deletedThreshold ?? DELETED_THRESHOLD;
    while (!this.isClosed()) {
      try {
        if (await this.fileExists()) {
          // file definitely exists right now -- NOT deleted.
          return;
        }
        // file definitely does NOT exist right now.
      } catch {
        // network not working or project off -- no way to know.
        return;
      }
      const elapsed = Date.now() - start;
      if (elapsed > threshold) {
        // out of time to appear again, and definitely concluded
        // it does not exist above
        // file still doesn't exist -- consider it deleted -- browsers
        // should close the tab and possibly notify user.
        this.from_str("");
        this.commit();
        // console.log("emit deleted and set isDeleted=true");
        if (!this.isDeleted) {
          this.isDeleted = true;
          this.emit("deleted");
        }
        return;
      }
      await delay(
        Math.min(
          this.opts.deletedCheckInterval ?? DELETED_CHECK_INTERVAL,
          threshold - elapsed,
        ),
      );
    }
  };

  push = (doc: SyncDoc, { source }: { source?: string | number } = {}) => {
    remote.push({ local: this, remote: doc, source });
  };

  pull = (doc: SyncDoc, { source }: { source?: string | number } = {}) => {
    remote.push({ local: doc, remote: this, source });
  };
}

function isCompletePatchStream(dstream) {
  if (dstream.length == 0) {
    return false;
  }
  const first = dstream[0];
  if (first.is_snapshot) {
    return false;
  }
  if (first.parents == null) {
    // first ever commit
    return true;
  }
  for (let i = 1; i < dstream.length; i++) {
    if (dstream[i].is_snapshot && dstream[i].time == first.time) {
      return true;
    }
  }
  return false;
}

function isReadOnlyForOwner(stats): boolean {
  // 0o200 is owner write permission
  return (stats.mode & 0o200) === 0;
}
