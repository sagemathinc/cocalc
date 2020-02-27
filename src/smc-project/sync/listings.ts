import { watch, FSWatcher } from "fs";
import { join } from "path";

import { debounce } from "lodash";
import { delay } from "awaiting";

import { once } from "../smc-util/async-utils";
import { SyncTable } from "../smc-util/sync/table";
import { TypedMap } from "../smc-webapp/app-framework";
import { merge } from "../smc-util/misc2";
import { field_cmp, seconds_ago } from "../smc-util/misc";
import { get_listing } from "../directory-listing";

// Maximum number of entries in a directory listing.  If this is exceeded
// we sort by last modification time, take only the first MAX_LENGTH
// most recent entries, and set missing to the number that are missing.
const MAX_LENGTH = 100;

// Update directory listing only when file changes stop for at least this long.
const WATCH_DEBOUNCE_MS = 1000;

// Watch directories for which some client has shown interest recently:
const INTEREST_THRESH_SECONDS = 60;

interface Listing {
  path: string;
  project_id?: string;
  listing?: object[];
  time?: Date;
  interest?: Date;
  missing?: number;
}
export type ImmutableListing = TypedMap<Listing>;

class ListingsTable {
  private table: SyncTable;
  private logger: undefined | { debug: Function };
  private project_id: string;
  private watchers: { [path: string]: FSWatcher } = {};

  constructor(table: SyncTable, logger: any, project_id: string) {
    this.project_id = project_id;
    this.logger = logger;
    this.log("register");
    this.table = table;
    this.setup_watchers();
  }

  // Start watching any paths that have recent interest (so this is not
  // in response to a *change* after starting).
  private async setup_watchers(): Promise<void> {
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

    await delay(1000 * INTEREST_THRESH_SECONDS/2);
    this.remove_stale_watchers();
  }

  private async remove_stale_watchers(): Promise<void> {
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

    if (this.table.get_state() == "connected") {
      await delay(1000 * INTEREST_THRESH_SECONDS);
      if (this.table.get_state() != "connected") return;
      this.remove_stale_watchers();
    }
  }

  private log(...args): void {
    if (this.logger == null) return;
    this.logger.debug("listings_table", ...args);
  }

  private get_table(): SyncTable {
    if (this.table == null || this.table.get_state() != "connected") {
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
    let listing = await get_listing(path, true);
    let missing: number | undefined = undefined;
    if (listing.length > MAX_LENGTH) {
      listing.sort(field_cmp("mtime"));
      listing.reverse();
      missing = listing.length - MAX_LENGTH;
      listing = listing.slice(0, MAX_LENGTH);
    }
    this.set({ path, listing, time, missing });
  }

  private start_watching(path: string): void {
    if (this.watchers[path] != null) return;
    if (process.env.HOME == null) {
      throw Error("HOME env variable must be defined");
    }
    const abs_path = join(process.env.HOME, path);
    this.watchers[path] = watch(
      abs_path,
      debounce(async (_type, _filename) => {
        /* We could maintain the directory listing and just try to update info about the filename,
         taking into account the type.  That's probably really hard to get right, and just
         debouncing and computing the whole listing is going to be vastly easier and good
         enough at least for first round of this. */
        try {
          await this.compute_listing(path);
        } catch (err) {
          // TODO: no such directory should be encoded in the listing object or database.
          this.log(`updating "${path}" due to change failed`, err);
        }
      }, WATCH_DEBOUNCE_MS)
    );
  }

  private stop_watching(path: string): void {
    const w = this.watchers[path];
    if (w == null) return;
    delete this.watchers[path];
    w.close();
  }
}

export function register_listings_table(
  table: SyncTable,
  logger: any,
  project_id: string
): void {
  logger.debug("register_listings_table");
  new ListingsTable(table, logger, project_id);
}
