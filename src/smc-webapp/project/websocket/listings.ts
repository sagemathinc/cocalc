import { EventEmitter } from "events";
import { List, fromJS } from "immutable";
import { throttle } from "lodash";

import { SyncTable } from "smc-util/sync/table";
import { webapp_client } from "../../webapp-client";
import { redux, TypedMap } from "../../app-framework";
import { merge } from "smc-util/misc2";
import { once } from "smc-util/async-utils";
import { query } from "../../frame-editors/generic/client";

import { get_directory_listing } from "../directory-listing";

import { WATCH_TIMEOUT_MS } from "smc-util/db-schema/listings";
export const WATCH_THROTTLE_MS = WATCH_TIMEOUT_MS / 2;

interface PathEntry {
  name: string;
  mtime: number;
  size: number;
  isdir?: boolean;
}

type ImmutablePathEntry = TypedMap<PathEntry>;

type State = "init" | "ready" | "closed";

interface Listing {
  path: string;
  project_id?: string;
  listing?: PathEntry[];
  time?: Date;
  interest?: Date;
  missing?: number;
  error?: string;
}
export type ImmutableListing = TypedMap<Listing>;

export class Listings extends EventEmitter {
  private table?: SyncTable;
  private project_id: string;
  private last_version: { [path: string]: any } = {}; // last version emitted via change event.
  private state: State = "init";
  private throttled_watch: { [path: string]: Function } = {};

  constructor(project_id: string): void {
    super();
    this.project_id = project_id;
    this.init();
  }

  // Watch directory for changes.
  // IMPORTANT: This may and must be called frequently, e.g., at least
  // once every 45 seconds.  The point is to convey to the backend
  // that at least one client is interested in this path.
  // Don't worry about calling this function **too much**, since
  // it throttles calls.
  public async watch(path: string): Promise<void> {
    if (this.throttled_watch[path] == null) {
      this.throttled_watch[path] = throttle(
        () => this._watch(path),
        WATCH_THROTTLE_MS,
        {
          leading: true,
          trailing: true
        }
      );
    }
    if (this.throttled_watch[path] == null) throw Error("bug");
    this.throttled_watch[path]();
  }

  private async _watch(path: string): Promise<void> {
    if (await this.wait_until_ready(false)) return;
    this.set({
      path,
      interest: webapp_client.server_time()
    });
  }

  public async get(path: string): Promise<PathEntry[] | undefined> {
    if (this.state != "ready") {
      try {
        const listing = await this.get_using_database(path);
        if (listing != null) {
          return listing;
        }
      } catch (err) {
        // ignore -- e.g., maybe user doesn't have access or db not available.  Fine either way.
      }
    }
    if (this.state != "ready") {
      // State still not ready and nothing in the database.
      // If project is running, try directly getting listing (this is meant
      // for old projects that haven't been restarted since we released the new
      // sync code, but could possibly be a useful fallback in case of other
      // problems).
      const listing = await this.get_listing_directly(path);
      if (listing != null) {
        return listing;
      }
    }

    return this.get_record(path)
      ?.get("listing")
      ?.toJS();
  }

  // Returns:
  //  - List<ImmutablePathEntry> in case of a proper directory listinmg
  //  - string in case of an error
  //  - undefined if directory listing not known (and error not known either).
  public async get_for_store(
    path: string
  ): Promise<List<ImmutablePathEntry> | undefined | string> {
    if (this.state != "ready") {
      const x = await this.get_using_database(path);
      if (x == null) return x;
      return fromJS(x);
    }
    const x = this.get_record(path);
    if (x == null) return x;
    if (x.get("error")) {
      return x.get("error");
    }
    return x.get("listing");
  }

  public async get_using_database(
    path: string
  ): Promise<PathEntry[] | undefined> {
    const q = await query({
      query: {
        listings: {
          project_id: this.project_id,
          path,
          listing: null,
          missing: null
        }
      }
    });
    if (q.query.listings?.error) {
      throw Error(q.query.listings?.error);
    }
    return q.query.listings?.listing;
  }

  public async get_listing_directly(path: string): Promise<PathEntry[]> {
    const store = redux.getStore("projects");
    // make sure that our relationship to this project is known.
    if (store == null) throw Error("bug");
    const group = await store.async_wait({
      until: s => (s as any).get_my_group(this.project_id),
      timeout: 60
    });
    const x = await get_directory_listing({
      project_id: this.project_id,
      path,
      hidden: true,
      max_time_s: 15 * 60,
      group
    });
    if (x.error != null) {
      throw Error(x.error);
    } else {
      return x.files;
    }
  }

  public close(): void {
    this.set_state("closed");
    if (this.table != null) {
      this.table.close();
      delete this.table;
    }
    this.removeAllListeners();
    delete this.last_version;
    delete this.project_id;
    delete this.throttled_watch;
  }

  private async init(): Promise<void> {
    if (this.state != "init") {
      throw Error("must be in init state");
    }
    // Make sure there is a working websocket to the project
    await webapp_client.project_websocket(this.project_id);
    // Now create the table.
    this.table = await webapp_client.synctable_project(
      this.project_id,
      {
        listings: [
          {
            project_id: this.project_id,
            path: null,
            listing: null,
            time: null,
            interest: null,
            missing: null,
            error: null
          }
        ]
      },
      []
    );
    this.table.on("change", async (keys: string[]) => {
      const paths: string[] = [];
      for (const key of keys) {
        const path = JSON.parse(key)[1];
        // Be careful to only emit a change event if the actual listing itself changes.
        // Table emits more frequently, e.g., due to updating watch, time of listing changing, etc.
        const this_version = await this.get_for_store(path);
        if (this_version != this.last_version[path]) {
          this.last_version[path] = this_version;
          paths.push(path);
        }
      }
      if (paths.length > 0) {
        this.emit("change", paths);
      }
    });
    this.set_state("ready");
  }

  private get_table(): SyncTable {
    if (
      this.state != "ready" ||
      this.table == null ||
      this.table.get_state() != "connected"
    ) {
      throw Error("table not initialized ");
    }
    return this.table;
  }

  private set(obj: Listing): void {
    this.get_table().set(merge({ project_id: this.project_id }, obj));
    this.get_table().save();
  }

  private get_record(path: string): ImmutableListing | undefined {
    return this.get_table().get(JSON.stringify([this.project_id, path]));
    // NOTE: That we have to use JSON.stringify above is an ugly shortcoming
    // of the get method in smc-util/sync/table/synctable.ts
    // that could probably be relatively easily fixed.
  }

  private set_state(state: State): void {
    if (this.state == state) return;
    if (this.state == "closed") {
      throw Error("cannot switch away from closed");
    }
    if (this.state == "ready" && state != "closed") {
      throw Error("can only transition from ready to closed");
    }
    this.state = state;
    this.emit("state", state);
  }

  // Returns true if never will be ready
  private async wait_until_ready(exception: boolean = true): Promise<boolean> {
    try {
      if (this.state == "closed") {
        throw Error("Listings object must not be closed");
      }
      if (this.state == "init") {
        await once(this, "state");
        if ((this.state as State) != "ready") {
          throw Error("never will be ready");
        }
        return false;
      }
      return false;
    } catch (err) {
      if (exception) throw err;
      return true;
    }
  }
}

export function listings(project_id: string): Listings {
  return new Listings(project_id);
}
