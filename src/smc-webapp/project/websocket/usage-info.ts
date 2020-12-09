/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import { delay } from "awaiting";
import { SyncTable } from "smc-util/sync/table";
import { webapp_client } from "../../webapp-client";
import { once } from "smc-util/async-utils";
import { merge } from "smc-util/misc";
import { ImmutableUsageInfo } from "../../../smc-project/usage-info/types";

type State = "init" | "ready" | "closed";

export class UsageInfoWS extends EventEmitter {
  private table?: SyncTable;
  private readonly project_id: string;
  private state: State = "init";
  private readonly last_version: { [path: string]: ImmutableUsageInfo } = {};

  constructor(project_id: string) {
    super();
    this.project_id = project_id;
    this.init();
  }

  public event_key(path: string) {
    return `path::${path}`;
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
        usage_info: [
          {
            project_id: this.project_id,
            path: null,
            usage: null,
          },
        ],
      },
      [{ ephemeral: true }]
    );

    if ((this.state as State) == "closed") return;

    this.table.on("change", async (keys: string[]) => {
      if (this.state != "ready") {
        // don't do anything if being initialized or already closed,
        // since code below will break in weird ways.
        return;
      }
      // emit "real" changes of usage_info to interested parties
      for (const key of keys) {
        const path = JSON.parse(key)[1];
        // Be careful to only emit a change event if the actual
        // usage itself changes.  Table emits more frequently!

        const usage_record = this.get_record(path);
        if (usage_record == null) continue;
        const usage: ImmutableUsageInfo | undefined = usage_record.get("usage");
        //console.log(`UsageInfo table.on.change path='${path}' → usage=`, usage);
        if (usage == null) continue;
        if (usage != this.last_version[path]) {
          this.last_version[path] = usage;
          this.emit(this.event_key(path), usage);
        }
      }
    });
    this.set_state("ready");
  }

  // copied from ./listings.ts
  private async re_init(): Promise<void> {
    this.state = "init";
    await this.init();
  }

  private key(path: string): string {
    return JSON.stringify([this.project_id, path]);
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

  private get_record(path: string): ImmutableUsageInfo | undefined {
    const x = this.get_table().get(this.key(path));
    if (x == null) return x;
    return (x as unknown) as ImmutableUsageInfo; // coercing to fight typescript.
  }

  private async get_table_safe(): Promise<SyncTable> {
    try {
      return this.get_table();
    } catch (err) {
      // See https://github.com/sagemathinc/cocalc/issues/4790
      console.warn("Error getting table -- ", err);
      await this.re_init();
      return this.get_table();
    }
  }

  private async set(obj: { path: string; usage?: any }): Promise<void> {
    const table = await this.get_table_safe();
    table.set(merge({ project_id: this.project_id }, obj), "shallow");
    await table.save();
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

  // we add the path we are interested in
  public async watch(path: string): Promise<void> {
    // console.log(`UsageInfo watching ${this.project_id} / ${path}`);
    if (await this.wait_until_ready(false)) return;
    if (this.state == "closed") return;
    this.set({ path });
  }

  // we remove the project/path key
  public async disregard(path: string): Promise<void> {
    // console.log(`UsageInfo disregarding ${this.project_id} / ${path}`);
    if (this.state == "closed") return;
    const table = await this.get_table_safe();
    const data = table.get();
    if (data == null) return;
    table.set(data.delete(this.key(path)), "none");
    await table.save();
  }

  // Returns true if never will be ready
  private async wait_until_ready(exception: boolean = true): Promise<boolean> {
    try {
      if (this.state == "closed") {
        throw Error("UsageInfoWS object must not be closed");
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

// for each project, there is one instance
const usage_infos: { [project_id: string]: UsageInfoWS } = {};

export function get_usage_info(project_id: string): UsageInfoWS {
  if (usage_infos[project_id] != null) {
    return usage_infos[project_id];
  } else {
    return (usage_infos[project_id] = new UsageInfoWS(project_id));
  }
}
