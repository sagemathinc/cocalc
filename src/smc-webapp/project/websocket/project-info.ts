/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
SyncTable of project information about a project.

Use this via

   webapp_client.project_client.project_info(project_id)

*/

import { EventEmitter } from "events";
import { fromJS, Map } from "immutable";
import { SyncTable } from "smc-util/sync/table";
import { delay } from "awaiting";
import { close } from "smc-util/misc2";
import { WebappClient } from "../../webapp-client";

type State = "init" | "ready" | "closed";
type Info = Map<string, any>;

export class ProjectInfo extends EventEmitter {
  private table?: SyncTable;
  private project_id: string;
  private state: State = "init";
  private client: WebappClient;

  constructor(client: WebappClient, project_id: string) {
    super();
    this.client = client;
    this.project_id = project_id;
    this.init();
  }

  public get(): Info | undefined {
    if (this.state != "ready") {
      return;
    }
    const info = this.get_table()?.get(this.project_id)?.get("info");
    if (info == null) return;
    return (info as never) as Info;
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

  private async init(): Promise<void> {
    if (this.state != "init") {
      throw Error("must be in init state");
    }
    // Make sure there is a working websocket to the project
    while (true) {
      try {
        await this.client.project_client.websocket(this.project_id);
        break;
      } catch (_) {
        if (this.state == ("closed" as State)) return;
        await delay(3000);
      }
    }
    if ((this.state as State) == "closed") return;

    // Now create the table.
    this.table = await this.client.sync_client.synctable_project(
      this.project_id,
      {
        project_info: [
          {
            project_id: this.project_id,
            info: null,
          },
        ],
      },
      [{ ephemeral: true }]
    );

    if ((this.state as State) == "closed") return;

    this.table.on("change", (_: string[]) => {
      this.emit("change");
    });
    this.set_state("ready");
  }

  // This is used to possibly work around a rare bug.
  // https://github.com/sagemathinc/cocalc/issues/4790
  private async re_init(): Promise<void> {
    this.state = "init";
    await this.init();
  }

  private get_table(): SyncTable {
    // TODO:  some duplication with Listings -- would be nice to refactor (?).
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

  public async set(info: Info | object): Promise<void> {
    if (!Map.isMap(info)) {
      info = fromJS(info);
    }
    let table;
    try {
      table = this.get_table();
    } catch (err) {
      // See https://github.com/sagemathinc/cocalc/issues/4790
      console.warn("Error getting table -- ", err);
      await this.re_init();
      table = this.get_table();
    }
    table.set({ project_id: this.project_id, info }, "shallow");
    await table.save();
  }

  public is_ready(): boolean {
    return this.state == ("ready" as State);
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
    if (state === "ready") {
      this.emit("ready");
    }
  }
}

export function project_info(client, project_id: string): ProjectInfo {
  return new ProjectInfo(client, project_id);
}
