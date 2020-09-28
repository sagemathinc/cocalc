/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";

import { close } from "../smc-util/misc2";
import { SyncTable } from "../smc-util/sync/table";

class ProjectInfoTable {
  private table: SyncTable;
  private logger: undefined | { debug: Function };
  private project_id: string;
  private state: "ready" | "closed" = "ready";

  constructor(table: SyncTable, logger: any, project_id: string) {
    this.project_id = project_id;
    this.logger = logger;
    this.log("register");
    this.table = table;
    this.table.on("closed", () => this.close());
    this.update_loop();
  }

  private async update_loop(): Promise<void> {
    while (this.state == "ready" && this.table.get_state() != "closed") {
      const info = { hello: "world", date: new Date() };
      this.table.set({ project_id: this.project_id, info });
      try {
        await this.table.save();
      } catch (err) {
        this.log(`error saving ${err}`);
      }
      await delay(3000);
    }
  }

  public close(): void {
    this.log("close");
    this.table?.close_no_async();
    close(this);
    this.state = "closed";
  }

  private log(...args): void {
    if (this.logger == null) return;
    this.logger.debug("listings_table", ...args);
  }
}

let project_info_table: ProjectInfoTable | undefined = undefined;
export function register_project_info_table(
  table: SyncTable,
  logger: any,
  project_id: string
): void {
  logger.debug("register_project_info_table");
  if (project_info_table != null) {
    // There was one sitting around wasting space so clean it up
    // before making a new one.
    project_info_table.close();
  }
  project_info_table = new ProjectInfoTable(table, logger, project_id);
  return;
}

export function get_project_info_table(): ProjectInfoTable | undefined {
  return project_info_table;
}
