/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { once } from "../smc-util/async-utils";
import { SyncTable, SyncTableState } from "../smc-util/sync/table";
import { TypedMap } from "../smc-webapp/app-framework";
import {
  close,
  endswith,
  merge,
  path_split,
  startswith,
  field_cmp,
  seconds_ago,
} from "../smc-util/misc";
import { DirectoryListingEntry } from "../smc-util/types";
import { get_listing, get_git_dir } from "../directory-listing";
import {
  WATCH_TIMEOUT_MS,
  MAX_FILES_PER_PATH,
} from "../smc-util/db-schema/listings";
import { Watcher } from "./path-watcher";
import { close_all_syncdocs_in_tree } from "./sync-doc";
import { remove_jupyter_backend } from "../jupyter/jupyter";

// Update directory listing only when file changes stop for at least this long.
// This is important since we don't want to fire off dozens of changes per second,
// e.g., if a logfile is being updated.
const WATCH_DEBOUNCE_MS = 1500;

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
import { MAX_PATHS } from "../smc-util/db-schema/listings";

interface Listing {
  path: string;
  project_id?: string;
  listing?: DirectoryListingEntry[];
  time?: Date;
  interest?: Date;
  missing?: number;
  error?: string;
  deleted?: string[];
  git_dir?: string;
}
export type ImmutableListing = TypedMap<Listing>;

class ListingsTable {
  private readonly table?: SyncTable; // might be removed by close()
  private logger: undefined | { debug: Function };
  private project_id: string;
  private watchers: { [path: string]: Watcher } = {};

  constructor(table: SyncTable, logger: any, project_id: string) {
    this.project_id = project_id;
    this.logger = logger;
    this.log("register");
    this.table = table;
    this.setup_watchers();
  }

  public close(): void {
    this.log("close");
    for (const path in this.watchers) {
      this.stop_watching(path);
    }
    close(this);
  }

