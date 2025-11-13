/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { once } from "@cocalc/util/async-utils";
import { SyncTable, SyncTableState } from "@cocalc/sync/table";
import type { TypedMap } from "@cocalc/util/types/typed-map";
import {
  close,
  merge,
  path_split,
  startswith,
  field_cmp,
  seconds_ago,
} from "@cocalc/util/misc";
import type { Listing } from "@cocalc/util/db-schema/listings";
import {
  WATCH_TIMEOUT_MS,
  MAX_FILES_PER_PATH,
} from "@cocalc/util/db-schema/listings";
import type { EventEmitter } from "events";
import { DirectoryListingEntry } from "@cocalc/util/types";

// Update directory listing only when file changes stop for at least this long.
// This is important since we don't want to fire off dozens of changes per second,
// e.g., if a logfile is being updated.
const WATCH_DEBOUNCE_MS = parseInt(
  process.env.COCALC_FS_WATCH_DEBOUNCE_MS ?? "500",
);

// See https://github.com/sagemathinc/cocalc/issues/4623
// for one reason to put a slight delay in; basically,
// a change could be to delete and then create a file quickly,
// and that confuses our file deletion detection.   A light delay
// is OK given our application.  No approach like this can
// ever be perfect, of course.
const DELAY_ON_CHANGE_MS = 50;

// Watch directories for which some client has shown interest recently:
const INTEREST_THRESH_SECONDS = WATCH_TIMEOUT_MS / 1000;

// Maximum number of paths to keep in listings tables for this project.
// Periodically, info about older paths beyond this number will be purged
// from the database.   NOTE that synctable.delete is "barely" implemented,
// so there may be some issues with this working.
import { MAX_PATHS } from "@cocalc/util/db-schema/listings";

export type ImmutableListing = TypedMap<Listing>;

export interface Watcher extends EventEmitter {
  close();
}

interface Options {
  table: SyncTable;
  project_id: string;
  compute_server_id: number;
  getListing;
  createWatcher;
  onDeletePath;
  existsSync;
  getLogger;
}

class ListingsTable {
  private readonly table?: SyncTable; // will be removed by close()
  private project_id: string;
  private compute_server_id: number;
  private watchers: { [path: string]: Watcher } = {};
  private getListing: (
    path,
    hidden?: boolean,
  ) => Promise<DirectoryListingEntry[]>;
  private createWatcher: (path: string, debounceMs: number) => Watcher;
  private onDeletePath: (path: string) => Promise<void>;
  private existsSync: (path: string) => boolean;
  private log: (...args) => void;

  constructor(opts: Options) {
    this.log = opts.getLogger("sync:listings").debug;
    this.log("constructor");
    this.project_id = opts.project_id;
    this.compute_server_id = opts.compute_server_id ?? 0;
    this.table = opts.table;
    this.getListing = opts.getListing;
    this.createWatcher = opts.createWatcher;
    this.onDeletePath = opts.onDeletePath;
    this.existsSync = opts.existsSync;
    this.setupWatchers();
  }

  close = () => {
    this.log("close");
    for (const path in this.watchers) {
      this.stopWatching(path);
    }
    close(this);
  };

  // Start watching any paths that have recent interest (so this is not
  // in response to a *change* after starting).
  private setupWatchers = async () => {
    if (this.table == null) return; // closed
    if (this.table.get_state() == ("init" as SyncTableState)) {
      await once(this.table, "state");
    }
    if (this.table.get_state() != ("connected" as SyncTableState)) {
      return; // game over
    }
    this.table.get()?.forEach((val) => {
      const path = val.get("path");
      if (path == null) return;
      if (this.watchers[path] == null) return; // already watching -- shouldn't happen
      const interest = val.get("interest");
      if (interest != null && interest > seconds_ago(INTEREST_THRESH_SECONDS)) {
        this.startWatching(path);
      }
    });
    this.table.on("change", this.handleChangeEvent);

    this.removeStaleWatchers();
  };

  private removeStaleWatchers = async () => {
    if (this.table == null) return; // closed
    if (this.table.get_state() == ("connected" as SyncTableState)) {
      this.table.get()?.forEach((val) => {
        const path = val.get("path");
        if (path == null) return;
        if (this.watchers[path] == null) return;
        const interest = val.get("interest");
        if (
          interest == null ||
          interest <= seconds_ago(INTEREST_THRESH_SECONDS)
        ) {
          this.stopWatching(path);
        }
      });
    }

    // Now get rid of any old paths that are no longer relevant
    // to reduce wasted database space, memory, and bandwidth for
    // client browsers that are using this project.
    try {
      await this.trimOldPaths();
    } catch (err) {
      this.log("WARNING, error trimming old paths -- ", err);
    }

    if (this.table == null) return; // closed
    if (this.table.get_state() == ("connected" as SyncTableState)) {
      await delay(1000 * INTEREST_THRESH_SECONDS);
      if (this.table == null) return; // closed
      if (this.table.get_state() != ("connected" as SyncTableState)) return;
      this.removeStaleWatchers();
    }
  };

