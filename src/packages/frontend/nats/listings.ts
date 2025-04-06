/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { TypedMap, redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Listing } from "@cocalc/util/db-schema/listings";
import type { DirectoryListingEntry } from "@cocalc/util/types";
import { EventEmitter } from "events";
import { fromJS, List } from "immutable";
import {
  listingsClient,
  type ListingsClient,
  createListingsApiClient,
  type ListingsApi,
  MIN_INTEREST_INTERVAL_MS,
} from "@cocalc/nats/service/listings";
import { delay } from "awaiting";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

export const WATCH_THROTTLE_MS = MIN_INTEREST_INTERVAL_MS;

type ImmutablePathEntry = TypedMap<DirectoryListingEntry>;

type State = "init" | "ready" | "closed";

export type ImmutableListing = TypedMap<Listing>;

export class Listings extends EventEmitter {
  private project_id: string;
  private compute_server_id: number;
  private state: State = "init";
  private listingsClient?: ListingsClient;
  private api: ListingsApi;

  constructor(project_id: string, compute_server_id: number = 0) {
    super();
    this.project_id = project_id;
    this.compute_server_id = compute_server_id;
    this.api = createListingsApiClient({ project_id, compute_server_id });
    this.init();
  }

  private createClient = async () => {
    await webapp_client.nats_client.addProjectPermissions([this.project_id]);
    let d = 3000;
    const MAX_DELAY_MS = 15000;
    while (this.state != "closed") {
      try {
        this.listingsClient = await listingsClient({
          project_id: this.project_id,
          compute_server_id: this.compute_server_id,
        });
        // success!
        return;
      } catch (err) {
        console.log(
          "WARNING: issue connecting to project listings service",
          err,
        );
      }
      if (this.state == ("closed" as State)) return;
      d = Math.min(MAX_DELAY_MS, d * 1.3);
      await delay(d);
    }
  };

  private init = reuseInFlight(async () => {
    //let start = Date.now();
    await this.createClient();
    // console.log("createClient finished in ", Date.now() - start, "ms");
    if (this.state == "closed") return;
    if (this.listingsClient == null) {
      throw Error("bug");
    }
    this.listingsClient.on("change", (path) => {
      this.emit("change", [path]);
    });
    // cause load of all cached data into redux
    this.emit("change", Object.keys(this.listingsClient.getAll()));
    // [ ] TODO: delete event for deleted paths
    this.setState("ready");
  });

  // Watch directory for changes.
  watch = async (path: string, force?): Promise<void> => {
    if (this.state == "closed") {
      return;
    }
    if (this.state != "ready") {
      await this.init();
    }
    if (this.state != "ready") {
      // failed forever or closed explicitly so don't care
      return;
    }
    if (this.listingsClient == null) {
      throw Error("listings not ready");
    }
    if (this.listingsClient == null) return;
    try {
      await this.listingsClient.watch(path, force);
    } catch (err) {
      try {
        if (err.code == "503") {
          if (this.listingsClient == null) return;
          // The listings service isn't running in the project right now,
          // e.g., maybe the project isn't running at all.
          // So watch is a no-op, as it does nothing when listing
          // server doesn't exist.  So we at least wait for a while
          // e.g., maybe project is starting, then try once more.
          await this.listingsClient.api.nats.waitFor({
            maxWait: 15 * 1000 * 60,
          });
          if (this.listingsClient == null) return;
          try {
            await this.listingsClient.watch(path, force);
          } catch (err) {
            if (err.code != "503") {
              throw err;
            }
          }
        } else {
          throw err;
        }
      } catch (err) {
        console.log("WARNING: unable to update directory listing watcher", err);
      }
    }
  };

  get = async (
    path: string,
    trigger_start_project?: boolean,
  ): Promise<DirectoryListingEntry[] | undefined> => {
    if (this.listingsClient == null) {
      throw Error("listings not ready");
    }
    const x = this.listingsClient?.get(path);
    if (x != null) {
      if (x.error) {
        throw Error(x.error);
      }
      if (!x.exists) {
        throw Error(`ENOENT: no such directory '${path}'`);
      }
      return x.files;
    }
    if (trigger_start_project) {
      if (
        !(await redux.getActions("projects").start_project(this.project_id))
      ) {
        return;
      }
    }
    return await this.api.getListing({ path, hidden: true });
  };

  // Does a call to the project to directly determine whether or
  // not the given path exists.  This doesn't depend on the table.
  // Can throw an exception if it can't contact the project.
  exists = async (path: string): Promise<boolean> => {
    return (
      (
        await webapp_client.exec({
          project_id: this.project_id,
          command: "test",
          args: ["-e", path],
          err_on_exit: false,
        })
      ).exit_code == 0
    );
  };

  // Returns:
  //  - List<ImmutablePathEntry> in case of a proper directory listing
  //  - string in case of an error
  //  - undefined if directory listing not known (and error not known either).
  getForStore = async (
    path: string,
  ): Promise<List<ImmutablePathEntry> | undefined | string> => {
    try {
      const x = await this.get(path);
      return fromJS(x) as unknown as List<ImmutablePathEntry>;
    } catch (err) {
      return `${err}`;
    }
  };

  getUsingDatabase = async (
    path: string,
  ): Promise<DirectoryListingEntry[] | undefined> => {
    if (this.listingsClient == null) {
      throw Error("listings not ready");
    }
    return this.listingsClient.get(path)?.files;
  };

  // TODO: we now only know there are more, not how many
  getMissingUsingDatabase = async (
    path: string,
  ): Promise<number | undefined> => {
    if (this.listingsClient == null) {
      throw Error("listings not ready");
    }
    return this.listingsClient.get(path)?.more ? 1 : 0;
  };

  getMissing = (path: string): number | undefined => {
    if (this.listingsClient == null) {
      throw Error("listings not ready");
    }
    return this.listingsClient.get(path)?.more ? 1 : 0;
  };

  getListingDirectly = async (
    path: string,
    trigger_start_project?: boolean,
  ): Promise<DirectoryListingEntry[]> => {
    // console.trace("getListingDirectly", { path });
    if (trigger_start_project) {
      if (
        !(await redux.getActions("projects").start_project(this.project_id))
      ) {
        throw Error("project not running");
      }
    }
    return await this.api.getListing({ path, hidden: true });
  };

  close = (): void => {
    if (this.state == "closed") {
      return;
    }
    this.setState("closed");
    this.listingsClient?.close();
    delete this.listingsClient;
  };

  isReady = (): boolean => {
    return this.state == ("ready" as State);
  };

  setState = (state: State) => {
    this.state = state;
    this.emit(state);
  };
}

export function listings(
  project_id: string,
  compute_server_id: number = 0,
): Listings {
  return new Listings(project_id, compute_server_id);
}
