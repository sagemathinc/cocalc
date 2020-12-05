/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { reuseInFlight } from "async-await-utils/hof";
import { close } from "../smc-util/misc";
import { SyncTable } from "../smc-util/sync/table";
import {
  get_ProjectStatusServer,
  ProjectStatusServer,
} from "../project-status";
import { ProjectStatus } from "../project-status/types";

class ProjectStatusTable {
  private table: SyncTable;
  private logger: { debug: Function };
  private project_id: string;
  private state: "ready" | "closed" = "ready";
  private readonly publish: (status: ProjectStatus) => Promise<void>;
  private readonly status_server: ProjectStatusServer;

  constructor(
    table: SyncTable,
    logger: { debug: Function },
    project_id: string
  ) {
    this.status_handler = this.status_handler.bind(this);
    this.project_id = project_id;
    this.logger = logger;
    this.log("register");
    this.publish = reuseInFlight(this.publish_impl);
    this.table = table;
    this.table.on("closed", () => this.close());
    // initializing project status server + reacting when it has something to say
    this.status_server = get_ProjectStatusServer(this.logger.debug.bind(this));
    this.status_server.start();
    this.status_server.on("status", this.status_handler);
  }

  private status_handler(status): void {
    this.log?.("status_server event 'status'", status.timestamp);
    this.publish?.(status);
  }

  private async publish_impl(status: ProjectStatus): Promise<void> {
    if (this.state == "ready" && this.table.get_state() != "closed") {
      const next = { project_id: this.project_id, status };
      this.table.set(next, "shallow");
      try {
        await this.table.save();
      } catch (err) {
        this.log(`error saving ${err}`);
      }
    } else if (this.log != null) {
      this.log(
        `ProjectStatusTable '${
          this.state
        }' and table is ${this.table?.get_state()}`
      );
    }
  }

  public close(): void {
    this.log("close");
    this.status_server.off("status", this.status_handler);
    this.table?.close_no_async();
    close(this);
    this.state = "closed";
  }

  private log(...args): void {
    if (this.logger == null) return;
    this.logger.debug("project_status", ...args);
  }
}

let project_status_table: ProjectStatusTable | undefined = undefined;

export function register_project_status_table(
  table: SyncTable,
  logger: any,
  project_id: string
): void {
  logger.debug("register_project_status_table");
  if (project_status_table != null) {
    logger.debug(
      "register_project_status_table: cleaning up an already existing one"
    );
    project_status_table.close();
  }
  project_status_table = new ProjectStatusTable(table, logger, project_id);
}

export function get_project_status_table(): ProjectStatusTable | undefined {
  return project_status_table;
}
