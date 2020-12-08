/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// usage info for a specific file path, derived from the more general project info,
// which includes all processes and other stats

import * as debug from "debug";
const L = debug("project:sync:usage-info");
import { once } from "../smc-util/async-utils";
import { SyncTable, SyncTableState } from "../smc-util/sync/table";
import { close, merge } from "../smc-util/misc";
import { UsageInfoServer } from "../usage-info";
import { UsageInfo, ImmutableUsageInfo } from "../usage-info/types";

class UsageInfoTable {
  private readonly table: SyncTable;
  private readonly project_id: string;
  private readonly servers: { [path: string]: UsageInfoServer } = {};
  private readonly log: Function;

  constructor(table: SyncTable, project_id: string) {
    this.project_id = project_id;
    this.log = L.extend("table");
    this.table = table;
    this.setup_watchers();
  }

  public close(): void {
    this.log("close");
    for (const path in this.servers) {
      this.stop_server(path);
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
      if (this.servers[path] == null) return; // already watching
    });
    this.log("setting up 'on.change'");
    this.table.on("change", this.handle_change_event.bind(this));
  }

  private async remove_stale_servers(): Promise<void> {
    if (this.table == null) return; // closed
    if (this.table.get_state() != ("connected" as SyncTableState)) return;
    const paths: string[] = [];
    this.table.get()?.forEach((val) => {
      const path = val.get("path");
      if (path == null) return;
      paths.push(path);
    });
    for (const path of Object.keys(this.servers)) {
      if (!paths.includes(path)) {
        this.stop_server(path);
      }
    }
  }

  private is_ready(): boolean {
    return this.table?.is_ready();
  }

  private get_table(): SyncTable {
    if (!this.is_ready()) {
      throw Error("table not ready");
    }
    return this.table;
  }

  async set(obj: { path: string; usage?: UsageInfo }): Promise<void> {
    this.get_table().set(
      merge({ project_id: this.project_id }, obj),
      "shallow"
    );
    await this.get_table().save();
  }

  public get(path: string): ImmutableUsageInfo | undefined {
    const x = this.get_table().get(JSON.stringify([this.project_id, path]));
    if (x == null) return x;
    return (x as unknown) as ImmutableUsageInfo;
    // NOTE: That we have to use JSON.stringify above is an ugly shortcoming
    // of the get method in smc-util/sync/table/synctable.ts
    // that could probably be relatively easily fixed.
  }

  private handle_change_event(keys: string[]): void {
    // this.log("handle_change_event", JSON.stringify(keys));
    for (const key of keys) {
      this.handle_change(JSON.parse(key)[1]);
    }
    this.remove_stale_servers();
  }

  private handle_change(path: string): void {
    this.log("handle_change", path);
    const cur = this.get(path);
    if (cur == null) return;
    // Make sure we watch this path for updates, since there is genuine current interest.
    this.ensure_watching(path);
    this.set({ path });
    return;
  }

  private ensure_watching(path: string): void {
    if (this.servers[path] != null) {
      // We are already watching this path, so nothing more to do.
      return;
    }

    try {
      this.start_watching(path);
    } catch (err) {
      this.log("failed to start watching", err);
    }
    return;
  }

  private start_watching(path: string): void {
    this.log(`start_watching ${path}`);
    if (this.servers[path] != null) return;
    const server = new UsageInfoServer(path);

    server.on("usage", (usage: UsageInfo) => {
      // this.log(`watching/usage:`, usage);
      try {
        if (!this.is_ready()) return;
        this.set({ path, usage });
      } catch (err) {
        this.log(`compute_listing("${path}") error: "${err}"`);
      }
    });

    server.start();

    this.servers[path] = server;
  }

  private stop_server(path: string): void {
    const s = this.servers[path];
    if (s == null) return;
    delete this.servers[path];
    s.stop();
    this.remove_path(path);
  }

  private async remove_path(path: string): Promise<void> {
    if (!this.is_ready()) return;
    this.log("remove_path", path);
    await this.get_table().delete({ project_id: this.project_id, path });
  }
}

let usage_info_table: UsageInfoTable | undefined = undefined;
export function register_usage_info_table(
  table: SyncTable,
  project_id: string
): void {
  L("register_usage_info_table");
  if (usage_info_table != null) {
    // There was one sitting around wasting space so clean it up
    // before making a new one.
    usage_info_table.close();
  }
  usage_info_table = new UsageInfoTable(table, project_id);
}

export function get_usage_info_table(): UsageInfoTable | undefined {
  return usage_info_table;
}