  private isReady = (): boolean => {
    return !!this.table?.is_ready();
  };

  private getTable = (): SyncTable => {
    if (!this.isReady() || this.table == null) {
      throw Error("table not ready");
    }
    return this.table;
  };

  set = async (obj: Listing) => {
    this.getTable().set(
      merge(
        {
          project_id: this.project_id,
          compute_server_id: this.compute_server_id,
        },
        obj,
      ),
      "shallow",
    );
    await this.getTable().save();
  };

  get = (path: string): ImmutableListing | undefined => {
    path = canonicalPath(path);
    const x = this.getTable().get(
      JSON.stringify([this.project_id, path, this.compute_server_id]),
    );
    if (x == null) return x;
    return x as unknown as ImmutableListing;
    // NOTE: That we have to use JSON.stringify above is an ugly shortcoming
    // of the get method in @cocalc/sync/table/synctable.ts
    // that could probably be relatively easily fixed.
  };

  private handleChangeEvent = (keys: string[]) => {
    this.log("handleChangeEvent", JSON.stringify(keys));
    for (const key of keys) {
      this.handleChange(JSON.parse(key)[1]);
    }
  };

  private handleChange = (path: string): void => {
    this.log("handleChange", path);
    const cur = this.get(path);
    if (cur == null) return;
    let interest: undefined | Date = cur.get("interest");
    if (interest == null) return;
    if (interest >= seconds_ago(INTEREST_THRESH_SECONDS)) {
      // Ensure any possible client clock skew "issue" has no trivial bad impact.
      const time = new Date();
      if (interest > time) {
        interest = time;
        this.set({ path, interest });
      }
      // Make sure we watch this path for updates, since there is genuine current interest.
      this.ensureWatching(path);
    }
  };

  private ensureWatching = async (path: string): Promise<void> => {
    path = canonicalPath(path);
    if (this.watchers[path] != null) {
      // We are already watching this path
      if (this.get(path)?.get("error")) {
        this.log("ensureWatching -- removing old watcher due to error", path);
        this.stopWatching(path);
      } else {
        return;
      }
    }

    // Fire off computing of directory listing for this path,
    // and start watching for changes.
    try {
      await this.computeListing(path);
    } catch (err) {
      this.log(
        "ensureWatching -- failed to compute listing so not starting watching",
        err,
      );
      return;
    }
    try {
      this.startWatching(path);
    } catch (err) {
      this.log("failed to start watching", err);
    }
  };

  private computeListing = async (path: string): Promise<void> => {
    path = canonicalPath(path);
    const time = new Date();
    let listing;
    try {
      listing = await this.getListing(path, true);
      if (!this.isReady()) return;
    } catch (err) {
      if (!this.isReady()) return;
      this.set({ path, time, error: `${err}` });
      throw err;
    }
    let missing: number | undefined = undefined;

    const y = this.get(path);
    const previous_listing = y?.get("listing")?.toJS() as any;
    let deleted: any = y?.get("deleted")?.toJS() as any;
    if (previous_listing != null) {
      // Check to see to what extend change in the listing is due to files
      // being deleted.  Note that in case of a directory with a large
      // number of files we only know about recent files (since we don't)
      // store the full listing, so deleting a non-recent file won't get
      // detected here -- which is fine, since deletion tracking is important
      // mainly for recently files.
      const cur = new Set();
      for (const x of listing) {
        cur.add(x.name);
      }
      for (const x of previous_listing) {
        if (!cur.has(x.name)) {
          // x.name is suddenly gone... so deleted
          if (deleted == null) {
            deleted = [x.name];
          } else {
            if (deleted.indexOf(x.name) == -1) {
              deleted.push(x.name);
            }
          }
        }
      }
    }

    // Shrink listing length
    if (listing.length > MAX_FILES_PER_PATH) {
      listing.sort(field_cmp("mtime"));
      listing.reverse();
      missing = listing.length - MAX_FILES_PER_PATH;
      listing = listing.slice(0, MAX_FILES_PER_PATH);
    }
    // We want to clear the error, but just clearning it in synctable doesn't
    // clear to database, so if there is an error, we set it to "" which does
    // save fine to the database. (TODO: this is just a workaround.)
    const error = y?.get("error") != null ? "" : undefined;

    this.set({ path, listing, time, missing, deleted, error });
  };

  private startWatching = (path: string): void => {
    path = canonicalPath(path);
    if (this.watchers[path] != null) return;
    if (process.env.HOME == null) {
      throw Error("HOME env variable must be defined");
    }
    this.watchers[path] = this.createWatcher(path, WATCH_DEBOUNCE_MS);
    this.watchers[path].on("change", async () => {
      try {
        await delay(DELAY_ON_CHANGE_MS);
        if (!this.isReady()) return;
        await this.computeListing(path);
      } catch (err) {
        this.log(`computeListing("${path}") error: "${err}"`);
      }
    });
  };