  // Start watching any paths that have recent interest (so this is not
  // in response to a *change* after starting).
  private async setup_watchers(): Promise<void> {
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
        this.start_watching(path);
      }
    });
    this.table.on("change", this.handle_change_event.bind(this));

    this.remove_stale_watchers();
  }

  private async remove_stale_watchers(): Promise<void> {
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
          this.stop_watching(path);
        }
      });
    }

    // Now get rid of any old paths that are no longer relevant
    // to reduce wasted database space, memory, and bandwidth for
    // client browsers that are using this project.
    try {
      await this.trim_old_paths();
    } catch (err) {
      this.log("WARNING, error trimming old paths -- ", err);
    }

    if (this.table == null) return; // closed
    if (this.table.get_state() == ("connected" as SyncTableState)) {
      await delay(1000 * INTEREST_THRESH_SECONDS);
      if (this.table == null) return; // closed
      if (this.table.get_state() != ("connected" as SyncTableState)) return;
      this.remove_stale_watchers();
    }
  }

  private log(...args): void {
    if (this.logger == null) return;
    this.logger.debug("listings_table", ...args);
  }

  private is_ready(): boolean {
    return !!this.table?.is_ready();
  }

  private get_table(): SyncTable {
    if (!this.is_ready() || this.table == null) {
      throw Error("table not ready");
    }
    return this.table;
  }

  async set(obj: Listing): Promise<void> {
    this.get_table().set(
      merge({ project_id: this.project_id }, obj),
      "shallow"
    );
    await this.get_table().save();
  }

  public get(path: string): ImmutableListing | undefined {
    const x = this.get_table().get(JSON.stringify([this.project_id, path]));
    if (x == null) return x;
    return (x as unknown) as ImmutableListing;
    // NOTE: That we have to use JSON.stringify above is an ugly shortcoming
    // of the get method in smc-util/sync/table/synctable.ts
    // that could probably be relatively easily fixed.
  }

  private handle_change_event(keys: string[]): void {
    this.log("handle_change_event", JSON.stringify(keys));
    for (const key of keys) {
      this.handle_change(JSON.parse(key)[1]);
    }
  }

  private handle_change(path: string): void {
    this.log("handle_change", path);
    const cur = this.get(path);
    if (cur == null) return;
    let interest: undefined | Date = cur.get("interest");
    if (interest == null) return;
    if (interest >= seconds_ago(INTEREST_THRESH_SECONDS)) {
      // Ensure any possible client clock skew "issue" has no nontrivial impact.
      const time = new Date();
      if (interest > time) {
        interest = time;
        this.set({ path, interest });
      }
      // Make sure we watch this path for updates, since there is genuine current interest.
      this.ensure_watching(path);
    }
  }

  private async ensure_watching(path: string): Promise<void> {
    if (this.watchers[path] != null) {
      // We are already watching this path, so nothing more to do.
      return;
    }

    // Fire off computing of directory listing for this path,
    // and start watching for changes.
    try {
      await this.compute_listing(path);
    } catch (err) {
      this.log(
        "ensure_watching -- failed to compute listing so not starting watching",
        err
      );
      return;
    }
    try {
      this.start_watching(path);
    } catch (err) {
      this.log("failed to start watching", err);
    }
  }

  private async compute_listing(path: string): Promise<void> {
    const time = new Date();
    let listing, git_dir;
    try {
      [listing, git_dir] = await Promise.all([
        get_listing(path, true),
        get_git_dir(path),
      ]);
      if (!this.is_ready()) return;
    } catch (err) {
      if (!this.is_ready()) return;
      this.set({ path, time, error: `${err}` });
      throw err;
    }
    let missing: number | undefined = undefined;

    const y = this.get(path);
    const previous_listing = y?.get("listing")?.toJS();
    let deleted: any = y?.get("deleted")?.toJS();
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

    this.set({ path, listing, time, missing, deleted, error, git_dir });
  }

  private start_watching(path: string): void {
    if (this.watchers[path] != null) return;
    if (process.env.HOME == null) {
      throw Error("HOME env variable must be defined");
    }
    this.watchers[path] = new Watcher(
      path,
      WATCH_DEBOUNCE_MS,
      this.log.bind(this)
    );
    this.watchers[path].on("change", async () => {
      try {
        await delay(DELAY_ON_CHANGE_MS);
        if (!this.is_ready()) return;
        await this.compute_listing(path);
      } catch (err) {
        this.log(`compute_listing("${path}") error: "${err}"`);
      }
    });
  }

  private stop_watching(path: string): void {
    const w = this.watchers[path];
    if (w == null) return;
    delete this.watchers[path];
    w.close();
  }

  private async trim_old_paths(): Promise<void> {
    this.log("trim_old_paths");
    if (!this.is_ready()) return;
    const table = this.get_table();
    let num_to_remove = table.size() - MAX_PATHS;
    this.log("trim_old_paths", num_to_remove);
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
    this.log("trim_old_paths", JSON.stringify(paths));
    this.log("trim_old_paths", num_to_remove);

    if (num_to_remove <= 0) return;
    paths.sort(field_cmp("interest"));
    // Now remove the first num_to_remove paths.
    for (let i = 0; i < num_to_remove; i++) {
      this.log("trim_old_paths -- removing", paths[i].path);
      await this.remove_path(paths[i].path);
    }
  }

  private async remove_path(path: string): Promise<void> {
    if (!this.is_ready()) return;
    this.log("remove_path", path);
    await this.get_table().delete({ project_id: this.project_id, path });
  }

  // Given a "filename", add it to deleted if there is already a record
  // for the containing path in the database.  (TODO: we may change this
  // to create the record if it doesn't exist.)
  public async set_deleted(filename: string): Promise<void> {
    this.log(`set_deleted: ${filename}`);
    if (!this.is_ready()) {
      // set_deleted is a convenience, so dropping it in case of a project
      // with no network is OK.
      this.log(`set_deleted: skipping since not ready`);
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
      this.log(`set_deleted: recording "${deleted}" in "${head}"`);
      await this.set({ path: head, deleted });
      if (!this.is_ready()) return;
    }

    // Also we need to close *all* syncdocs that are going to be deleted,
    // and wait until closing is done before we return.
    await close_all_syncdocs_in_tree(filename);
    if (!this.is_ready()) return;

    // If it is a Jupyter kernel, close that too
    if (endswith(filename, ".ipynb")) {
      this.log(`set_deleted: handling jupyter kernel for ${filename}`);
      await remove_jupyter_backend(filename, this.project_id);
      if (!this.is_ready()) return;
    }
  }

  public is_deleted(filename: string): boolean {
    if (!this.is_ready()) {
      // in case that listings are available, it is safe to just
      // assume file not deleted.  Is_deleted is only used on the
      // backend to redundantly reduce the chances of confusion,
      // since the frontends do the same thing.
      return false;
    }
    const { head, tail } = path_split(filename);
    if (head != "" && this.is_deleted(head)) {
      // recursively check if filename is contained in a
      // directory tree that go deleted.
      return true;
    }
    const x = this.get(head);
    if (x == null) {
      return false;
    }
    const deleted = x.get("deleted");
    if (deleted == null) {
      return false;
    }
    return deleted.indexOf(tail) != -1;
  }
}

let listings_table: ListingsTable | undefined = undefined;
export function register_listings_table(
  table: SyncTable,
  logger: any,
  project_id: string
): void {
  logger.debug("register_listings_table");
  if (listings_table != null) {
    // There was one sitting around wasting space so clean it up
    // before making a new one.
    listings_table.close();
  }
  listings_table = new ListingsTable(table, logger, project_id);
  return;
}

export function get_listings_table(): ListingsTable | undefined {
  return listings_table;
}
