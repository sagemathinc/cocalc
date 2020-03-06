import { delay } from "awaiting";

import { once } from "../smc-util/async-utils";
import { SyncTable } from "../smc-util/sync/table";
import { TypedMap } from "../smc-webapp/app-framework";
import { merge } from "../smc-util/misc2";
import { field_cmp, seconds_ago } from "../smc-util/misc";
import { get_listing } from "../directory-listing";
import {
  WATCH_TIMEOUT_MS,
  MAX_FILES_PER_PATH
} from "../smc-util/db-schema/listings";
import { Watcher } from "./path-watcher";

// Update directory listing only when file changes stop for at least this long.
// This is important since we don't want to fire off dozens of changes per second,
// e.g., if a logfile is being updated.
const WATCH_DEBOUNCE_MS = 1000;

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
  listing?: object[];
  time?: Date;
  interest?: Date;
  missing?: number;
  error?: string;
}
export type ImmutableListing = TypedMap<Listing>;

class ListingsTable {
  private table: SyncTable;
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
    delete this.table;
    delete this.logger;
    delete this.project_id;
    for (const path in this.watchers) {
      this.stop_watching(path);
    }
    delete this.watchers;
  }

  // Start watching any paths that have recent interest (so this is not
  // in response to a *change* after starting).
  private async setup_watchers(): Promise<void> {
    if (this.table == null) return; // closed
    if (this.table.get_state() == "init") {
      await once(this.table, "state");
    }
    if (this.table.get_state() != "connected") {
      return; // game over
    }
    this.table.get().forEach(val => {
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
    if (this.table.get_state() == "connected") {
      this.table.get().forEach(val => {
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
    if (this.table.get_state() == "connected") {
      await delay(1000 * INTEREST_THRESH_SECONDS);
      if (this.table == null) return; // closed
      if (this.table.get_state() != "connected") return;
      this.remove_stale_watchers();
    }
  }

  private log(...args): void {
    if (this.logger == null) return;
    this.logger.debug("listings_table", ...args);
  }

  private get_table(): SyncTable {
    if (this.table == null) return; // closed
    if (this.table.get_state() != "connected") {
      throw Error("table not initialized ");
    }
    return this.table;
  }

  set(obj: Listing): void {
    this.get_table().set(
      merge({ project_id: this.project_id }, obj),
      "shallow"
    );
    this.get_table().save();
  }

  public get(path: string): ImmutableListing | undefined {
    return this.get_table().get(JSON.stringify([this.project_id, path]));
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
    let listing;
    try {
      listing = await get_listing(path, true);
    } catch (err) {
      this.set({ path, time, error: `${err}` });
      throw err;
    }
    let missing: number | undefined = undefined;
    if (listing.length > MAX_FILES_PER_PATH) {
      listing.sort(field_cmp("mtime"));
      listing.reverse();
      missing = listing.length - MAX_FILES_PER_PATH;
      listing = listing.slice(0, MAX_FILES_PER_PATH);
    }
    this.set({ path, listing, time, missing, error: undefined });
  }

  private start_watching(path: string): void {
    if (this.watchers[path] != null) return;
    if (process.env.HOME == null) {
      throw Error("HOME env variable must be defined");
    }
    this.watchers[path] = new Watcher(path, WATCH_DEBOUNCE_MS);
    this.watchers[path].on("change", async () => {
      try {
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
    table.get().forEach(val => {
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
    this.log("remove_path", path);
    await this.get_table().delete({ project_id: this.project_id, path });
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