  private stopWatching = (path: string): void => {
    path = canonicalPath(path);
    const w = this.watchers[path];
    if (w == null) return;
    delete this.watchers[path];
    w.close();
  };

  private trimOldPaths = async (): Promise<void> => {
    this.log("trimOldPaths");
    if (!this.isReady()) return;
    const table = this.getTable();
    let num_to_remove = table.size() - MAX_PATHS;
    this.log("trimOldPaths", num_to_remove);
    if (num_to_remove <= 0) {
      // definitely nothing to do
      return;
    }

    // Check to see if we can trim some paths.  We sort the paths
    // by "interest" timestamp, and eliminate the oldest ones that are
    // not *currently* being watched.
    const paths: { path: string; interest: Date }[] = [];
    table.get()?.forEach((val) => {
      const path = val.get("path");
      if (this.watchers[path] != null) {
        num_to_remove -= 1;
        // paths we are watching are not eligible to be removed.
        return;
      }
      const interest = val.get("interest", new Date(0));
      paths.push({ path, interest });
    });
    this.log("trimOldPaths", JSON.stringify(paths));
    this.log("trimOldPaths", num_to_remove);

    if (num_to_remove <= 0) return;
    paths.sort(field_cmp("interest"));
    // Now remove the first num_to_remove paths.
    for (let i = 0; i < num_to_remove; i++) {
      this.log("trimOldPaths -- removing", paths[i].path);
      await this.removePath(paths[i].path);
    }
  };

  private removePath = async (path: string): Promise<void> => {
    if (!this.isReady()) return;
    this.log("removePath", path);
    await this.getTable().delete({ project_id: this.project_id, path });
  };

  // Given a "filename", add it to deleted if there is already a record
  // for the containing path in the database.  (TODO: we may change this
  // to create the record if it doesn't exist.)
  setDeleted = async (filename: string): Promise<void> => {
    this.log("setDeleted:", filename);
    if (!this.isReady()) {
      // setDeleted is a convenience, so dropping it in case of a project
      // with no network is OK.
      this.log(`setDeleted: skipping since not ready`);
      return;
    }
    if (filename[0] == "/") {
      // absolute path
      if (process.env.HOME == null || !startswith(filename, process.env.HOME)) {
        // can't do anything with this.
        return;
      }
      filename = filename.slice(process.env.HOME.length + 1);
    }
    const { head, tail } = path_split(filename);
    const x = this.get(head);
    if (x != null) {
      // TODO/edge case: if x is null we *could* create the path here...
      let deleted: any = x.get("deleted");
      if (deleted == null) {
        deleted = [tail];
      } else {
        if (deleted.indexOf(tail) != -1) return;
        deleted = deleted.toJS();
        deleted.push(tail);
      }
      this.log(`setDeleted: recording "${deleted}" in "${head}"`);
      await this.set({ path: head, deleted });
      if (!this.isReady()) return;
    }

    await this.onDeletePath(filename);
  };

  // Returns true if definitely known to be deleted.
  // Returns false if definitely known to not be deleted
  // Returns null if we don't know for sure, e.g., not in listing table or listings not ready.
  isDeleted = (filename: string): boolean | null => {
    if (!this.isReady()) {
      // in case that listings are not available, return null -- we don't know.
      return null;
    }
    const { head, tail } = path_split(filename);
    if (head != "" && this.isDeleted(head)) {
      // recursively check if filename is contained in a
      // directory tree that go deleted.
      return true;
    }
    const x = this.get(head);
    if (x == null) {
      // we don't know.
      return null;
    }
    const deleted = x.get("deleted");
    if (deleted == null) {
      // we don't know
      return null;
    }
    // table is available and has deleted info for the directory -- let's see:
    if (deleted.indexOf(tail) != -1) {
      // it was explicitly deleted at some point.
      // It *might* still be deleted.  Check on disk now
      // via a synchronous check.
      if (this.existsSync(filename)) {
        // it now exists -- return false but also update the table since
        // path is no longer deleted
        this.set({
          path: head,
          deleted: deleted.toJS().filter((x) => x != tail),
        });
        return false;
      } else {
        // definitely explicitly deleted and not back on disk for some reason,
        return true;
      }
    }
    return false;
  };
}

let listingsTable: { [compute_server_id: number]: ListingsTable } = {};
export function registerListingsTable(opts: Options): void {
  const { compute_server_id = 0 } = opts;
  if (listingsTable[compute_server_id] != null) {
    // There was one sitting around wasting space so clean it up
    // before making a new one.
    listingsTable[compute_server_id].close();
  }
  listingsTable[compute_server_id] = new ListingsTable(opts);
}

export function getListingsTable(
  compute_server_id: number = 0,
): ListingsTable | undefined {
  return listingsTable[compute_server_id];
}

// this does a tiny amount to make paths more canonical.
function canonicalPath(path: string): string {
  if (path == "." || path == "~") {
    return "";
  }
  return path;
}
