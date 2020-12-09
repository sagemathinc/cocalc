/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import { List, fromJS } from "immutable";
import { throttle } from "lodash";
import { delay } from "awaiting";
import { SyncTable } from "smc-util/sync/table";
import { webapp_client } from "../../webapp-client";
import { redux, TypedMap } from "../../app-framework";
import { close, merge, path_split } from "smc-util/misc";
import { once } from "smc-util/async-utils";
import { deleted_file_variations } from "smc-util/delete-files";
import { exec, query } from "../../frame-editors/generic/client";
import { get_directory_listing } from "../directory-listing";
import { DirectoryListingEntry, DirectoryListing } from "smc-util/types";
import { WATCH_TIMEOUT_MS } from "smc-util/db-schema/listings";
export const WATCH_THROTTLE_MS = WATCH_TIMEOUT_MS / 2;

type ImmutablePathEntry = TypedMap<DirectoryListingEntry>;

type State = "init" | "ready" | "closed";

interface Listing {
  path: string;
  project_id?: string;
  listing?: List<ImmutablePathEntry>;
  time?: Date;
  interest?: Date;
  missing?: number;
  error?: string;
  deleted?: string[];
  git_dir?: string;
}

export type ImmutableListing = TypedMap<Listing>;

export class Listings extends EventEmitter {
  private table?: SyncTable;
  private project_id: string;
  private last_version: { [path: string]: any } = {}; // last version emitted via change event.
  private last_deleted: { [path: string]: any } = {};
  private state: State = "init";
  private throttled_watch: { [path: string]: Function } = {};

