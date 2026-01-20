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

*/

// How big of files we allow users to open using syncstrings.
const MAX_FILE_SIZE_MB = 32;

// This parameter determines throttling when broadcasting cursor position
// updates.   Make this larger to reduce bandwidth at the expense of making
// cursors less responsive.
const CURSOR_THROTTLE_MS = 150;

// Reserved slot/user for backend filesystem-originated patches.
const FILESYSTEM_USER_ID = 0;
const FILESYSTEM_CLIENT_ID = "__filesystem__";

// If file does not exist for this long, then syncdoc emits a 'deleted' event.
export const DELETED_THRESHOLD = 2000;
export const DELETED_CHECK_INTERVAL = 750;

const STAT_DEBOUNCE = 10000;

import { DEFAULT_SNAPSHOT_INTERVAL } from "@cocalc/util/db-schema/syncstring-schema";

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { SyncTable } from "@cocalc/sync/table/synctable";
import { cancel_scheduled, once, until } from "@cocalc/util/async-utils";
import { wait } from "@cocalc/util/async-wait";
import { close, hash_string, minutes_ago } from "@cocalc/util/misc";
import * as schema from "@cocalc/util/schema";
import { delay } from "awaiting";
import { EventEmitter } from "events";
import { Map, fromJS } from "immutable";
import { debounce, throttle } from "lodash";
import { HistoryEntry, HistoryExportOptions, export_history } from "./export";
import { IpywidgetsState } from "./ipywidgets-state";
import {
  Session as PatchflowSession,
  type DocCodec,
  type PatchId,
  comparePatchId,
  decodePatchId,
  legacyPatchId,
  type PatchEnvelope,
  type PatchStore as PatchflowPatchStore,
  type PresenceAdapter as PatchflowPresenceAdapter,
  MemoryPresenceAdapter as PatchflowMemoryPresenceAdapter,
} from "patchflow";
import type {
  Client,
  CompressedPatch,
  DocType,
  Document,
  Patch,
} from "./types";
import { isTestClient, patch_cmp } from "./util";
import mergeDeep from "@cocalc/util/immutable-deep-merge";
import { type Filesystem, type Stats } from "@cocalc/conat/files/fs";
import { getLogger } from "@cocalc/conat/client";
import * as remote from "./remote";
import type { JSONValue } from "@cocalc/util/types";

const fallbackCursorPresence = new PatchflowMemoryPresenceAdapter();

const DEBUG = false;

export type State = "init" | "ready" | "closed";
export type DataServer = "project" | "database";

export interface SyncOpts0 {
  project_id: string;
  path: string;
  client: Client;
  fs: Filesystem;

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

  // if true, do not implicitly save to permanent storage on commit.
  // This is useful for unit testing to easily simulate offline state.
  // (This is not related to writing a file to disk.)
  noAutosave?: boolean;

  // if true, never saves to disk or loads from disk -- this is NOT
  // ephemeral -- the history is tracked in the conat database!
  noSaveToDisk?: boolean;

  // optional timeout for how long to wait from when a file is
  // deleted until emitting a 'deleted' event.
  deletedThreshold?: number;
  deletedCheckInterval?: number;

  watchDebounce?: number;
  firstReadLockTimeout?: number;

  // if not set (the default), right when the document is 'ready',
  // there will be a change event with (for db's) an argument that
  // is the Set of all values.  If true, that initial big
  // change event happens, but the Set is empty.
  ignoreInitialChanges?: boolean;
}

export interface SyncOpts extends SyncOpts0 {
  from_str: (str: string) => Document;
  doctype: DocType;
}

// NOTE: Do not make multiple SyncDoc's for the same document, especially
// not on the frontend.

const logger = getLogger("sync-doc");
logger.debug("init");

export class SyncDoc extends EventEmitter {
  static events = new EventEmitter();
  static lite = false;

  public readonly opts: SyncOpts;
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


  public ipywidgets_state?: IpywidgetsState;

  private patchflowSession?: PatchflowSession;
  private patchflowStore?: PatchflowPatchStore;
  private patchflowCodec?: DocCodec;

  private last: Document;
  private doc: Document;
  private before_change?: Document;
  private cursorSnapshots: any[] = [];

  private last_user_change: Date = minutes_ago(60);
  private last_save_to_disk_time: Date = new Date(0);

  private last_snapshot?: PatchId;
  private last_seq?: number;
  private snapshot_interval: number;

  private users: string[];

  private settings: Map<string, any> = Map();

  // patches that this client made during this editing session.
  private my_patches: { [time: PatchId]: any } = {};

  private undo_mode = false;

  private persistent: boolean = false;

  private last_has_unsaved_changes?: boolean = undefined;

  private ephemeral: boolean = false;

  private useConat: boolean;

  public readonly fs: Filesystem;

  private noAutosave?: boolean;
  private backendFsWatchTimer?: NodeJS.Timeout;

  // The isDeleted flag is set to true if the file existed and then
  // was actively deleted after the session started. It would
  // then only be set back to false if the file appears again.
  public isDeleted: boolean = false;

  private emitDeleted = (): void => {
    if (!this.isDeleted) {
      this.isDeleted = true;
      this.emit("deleted");
    }
  };

