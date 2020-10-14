/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// import { delay } from "awaiting";
import { reuseInFlight } from "async-await-utils/hof";
import { close } from "../smc-util/misc2";
import { SyncTable } from "../smc-util/sync/table";
import { get_ProjectInfoServer } from "../project-info";
import { ProjectInfo } from "../project-info/types";
import { ProjectInfoServer } from "../project-info";

class ProjectInfoTable {
  private table: SyncTable;
  private logger: { debug: Function };
  private project_id: string;
  private state: "ready" | "closed" = "ready";
  private readonly publish: (info: ProjectInfo) => Promise<void>;
  private readonly info_server: ProjectInfoServer;

  constructor(
    table: SyncTable,
    logger: { debug: Function },
    project_id: string
  ) {
    this.project_id = project_id;
    this.logger = logger;
    this.log("register");
    this.publish = reuseInFlight(this.publish_impl);
    this.table = table;
    this.table.on("closed", () => this.close());
    // initializing project info server + reacting when it has something to say
    this.info_server = get_ProjectInfoServer(this.logger.debug.bind(this));
    this.info_server.start();
    this.info_server.on("info", (info) => {
      //this.log?.("info_server event 'info'", info.timestamp);
      this.publish?.(info);
    });
  }

  private async publish_impl(info: ProjectInfo): Promise<void> {
    if (this.state == "ready" && this.table.get_state() != "closed") {
      const next = { project_id: this.project_id, info };
      this.table.set(next, "shallow");
      try {
        await this.table.save();
      } catch (err) {
        this.log(`error saving ${err}`);
      }
    } else {
      this.log(
        `ProjectInfoTable ${this.state} and table is ${this.table.get_state()}`
      );
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
    this.logger.debug("project_info", ...args);
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
