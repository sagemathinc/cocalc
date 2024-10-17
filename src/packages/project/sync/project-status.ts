/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { close } from "@cocalc/util/misc";
import { SyncTable } from "@cocalc/sync/table";
import {
  get_ProjectStatusServer,
  ProjectStatusServer,
} from "../project-status";
import type { ProjectStatus } from "@cocalc/comm/project-status/types";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("project:project-status");

class ProjectStatusTable {
  private table: SyncTable;
  private project_id: string;
  private state: "ready" | "closed" = "ready";
  private readonly publish: (status: ProjectStatus) => Promise<void>;
  private readonly status_server: ProjectStatusServer;

  constructor(table: SyncTable, project_id: string) {
    this.status_handler = this.status_handler.bind(this);
    this.project_id = project_id;
    logger.debug("register");
    this.publish = reuseInFlight(this.publish_impl.bind(this));
    this.table = table;
    this.table.on("closed", () => this.close());
    // initializing project status server + reacting when it has something to say
    this.status_server = get_ProjectStatusServer();
    this.status_server.start();
    this.status_server.on("status", this.status_handler);
  }

  private status_handler(status): void {
    logger.debug("status_server event 'status'", status.timestamp);
    this.publish?.(status);
  }

  private async publish_impl(status: ProjectStatus): Promise<void> {
    if (this.state == "ready" && this.table.get_state() != "closed") {
      const next = { project_id: this.project_id, status };
      this.table.set(next, "shallow");
      try {
        await this.table.save();
      } catch (err) {
        logger.debug(`error saving ${err}`);
      }
    } else {
      logger.debug(
        `ProjectStatusTable '${
          this.state
        }' and table is ${this.table?.get_state()}`,
      );
    }
  }

  public close(): void {
    logger.debug("close");
    this.status_server?.off("status", this.status_handler);
    this.table?.close_no_async();
    close(this);
    this.state = "closed";
  }
}

let project_status_table: ProjectStatusTable | undefined = undefined;

export function register_project_status_table(
  table: SyncTable,
  project_id: string,
): void {
  logger.debug("register_project_status_table");
  if (project_status_table != null) {
    logger.debug(
      "register_project_status_table: cleaning up an already existing one",
    );
    project_status_table.close();
  }
  project_status_table = new ProjectStatusTable(table, project_id);
}

export function get_project_status_table(): ProjectStatusTable | undefined {
  return project_status_table;
}