  constructor(opts: SyncOpts) {
    super();
    this.opts = opts;

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

    this.client.once("closed", this.close);

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
    this.set_state("ready");

    // Success -- everything initialized with no issues.
    if (this.opts.ignoreInitialChanges) {
      // clear all changes up to this point
      this.before_change = this.doc;
    }
    this.emit_change(); // from nothing to something.
  });

  /* Set this user's cursors to the given locs. */
  setCursorLocsNoThrottle = async (
    // locs is 'any' and not any[] because of a codemirror syntax highlighting bug!
    locs: any,
    side_effect: boolean = false,
  ) => {
    if (!this.cursors) {
      throw Error("cursors are not enabled");
    }
    if (!this.isReady()) {
      return;
    }
    if (!this.patchflowReady()) {
      return;
    }
    const now = this.client.server_time();
    if (!side_effect || now >= this.cursor_last_time) {
      this.cursor_last_time = now;
    }
    this.requirePatchflowSession().updateCursors(locs);
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
      for (const patchId in this.my_patches) {
        if (new Date(this.patchTime(patchId)) > this.last_user_change) {
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
    return this.my_user_id != null ? this.my_user_id : 1;
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
    if (exit_undo_mode) this.exit_undo_mode();
    // console.log(`sync-doc.set_doc("${doc.to_str()}")`);
    this.doc = doc;

    // debounced, so don't immediately alert, in case there are many
    // more sets comming in the same loop:
    this.emit_change_debounced();
  };

  // Convenience function to avoid having to do
  // get_doc and set_doc constantly.
  set = (x: any): void => {
    this.assert_is_ready("set");
    this.set_doc(this.doc.set(x));
  };

  delete = (x?: any): void => {
    this.assert_is_ready("delete");
    this.set_doc(this.doc.delete(x));
  };

  get = (x?: any): any => {
    this.assert_is_ready("get");
    return this.doc.get(x);
  };

  get_one(x?: any): any {
    this.assert_is_ready("get_one");
    return this.doc.get_one?.(x);
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
  version = (time?: PatchId): Document => {
    return this.requirePatchflowSession().value({ time }) as Document;
  };

  /* Compute version of document if the patches at the given times
     were simply not included.  This is a building block that is
     used for implementing undo functionality for client editors. */
  version_without = (without_times: PatchId[]): Document => {
    return this.requirePatchflowSession().value({
      withoutTimes: without_times,
    }) as Document;
  };

  // Revert document to what it was at the given point in time.
  // There doesn't have to be a patch at exactly that point in
  // time -- if there isn't it just uses the patch before that
  // point in time.
  revert = (time: PatchId): void => {
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
    this.assert_is_ready("undo");
    const session = this.requirePatchflowSession();
    this.ensurePatchflowLiveDocCommitted();
    this.undo_mode = true;
    const prev = session.getDocument() as Document;
    const next = session.undo() as Document;
    this.doc = next;
    this.last = next;
    if (!this.documentsEqual(prev, next)) {
      this.emit("user-change");
      this.emit_change();
    }
    return next;
  };

  redo = (): Document => {
    this.assert_is_ready("redo");
    const session = this.requirePatchflowSession();
    this.undo_mode = true;
    const prev = session.getDocument() as Document;
    const next = session.redo() as Document;
    this.doc = next;
    this.last = next;
    if (!this.documentsEqual(prev, next)) {
      this.emit("user-change");
      this.emit_change();
    }
    return next;
  };

  in_undo_mode = (): boolean => {
    return this.undo_mode;
  };

  exit_undo_mode = (): void => {
    this.undo_mode = false;
    if (this.patchflowReady()) {
      this.patchflowSession?.resetUndo();
    }
  };

  // If the live doc differs from patchflow's current doc, commit it so undo/redo
  // can step over the unsaved change.
  private ensurePatchflowLiveDocCommitted(): void {
    if (!this.patchflowReady() || this.patchflowSession == null) {
      return;
    }
    try {
      const committed =
        (this.patchflowSession as any).getCommittedDocument?.() ??
        this.patchflowSession.getDocument();
      if (!this.documentsEqual(committed as Document, this.doc)) {
        this.commitWithPatchflow({ allowDuplicate: false });
      }
    } catch {
      // ignore -- patchflow session not yet ready
    }
  }

  // account_id of the user who made the edit at
  // the given point in time.
  account_id = (time: PatchId): string | undefined => {
    this.assert_is_ready("account_id");
    const patch = this.patchflowPatch(time);
    if (patch?.file) {
      return this.project_id;
    }
    return this.users[this.user_id(time)];
  };

  // Integer index of user who made the edit at given
  // point in time.
  user_id = (time: PatchId): number => {
    const patch = this.patchflowPatch(time);
    if (patch == null) {
      throw new Error(`no patch at time ${time}`);
    }
    return patch.userId ?? 0;
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

  /* List of patch ids of the versions of this string in the sync
     table that we opened to start editing (so starts with what was
     the most recent snapshot when we started), sorted from oldest to newest. */
  versions = (): PatchId[] => {
    const v = this.patchflowVersions();
    if (v == null) {
      throw new Error("patchflow session not ready");
    }
    return v;
  };

  getHeads = (): PatchId[] => {
    if (!this.patchflowReady() || this.patchflowSession == null) {
      throw new Error("patchflow session not ready");
    }
    return this.patchflowSession.getHeads();
  };

  wallTime = (version: PatchId): number | undefined => {
    const patch = this.patchflowPatch(version);
    return patch?.wall;
  };

  // return time of a patch, which is encoded in the patchid,
  // and is NOT guaranteed to be unique among patches.
  patchTime = (version: PatchId): number => {
    return decodePatchId(version).timeMs;
  };

  // newest version of any non-staging known patch on this client,
  // including ones just made locally.
  newestVersion = (): PatchId | undefined => {
    const v = this.patchflowVersions();
    if (v != null && v.length > 0) {
      return v[v.length - 1];
    }
    return undefined;
  };

  hasVersion = (time: PatchId): boolean => {
    const v = this.patchflowVersions();
    if (v != null) {
      return v.includes(time);
    }
    return false;
  };

  historyFirstVersion = () => {
    const v = this.patchflowVersions();
    if (v != null && v.length > 0) {
      return v[0];
    }
    return;
  };

  historyLastVersion = () => {
    const v = this.patchflowVersions();
    if (v != null && v.length > 0) {
      return v[v.length - 1];
    }
    return;
  };

  historyVersionNumber = (time: PatchId): number | undefined => {
    const patch = this.patchflowPatch(time);
    return patch?.version;
  };

  last_changed = (): number => {
    const v = this.versions();
    const last = v[v.length - 1];
    return last ? decodePatchId(last).timeMs : 0;
  };

  private init_table_close_handlers(): void {
    for (const x of ["syncstring", "patches"]) {
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

    this.stopBackendFsWatch();

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

    this.patchflowSession?.close();

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
        ephemeral: true, // eval state is always ephemeral
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
    await this.handle_syncstring_update();
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

    log("patchflow, cursors, ipywidgets");
    this.assert_not_closed(
      "initAll -- before init patchflow, cursors, ipywidgets",
    );
    // Ensure we load syncstring metadata (including last_snapshot/last_seq)
    // before opening the patches table, so we don't fetch the entire history
    // when a snapshot is available.
    await this.init_syncstring_table();
    await this.init_patchflow();
    await this.startBackendFsWatch();
    await Promise.all([this.init_cursors()]);
    this.assert_not_closed(
      "initAll -- successful init patchflow, cursors, and ipywidgets",
    );

    this.init_table_close_handlers();
    this.assert_not_closed("initAll -- successful init_table_close_handlers");

    log("file_use_interval");
    this.init_file_use_interval();

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

  private patch_table_query = (cutoff?: PatchId) => {
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

  private setLastSnapshot(last_snapshot?: PatchId) {
    // only set last_snapshot here, so we can keep it in sync with the syncstring table
    // and also be certain about the data type (being PatchId string or undefined).
    this.last_snapshot = last_snapshot;
  }

  private init_patchflow = async (): Promise<void> => {
    this.assert_not_closed("init_patchflow - start");
    const dbg = this.dbg("init_patchflow");
    dbg();

    dbg("opening the table...");
    const query = { patches: [this.patch_table_query(this.last_snapshot)] };
    this.patches_table = await this.synctable(query, [], this.patch_interval);
    this.assert_not_closed("init_patchflow -- after making synctable");

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

    await this.initPatchflowSession();

    // Ensure doc/last are initialized even if listeners run before ready state.
    if (this.patchflowReady() && this.patchflowSession != null) {
      try {
        const doc = this.patchflowSession.getDocument() as Document;
        this.last = this.doc = doc;
      } catch {
        // session will emit change after init and set doc/last then.
      }
    }

    dbg("done");
  };

  private initPatchflowSession = reuseInFlight(async (): Promise<void> => {
    if (this.patchflowSession || this.patches_table == null) {
      return;
    }
    const dbg = this.dbg("initPatchflowSession");
    this.patchflowCodec = this.buildPatchflowCodec();
    this.patchflowStore = this.createPatchflowStore();
    this.patchflowSession = new PatchflowSession({
      codec: this.patchflowCodec,
      patchStore: this.patchflowStore,
      clock: () => this.client?.server_time().valueOf() ?? Date.now(),
      userId: this.my_user_id ?? 1,
      docId: this.string_id,
      presenceAdapter: await this.createCursorPresenceAdapter(),
    });
    if (this.cursors) {
      this.patchflowSession.on("cursors", this.handlePatchflowCursors);
    }
    this.patchflowSession.on("patch", this.handlePatchflowPatch);
    this.patchflowSession.on("change", (doc) => {
      const next = doc as Document;
      if (!this.doc || !this.doc.is_equal(next)) {
        this.last = this.doc = next;
        if (this.state === "ready") {
          this.emit("after-change");
          this.emit_change();
        }
      }
    });
    await this.patchflowSession.init();
    dbg("patchflow session initialized");

    // check if file was deleted
    const v = this.patchflowVersions();
    if (v?.length) {
      const mostRecentPatch = this.patchflowSession.getPatch(v[v.length - 1]);
      if (mostRecentPatch?.meta?.deleted || this.isDeleted) {
        this.emitDeleted();
      } else {
        // check if deleted when backend not watching it
        try {
          await this.stat();
        } catch (err) {
          if (err.code == "ENOENT") {
            //  we know for sure the file doesn't exist
            this.emitDeleted();
          }
        }
      }
    }

    this.emit("patchflow-ready");
  });

  init_ipywidgets = reuseInFlight(async () => {
    if (this.ipywidgets_state != null) {
      return;
    }
    const dbg = this.dbg("init_ipywidgets");
    dbg("creating the ipywidgets state table, and waiting for init");
    this.ipywidgets_state = new IpywidgetsState(
      this,
      this.client,
      this.synctable,
    );
    await this.ipywidgets_state.init();
    dbg("done");
  });

  private init_cursors = async () => {
    const dbg = this.dbg("init_cursors");
    if (!this.cursors) {
      dbg("done -- do not care about cursors for this syncdoc.");
      return;
    }
    await this.initPatchflowSession();
    if (!this.patchflowReady()) {
      await once(this, "patchflow-ready");
    }
    if (!this.patchflowReady()) {
      dbg("patchflow not ready; skipping cursor setup");
      return;
    }
    this.cursor_map = this.buildCursorMap();
    this.patchflowSession?.on("cursors", this.handlePatchflowCursors);
    this.handlePatchflowCursors();
    dbg("done");
  };

  private handlePatchflowCursors = (states?: any[]): void => {
    const snapshots =
      states ??
      this.cursorSnapshots ??
      this.requirePatchflowSession().cursors();
    this.cursorSnapshots = snapshots;
    let map = Map<string, any>();
    for (const state of snapshots) {
      if (state.docId && state.docId !== this.string_id) {
        continue;
      }
      const key =
        (state.userId != null ? this.users[state.userId] : undefined) ??
        state.clientId ??
        `client-${state.time}`;
      const time = new Date(state.time);
      map = map.set(
        key,
        fromJS({
          user_id: state.userId,
          locs: state.locs,
          time,
        }),
      );
      this.emit("cursor_activity", key);
    }
    this.cursor_map = map;
  };

  private buildCursorMap = ({
    maxAge = 60 * 1000,
    excludeSelf = "always",
    states,
  }: {
    maxAge?: number;
    excludeSelf?: "always" | "never" | "heuristic";
    states?: any[];
  } = {}): Map<string, any> => {
    if (!this.patchflowReady()) {
      return Map();
    }
    const session = this.requirePatchflowSession();
    const account_id: string = this.client_id();
    const snapshots =
      states ?? this.cursorSnapshots ?? session.cursors({ ttlMs: maxAge });
    let map = Map<string, any>();
    const now = Date.now();
    for (const state of snapshots) {
      if (state.docId && state.docId !== this.string_id) {
        continue;
      }
      const key =
        (state.userId != null ? this.users[state.userId] : undefined) ??
        state.clientId ??
        `client-${state.time}`;
      const time = new Date(state.time);
      map = map.set(
        key,
        fromJS({
          user_id: state.userId,
          locs: state.locs,
          time,
        }),
      );
    }
    if (map.has(account_id) && excludeSelf != "never") {
      const ourTime = map.getIn([account_id, "time"], 0);
      if (
        excludeSelf == "always" ||
        (excludeSelf == "heuristic" &&
          this.cursor_last_time >= new Date(ourTime as number))
      ) {
        map = map.delete(account_id);
      }
    }
    for (const [client_id, value] of map as any) {
      const time = value.get("time");
      if (time == null) {
        map = map.delete(client_id);
        continue;
      }
      if (maxAge && Math.abs(now - time.valueOf()) >= maxAge) {
        map = map.delete(client_id);
        continue;
      }
      if (time >= now + 10 * 1000) {
        map = map.delete(client_id);
        continue;
      }
    }
    return map;
  };

  /* Returns *immutable* Map from account_id to list
     of cursor positions, if cursors are enabled.

     - excludeSelf: do not include our own cursor
     - maxAge: only include cursors that have been updated with maxAge ms from now.
  */
  get_cursors = ({
    maxAge = 60 * 1000,
    excludeSelf = "always",
  }: {
    maxAge?: number;
    excludeSelf?: "always" | "never" | "heuristic";
  } = {}): Map<string, any> => {
    this.assert_not_closed("get_cursors");
    if (!this.cursors) {
      throw Error("cursors are not enabled");
    }
    this.cursor_map = this.buildCursorMap({ maxAge, excludeSelf });
    return this.cursor_map;
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
      if (!this.commit()) {
        // Could not commit (e.g., patchflow not ready)
        break;
      }
      if (!this.isReady()) {
        return;
      }
    }
    if (!this.isReady()) {
      // above async waits could have resulted in state change.
      return;
    }

    // Ensure all patches are saved to backend.
    // We do this after the above, so that creating the newest patch
    // happens immediately on save, which makes it possible for clients
    // to save current state without having to wait on an async, which is
    // useful to ensure specific undo points (e.g., right before a paste).
    await this.patches_table.save();
  });

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
    time: PatchId,
  ): { seq: number; prev_seq?: number } => {
    const dstream = this.dstream();
    const normalizePatchId = (raw: unknown): PatchId => {
      if (typeof raw === "string") return raw;
      if (typeof raw === "number") return legacyPatchId(raw);
      // fall back to string coercion to avoid crashing on unexpected old rows
      return legacyPatchId(new Date(String(raw)).valueOf());
    };
    // seq = actual sequence number of the message with the patch that we're
    // snapshotting at -- i.e., at time
    let seq: number | undefined = undefined;
    // prev_seq = sequence number of patch of *previous* snapshot, if there is a previous one.
    // This is needed for incremental loading of more history.
    let prev_seq: number | undefined;
    let i = 0;
    for (const mesg of dstream.getAll()) {
      const mesgTime = normalizePatchId(mesg.time);
      if (mesg.is_snapshot && comparePatchId(mesgTime, time) < 0) {
        // the seq field of this message has the actual sequence number of the patch
        // that was snapshotted, along with the index of that patch.
        prev_seq = mesg.seq_info.seq;
      }
      if (seq === undefined && mesgTime === time) {
        seq = dstream.seq(i);
      }
      i += 1;
    }
    if (seq == null) {
      const timeMs = decodePatchId(time).timeMs;
      throw Error(
        `unable to find message with time '${time}'=${new Date(timeMs)}`,
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
  private snapshot = reuseInFlight(async (time: PatchId): Promise<void> => {
    let user_id = this.my_user_id ?? 0;
    let snapshot: string | undefined;
    if (!this.patchflowReady() || this.patchflowSession == null) {
      throw new Error("patchflow session not ready");
    }
    const p = this.patchflowSession.getPatch(time);
    if (p == null) {
      throw Error(`no patch at time ${time}`);
    }
    if (p.isSnapshot && p.snapshot != null) {
      return;
    }
    user_id = p.userId ?? user_id;
    const doc = this.patchflowSession.value({ time }) as any;
    snapshot = (doc?.to_str?.() ?? doc?.toString?.() ?? `${doc}`) as string;
    if (snapshot == null) {
      throw Error("unable to compute snapshot");
    }
    const seq_info = this.conatSnapshotSeqInfo(time);
    const wall = p.wall ?? decodePatchId(time).timeMs;
    const obj = {
      size: snapshot.length,
      string_id: this.string_id,
      time,
      wall,
      is_snapshot: true,
      snapshot,
      user_id,
      seq_info,
    };
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
    if (!this.patchflowReady()) {
      return;
    }
    const time = this.patchflowSnapshotCandidate(interval, max_size);
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
    const normalizePatchId = (raw: unknown): PatchId => {
      if (typeof raw === "string") {
        // Backward compat: some old patches used ISO timestamps for `time`.
        if (!raw.includes("_")) {
          const legacy = new Date(raw).valueOf();
          if (!Number.isNaN(legacy)) {
            return legacyPatchId(legacy);
          }
        }
        return raw;
      }
      if (typeof raw === "number") {
        return legacyPatchId(raw);
      }
      throw new Error(`invalid patch time: raw='${raw}'`);
    };

    const time = normalizePatchId(x.get("time"));
    const wall: number = x.get("wall") ?? decodePatchId(time).timeMs;
    const user_id: number = x.get("user_id");
    let parents: PatchId[] = (x.get("parents")?.toJS() ?? []).map(
      normalizePatchId,
    );
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
    if (x.has("meta")) {
      const m = x.get("meta");
      obj.meta = Map.isMap(m) ? m.toJS() : m;
    }
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
  private toPatchflowEnvelope = (p: Patch): PatchEnvelope => {
    return {
      time: p.time,
      wall: p.wall,
      patch: p.patch,
      parents: p.parents,
      userId: p.user_id,
      size: p.size,
      version: p.version,
      isSnapshot: p.is_snapshot,
      snapshot: p.snapshot,
      seqInfo: p.seq_info,
      file: p.file,
      meta: p.meta,
    };
  };

  private patchFromEnvelope = (env: PatchEnvelope): Patch => {
    return {
      time: env.time,
      wall: env.wall,
      patch: env.patch as CompressedPatch | undefined,
      parents: env.parents,
      user_id: env.userId ?? 0,
      size: env.size ?? 0,
      version: env.version,
      is_snapshot: env.isSnapshot,
      snapshot: env.snapshot,
      seq_info: env.seqInfo,
      file: env.file,
      meta: env.meta,
    };
  };

  private buildPatchflowCodec = (): DocCodec => {
    return {
      fromString: (text: string) => this._from_str(text),
      toString: (doc: Document) =>
        (doc as any).to_str ? (doc as any).to_str() : doc.toString(),
      applyPatch: (doc: Document, patch: unknown) => {
        // console.log("applyPatch", patch);
        return ((doc as any).apply_patch ?? doc.applyPatch).call(doc, patch);
      },
      applyPatchBatch: (doc: Document, patches: unknown[]) => {
        const applyBatch =
          (doc as any).apply_patch_batch ?? (doc as any).applyPatchBatch;
        if (typeof applyBatch === "function") {
          return applyBatch.call(doc, patches);
        }
        return (patches as unknown[]).reduce<Document>(
          (current, patch) =>
            ((current as any).apply_patch ?? current.applyPatch).call(
              current,
              patch,
            ),
          doc,
        );
      },
      makePatch: (a: Document, b: Document) =>
        ((a as any).make_patch ?? a.makePatch).call(a, b),
    };
  };

  private async createCursorPresenceAdapter(): Promise<
    PatchflowPresenceAdapter | undefined
  > {
    if (!this.cursors) {
      return;
    }
    if (this.useConat && this.client.pubsub_conat) {
      const table = await this.client.pubsub_conat({
        project_id: this.project_id,
        path: this.path,
        name: "cursors",
      });
      const listeners: Array<(state: unknown, clientId: string) => void> = [];
      table.on("change", (obj: { user_id?: number }) => {
        const account_id =
          obj?.user_id != null ? this.users[obj.user_id] : undefined;
        const clientId = account_id ?? `cursor-${obj?.user_id ?? "unknown"}`;
        for (const fn of listeners) {
          fn(obj, clientId);
        }
      });
      return {
        publish: (state: unknown) => {
          table.set(state);
        },
        subscribe: (onState: (state: unknown, clientId: string) => void) => {
          listeners.push(onState);
          return () => {
            const i = listeners.indexOf(onState);
            if (i >= 0) {
              listeners.splice(i, 1);
            }
          };
        },
      };
    }
    // Fallback for test/fake clients: shared in-memory presence.
    return fallbackCursorPresence;
  }

  private createPatchflowStore = (): PatchflowPatchStore => {
    return {
      loadInitial: async () => {
        const raw = this.get_patches();
        const patches = raw.map((p) => this.toPatchflowEnvelope(p));
        return { patches, hasMore: !this.patchesHaveFullHistory(raw) };
      },
      append: (env: PatchEnvelope) => {
        try {
          if (this.patches_table == null) {
            throw new Error(
              "patches_table must be initialized before appending",
            );
          }
          const patch = this.patchFromEnvelope(env);
          const obj: any = {
            string_id: this.string_id,
            time: patch.time,
            wall: patch.wall ?? patch.time,
            user_id: patch.user_id ?? this.my_user_id,
            is_snapshot: patch.is_snapshot ?? false,
            parents: patch.parents ?? [],
            version:
              patch.version ??
              (this.patchflowReady() && this.patchflowSession
                ? this.patchflowSession.versions().length + 1
                : 1),
          };
          if (patch.file) {
            obj.file = true;
          }
          if (!patch.is_snapshot) {
            obj.patch = JSON.stringify(patch.patch ?? []);
          } else {
            obj.snapshot = patch.snapshot;
            obj.seq_info = patch.seq_info;
          }
          if (patch.meta != null) {
            obj.meta = patch.meta;
          }
          if (this.doctype.patch_format != null) {
            obj.format = this.doctype.patch_format;
          }
          this.my_patches[patch.time] = obj;
          let x = this.patches_table.set(obj, "none");
          if (x == null) {
            x = fromJS(obj);
          }
          this.processPatch({ x, patch: patch.patch, size: patch.size });
        } catch (err) {
          console.warn("patchflow append failed", err);
          console.warn(env);
          throw err;
        }
      },
      subscribe: (onEnvelope: (env: PatchEnvelope) => void) => {
        if (this.patches_table == null) {
          throw new Error(
            "patches_table must be initialized before subscribing",
          );
        }
        const handler = (keys: any[]) => {
          const envs: PatchEnvelope[] = [];
          for (const key of keys ?? []) {
            let x = this.patches_table.get(key);
            if (x == null) {
              continue;
            }
            if (!Map.isMap(x)) {
              x = fromJS(x);
            }
            const p = this.processPatch({ x });
            if (p != null) {
              envs.push(this.toPatchflowEnvelope(p));
            }
          }
          for (const env of envs) {
            onEnvelope(env);
          }
        };
        const table: any = this.patches_table;
        table.on("change", handler);
        return () => {
          if (table?.off) {
            table.off("change", handler);
          } else if (table?.removeListener) {
            table.removeListener("change", handler);
          }
        };
      },
    };
  };

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
      try {
        const p = this.processPatch({ x });
        if (p != null) {
          return v.push(p);
        }
      } catch (err) {
        console.warn("Dropping a patch - ", err);
      }
    });
    v.sort(patch_cmp);
    return v;
  };

  private patchesHaveFullHistory = (patches: Patch[]): boolean => {
    const first = patches[0];
    if (first == null) return true;
    if (first.is_snapshot) return false;
    return (first.parents?.length ?? 0) === 0;
  };

  hasFullHistory = (): boolean => {
    if (this.patchflowReady() && this.patchflowSession != null) {
      try {
        return this.patchflowSession.hasFullHistory();
      } catch {
        // fall back to local computation below
      }
    }
    try {
      return this.patchesHaveFullHistory(this.get_patches());
    } catch {
      return false;
    }
  };

  // returns true if there may be additional history to load
  // after loading this. return false if definitely done.
  loadMoreHistory = async ({
    all,
  }: {
    // if true, loads all history
    all?: boolean;
  } = {}): Promise<boolean> => {
    if (this.hasFullHistory() || this.ephemeral || !this.patchflowReady()) {
      return false;
    }
    let dstream: any;
    try {
      dstream = this.dstream();
    } catch {
      return false;
    }
    const start_seq = all ? 0 : this.patchflowPrevSeqForMoreHistory();
    if (start_seq == null) {
      return false;
    }
    await dstream.load({ start_seq });
    if (start_seq <= 1) {
      this.markPatchflowFullHistory();
    }
    return start_seq > 1;
  };

  show_history = (opts = {}): void => {
    this.requirePatchflowSession().summarizeHistory({
      includeSnapshots: true,
      milliseconds: (opts as any)?.milliseconds ?? true,
      trunc: (opts as any)?.trunc ?? 80,
      log: (opts as any)?.log ?? console.log,
      formatDoc: (doc) => (doc as any).to_str?.() ?? `${doc}`,
    });
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
    // Reserve slot 0 for filesystem-originated patches; first user starts at 1.
    this.my_user_id = 1;
    this.users = [FILESYSTEM_CLIENT_ID, this.client.client_id()];
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
    this.users = x.users ?? [FILESYSTEM_USER_ID];
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
      // Ensure that this client is in the list of clients and uses a non-reserved slot.
      const client_id: string = this.client_id();
      let idx = this.users.indexOf(client_id);
      if (idx === -1) {
        this.users.push(client_id);
        idx = this.users.length - 1;
        await this.set_syncstring_table({ users: this.users });
      } else if (
        idx === FILESYSTEM_USER_ID &&
        this.users[idx] !== FILESYSTEM_CLIENT_ID
      ) {
        // Slot 0 is reserved for filesystem patches; if we collide, append a new slot.
        this.users.push(client_id);
        idx = this.users.length - 1;
        await this.set_syncstring_table({ users: this.users });
      }
      this.my_user_id = Math.max(1, idx);
    }
    this.emit("metadata-change");
  };

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

  private patchflowReady = (): boolean => {
    return (
      this.patchflowSession != null &&
      this.patchflowStore != null &&
      this.patchflowCodec != null
    );
  };

  private requirePatchflowSession = (): PatchflowSession => {
    if (!this.patchflowReady() || this.patchflowSession == null) {
      throw new Error("patchflow session is not initialized");
    }
    return this.patchflowSession;
  };

  private patchflowPatch = (time: PatchId): PatchEnvelope | undefined => {
    if (!this.patchflowReady() || this.patchflowSession == null) return;
    try {
      return this.patchflowSession.getPatch(time);
    } catch {
      return;
    }
  };

  private patchflowVersions = (): PatchId[] | undefined => {
    if (!this.patchflowReady() || this.patchflowSession == null) return;
    try {
      return this.patchflowSession.versions();
    } catch {
      return;
    }
  };

  private handlePatchflowPatch = (env: PatchEnvelope): void => {
    if (env.meta?.deleted) {
      this.emitDeleted();
    } else if (this.isDeleted) {
      this.isDeleted = false;
    }
  };

  private patchflowPrevSeqForMoreHistory = (): number | undefined => {
    if (!this.patchflowReady() || this.patchflowSession == null) return;
    const history = this.patchflowSession.history({ includeSnapshots: true });
    let prevSeq: number | undefined;
    let oldestTimeMs: number | undefined;
    for (const p of history) {
      if (p.isSnapshot && p.seqInfo?.prevSeq != null) {
        const timeMs = decodePatchId(p.time).timeMs;
        if (oldestTimeMs == null || timeMs < oldestTimeMs) {
          oldestTimeMs = timeMs;
          prevSeq = p.seqInfo.prevSeq;
        }
      }
    }
    return prevSeq;
  };

  private patchflowSnapshotCandidate = (
    interval: number,
    max_size: number,
  ): PatchId | undefined => {
    if (!this.patchflowReady() || this.patchflowSession == null) return;
    const history = this.patchflowSession.history({ includeSnapshots: true });
    if (history.length === 0) return;
    const snapshots = history.filter((p) => p.isSnapshot);
    const lastSnapshotTime =
      snapshots.length > 0 ? snapshots[snapshots.length - 1].time : undefined;
    const window = history.filter((p) =>
      lastSnapshotTime != null
        ? comparePatchId(p.time, lastSnapshotTime) >= 0
        : true,
    );
    if (window.length === 0) return;
    // Rule 1: interval count
    if (window.length >= 2 * interval) {
      const idx = Math.min(interval, window.length - 1);
      return window[idx].time;
    }
    // Rule 2: size threshold
    let totalSize = 0;
    for (const p of window) {
      if (!p.isSnapshot) {
        totalSize += p.size ?? 0;
      }
    }
    if (totalSize > max_size) {
      let running = 0;
      for (const p of window) {
        running += p.size ?? 0;
        if (running > max_size) {
          return p.time;
        }
      }
    }
    return;
  };

  private markPatchflowFullHistory = (): void => {
    if (!this.patchflowReady() || this.patchflowSession == null) return;
    try {
      if (
        typeof (this.patchflowSession as any).markFullHistory === "function"
      ) {
        (this.patchflowSession as any).markFullHistory();
      }
    } catch (err) {
      console.warn("markPatchflowFullHistory failed", err);
    }
  };

  private documentsEqual = (a?: Document, b?: Document): boolean => {
    if (a == null || b == null) {
      return false;
    }
    const docA: any = a as any;
    if (typeof docA.is_equal === "function") {
      return docA.is_equal(b);
    }
    if (typeof docA.isEqual === "function") {
      return docA.isEqual(b);
    }
    return a === b;
  };

  private commitWithPatchflow = ({
    emitChangeImmediately = false,
    file = false,
    allowDuplicate = false,
    meta,
  }: {
    emitChangeImmediately?: boolean;
    file?: boolean;
    allowDuplicate?: boolean;
    meta?: { [key: string]: JSONValue };
  }): boolean => {
    if (!this.patchflowReady() || this.patchflowSession == null) {
      throw new Error("patchflow session is not initialized");
    }
    const next = this.doc;
    if (next == null) {
      return false;
    }
    let current: Document | undefined;
    // If there are multiple heads, we need to emit a merge patch even when the
    // content is identical, so that the heads collapse to a single tip.
    const forceMerge =
      this.patchflowReady() &&
      this.patchflowSession != null &&
      this.patchflowSession.getHeads().length > 1;
    try {
      current = this.patchflowSession.getDocument() as Document;
    } catch {
      // session not initialized yet
      return false;
    }
    const compareAgainst = current;
    if (
      !allowDuplicate &&
      !forceMerge &&
      this.documentsEqual(compareAgainst as Document, next)
    ) {
      return false;
    }
    if (emitChangeImmediately) {
      this.emit_change();
    }
    this.emit("user-change");
    // Ensure save loops don't spin while the async commit runs.
    this.last = next;
    try {
      const env = this.patchflowSession.commit(next as any, { file, meta });
      const myPatches = (this.my_patches = this.my_patches ?? {});
      myPatches[env.time] = { time: env.time } as any;
      this.snapshotIfNecessary();
    } catch (err) {
      console.warn("patchflow commit failed", err?.message ?? err);
      console.warn(err?.stack ?? "");
      this.dbg("commitWithPatchflow")(`commit failed -- ${err}`);
    }
    const latest = this.patchflowSession.versions().slice(-1)[0];
    if (latest != null) {
      const myPatches = (this.my_patches = this.my_patches ?? {});
      if (!myPatches[latest]) {
        myPatches[latest] = { time: latest } as any;
      }
    }
    if (!this.noAutosave) {
      this.save(); // eventually syncs out to other clients
    }
    this.touchProject();
    return true;
  };

  // Commit any changes to the live document to
  // history as a new patch.  Returns true if there
  // were changes and false otherwise.   This works
  // fine offline, and does not wait until anything
  // is saved to the network, etc.
  commit = ({
    emitChangeImmediately = false,
    file = false,
    allowDuplicate = false,
    meta,
  }: {
    emitChangeImmediately?: boolean;
    // mark this as a commit obtained by loading the file from disk,
    // which can be used as input to the merge conflict resolution.
    file?: boolean;
    allowDuplicate?: boolean;
    meta?: { [key: string]: JSONValue };
  } = {}): boolean => {
    return this.commitWithPatchflow({
      emitChangeImmediately,
      file,
      allowDuplicate,
      meta,
    });
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
      if (typeof this.fs.writeFileDelta !== "function") {
        throw new Error("writeFileDelta is required for safe, atomic writes");
      }
      // writeFileDelta is both efficient and guarantees atomic writes.
      await this.fs.writeFileDelta(this.path, value, {
        baseContents: this.valueOnDisk,
        saveLast: true,
      });
      if (this.isClosed()) return;
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
    this.isDeleted = false;
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
    const patches = this.requirePatchflowSession().history({
      includeSnapshots: true,
    });
    return export_history(account_ids, patches, options);
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

  // Immediately alert all watchers of all changes since
  // last time.
  private emit_change = (): void => {
    this.emit("change", this.doc?.changes?.(this.before_change));
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

  private async sendBackendFsWatch(active: boolean): Promise<void> {
    if (this.opts?.noSaveToDisk) return;
    const syncFsWatch = (this.fs as any)?.syncFsWatch;
    if (typeof syncFsWatch !== "function") return;
    try {
      await syncFsWatch(this.path, active, {
        project_id: this.project_id,
        relativePath: this.path,
        string_id: this.string_id,
        doctype: this.doctype,
      });
    } catch (err) {
      this.dbg("syncFsWatch")(`failed: ${err?.message ?? err}`);
    }
  }

  private async startBackendFsWatch(): Promise<void> {
    if (this.opts.noSaveToDisk) return;
    if (process.env.SYNC_FS_DEBUG) {
      console.log("startBackendFsWatch", {
        path: this.path,
      });
    }
    await this.sendBackendFsWatch(true);
    if (this.backendFsWatchTimer != null) {
      clearInterval(this.backendFsWatchTimer);
    }
    // Keep the backend watcher alive; TTL is 60s so ping every 30s.
    this.backendFsWatchTimer = setInterval(() => {
      void this.sendBackendFsWatch(true);
    }, 30000);
  }

  private stopBackendFsWatch(): void {
    if (this.backendFsWatchTimer != null) {
      clearInterval(this.backendFsWatchTimer);
      this.backendFsWatchTimer = undefined;
    }
    void this.sendBackendFsWatch(false);
  }

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