  constructor(project_id: string) {
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
  public async watch(path: string, force: boolean = false): Promise<void> {
    if (force) {
      await this._watch(path);
      return;
    }
    if (this.throttled_watch[path] == null) {
      this.throttled_watch[path] = throttle(
        () => this._watch(path),
        WATCH_THROTTLE_MS,
        {
          leading: true,
          trailing: true,
        }
      );
    }
    if (this.throttled_watch[path] == null) throw Error("bug");
    this.throttled_watch[path]();
  }

  private async _watch(path: string): Promise<void> {
    if (await this.wait_until_ready(false)) return;
    if (this.state == "closed") return;
    this.set({
      path,
      interest: webapp_client.server_time(),
    });
  }

  public async get(path: string): Promise<DirectoryListing | undefined> {
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

    const x = this.get_record(path);
    if (x == null || x.get("error")) return;
    return { files: x.get("listing")?.toJS(), git_dir: x.get("git_dir") };
  }

  public async get_deleted(path: string): Promise<List<string> | undefined> {
    if (this.state == "closed") return;
    if (this.state != "ready") {
      const q = await query({
        query: {
          listings: {
            project_id: this.project_id,
            path,
            deleted: null,
          },
        },
      });
      if (q.query.listings?.error) {
        throw Error(q.query.listings?.error);
      }
      if (q.query.listings?.deleted != null) {
        return fromJS(q.query.listings.deleted);
      } else {
        return;
      }
    }
    if (this.state == ("closed" as State)) return;
    if (this.state != ("ready" as State)) {
      await once(this, "state");
      if (this.state != ("ready" as State)) return;
    }
    return this.get_record(path)?.get("deleted");
  }

  public async undelete(path: string): Promise<void> {
    if (path == "") return;
    if (this.state == ("closed" as State)) return;
    if (this.state != ("ready" as State)) {
      await once(this, "state");
      if (this.state != ("ready" as State)) return;
    }

    // Check is_deleted, so we can assume that path definitely
    // is deleted according to our rules.
    if (!this.is_deleted(path)) {
      return;
    }

    const { head, tail } = path_split(path);
    if (head != "") {
      // make sure the containing directory exists.
      await exec({
        project_id: this.project_id,
        command: "mkdir",
        args: ["-p", head],
      });
    }
    const cur = this.get_record(head);
    if (cur == null) {
      // undeleting a file that was maybe deleted as part of a directory tree.
      // NOTE: If you undelete *one* file from directory tree, then
      // creating any other file in that tree will just work.  This is
      // **by design** to keep things from getting too complicated!
      await this.undelete(head);
      return;
    }
    let deleted = cur.get("deleted");
    if (deleted == null || deleted.indexOf(tail) == -1) {
      await this.undelete(head);
      return;
    }
    const remove = new Set([tail].concat(deleted_file_variations(tail)));
    deleted = deleted.filter((x) => !remove.has(x));
    await this.set({ path: head, deleted: deleted.toJS() });
  }

  // true or false if known deleted or not; undefined if don't know yet.
  // TODO: technically we should check the all the
  // deleted_file_variations... but that is really an edge case
  // that probably doesn't matter much.
  public is_deleted(filename: string): boolean | undefined {
    const { head, tail } = path_split(filename);
    if (head != "" && this.is_deleted(head)) {
      // recursively check if filename is contained in a
      // directory tree that go deleted.
      return true;
    }
    let x;
    try {
      x = this.get_record(head);
    } catch (err) {
      return undefined;
    }
    if (x == null) return false;
    const deleted = x.get("deleted");
    if (deleted == null) return false;
    return deleted.indexOf(tail) != -1;
  }

  // Returns:
  //  - List<ImmutablePathEntry> in case of a proper directory listing
  //  - string in case of an error
  //  - undefined if directory listing not known (and error not known either).
  public async get_for_store(
    path: string
  ): Promise<
    { git_dir?: string; files?: List<ImmutablePathEntry> } | undefined | string
  > {
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
    return { files: x.get("listing"), git_dir: x.get("git_dir") };
  }

  public async get_using_database(
    path: string
  ): Promise<DirectoryListing | undefined> {
    const q = await query({
      query: {
        listings: {
          project_id: this.project_id,
          path,
          listing: null,
          git_dir: null,
        },
      },
    });
    if (q.query.listings?.error) {
      throw Error(q.query.listings?.error);
    }
    return {
      files: q.query.listings?.listing,
      git_dir: q.query.listings?.git_dir,
    };
  }

  public get_missing(path: string): number | undefined {
    if (this.state != "ready") return;
    return this.get_table()
      .get(JSON.stringify([this.project_id, path]))
      ?.get("missing");
  }

  public async get_listing_directly(path: string): Promise<DirectoryListing> {
    const store = redux.getStore("projects");
    // make sure that our relationship to this project is known.
    if (store == null) throw Error("bug");
    const group = await store.async_wait({
      until: (s) => (s as any).get_my_group(this.project_id),
      timeout: 60,
    });
    const x = await get_directory_listing({
      project_id: this.project_id,
      path,
      hidden: true,
      max_time_s: 15 * 60,
      group,
    });
    if (x.error != null) {
      throw Error(x.error);
    } else {
      return { files: x.files, git_dir: x.git_dir };
    }
  }

  public close(): void {
    this.set_state("closed");
    if (this.table != null) {
      this.table.close();
    }
    this.removeAllListeners();
    close(this);
    this.set_state("closed");
  }

  // This is used to possibly work around a rare bug.
  // https://github.com/sagemathinc/cocalc/issues/4790
  private async re_init(): Promise<void> {
    this.state = "init";
    await this.init();
  }

  private async init(): Promise<void> {
    if (this.state != "init") {
      throw Error("must be in init state");
    }
    // Make sure there is a working websocket to the project
    while (true) {
      try {
        await webapp_client.project_client.websocket(this.project_id);
        break;
      } catch (_) {
        if (this.state == ("closed" as State)) return;
        await delay(3000);
      }
    }
    if ((this.state as State) == "closed") return;

    // Now create the table.
    this.table = await webapp_client.sync_client.synctable_project(
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
            error: null,
            deleted: null,
          },
        ],
      },
      []
    );

    if ((this.state as State) == "closed") return;

    this.table.on("change", async (keys: string[]) => {
      if (this.state != "ready") {
        // don't do anything if being initialized or already closed,
        // since code below will break in weird ways.
        return;
      }
      // handle changes to directory listings and deleted files lists
      const paths: string[] = [];
      const deleted_paths: string[] = [];
      for (const key of keys) {
        const path = JSON.parse(key)[1];
        // Be careful to only emit a change event if the actual
        // listing itself changes.  Table emits more frequently,
        // e.g., due to updating watch, time of listing changing, etc.
        const this_version = await this.get_for_store(path);
        if (this_version != this.last_version[path]) {
          this.last_version[path] = this_version;
          paths.push(path);
        }

        const this_deleted = this.get_record(path)?.get("deleted");
        if (this_deleted != this.last_deleted[path]) {
          if (
            this_deleted != null &&
            !this_deleted.equals(this.last_deleted[path])
          ) {
            deleted_paths.push(path);
          }

          this.last_deleted[path] = this_deleted;
        }
      }
      if (paths.length > 0) {
        this.emit("change", paths);
      }

      if (deleted_paths.length > 0) {
        this.emit("deleted", deleted_paths);
      }
    });
    this.set_state("ready");
  }

  private get_table(): SyncTable {
    if (this.state != "ready") {
      throw Error("table not initialized ");
    }
    if (this.table == null) {
      throw Error("table is null");
    }
    if (this.table.get_state() == "closed") {
      throw Error("table is closed");
    }
    return this.table;
  }

  private async set(obj: Listing): Promise<void> {
    let table;
    try {
      table = this.get_table();
    } catch (err) {
      // See https://github.com/sagemathinc/cocalc/issues/4790
      console.warn("Error getting table -- ", err);
      await this.re_init();
      table = this.get_table();
    }
    table.set(merge({ project_id: this.project_id }, obj), "shallow");
    await table.save();
  }

  public is_ready(): boolean {
    return this.state == ("ready" as State);
  }

  private get_record(path: string): ImmutableListing | undefined {
    const x = this.get_table().get(JSON.stringify([this.project_id, path]));
    if (x == null) return x;
    return (x as unknown) as ImmutableListing; // coercing to fight typescript.
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
