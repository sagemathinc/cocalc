/*
Compute client for use in Kubernetes cluster by the hub.

This **modifies the database** to get "something out there (manage-actions) to"
start and stop the project, copy files between projects, etc.
*/

import {
  BaseProject,
  CopyOptions,
  ProjectStatus,
  ProjectState,
  getProject,
} from "./base";
import { database } from "smc-hub/servers/database";
import { callback2 } from "smc-util/async-utils";
import { is_valid_uuid_string, uuid } from "smc-util/misc";

import getLogger from "smc-hub/logger";
const winston = getLogger("project-control-kucalc");

class Project extends BaseProject {
  constructor(project_id: string) {
    super(project_id);
  }

  private async get(columns: string[]): Promise<{ [field: string]: any }> {
    return await callback2(database.get_project, {
      project_id: this.project_id,
      columns,
    });
  }

  async state(): Promise<ProjectState> {
    return (await this.get(["state"])).state;
  }

  async status(): Promise<ProjectStatus> {
    return (await this.get(["status"])).status;
  }

  async start(): Promise<void> {
    if (this.stateChanging != null) return;
    winston.info(`start ${this.project_id}`);

    if ((await this.state()).state == "running") {
      winston.debug("start -- already running");
      return;
    }
    try {
      this.stateChanging = { state: "starting" };
      await this.siteLicenseHook();
      await this.actionRequest("start");
      await this.waitUntilProject(
        (project) =>
          project.state == "running" || project.action_request?.finished,
        120
      );
    } finally {
      this.stateChanging = undefined;
    }
  }

  async stop(): Promise<void> {
    if (this.stateChanging != null) return;
    winston.info("stop ", this.project_id);
    if ((await this.state()).state != "running") {
      return;
    }
    try {
      this.stateChanging = { state: "stopping" };
      await this.actionRequest("stop");
      await this.waitUntilProject(
        (project) =>
          (project.state != null &&
            project.state != "running" &&
            project.state != "stopping") ||
          project.action_request?.finished,
        60
      );
    } finally {
      this.stateChanging = undefined;
    }
  }

  async copyPath(opts: CopyOptions): Promise<string> {
    winston.debug("copyPath ", this.project_id, opts);
    if (opts.path == null) {
      throw Error("path must be specified");
    }
    opts.target_project_id = opts.target_project_id
      ? opts.target_project_id
      : this.project_id;
    opts.target_path = opts.target_path ? opts.target_path : opts.path;

    // check UUID are valid
    if (!is_valid_uuid_string(opts.target_project_id)) {
      throw Error(`target_project_id=${opts.target_project_id} is invalid`);
    }

    const copyID = uuid();
    const dbg = this.dbg(`copyPath('${opts.path}', id='${copyID}')`);

    if (opts.scheduled && opts.scheduled instanceof Date) {
      // We have to remove the timezone info, b/c the PostgreSQL field is without timezone.
      // Ideally though, this is always UTC, e.g. "2019-08-08T18:34:49".
      const d = new Date(opts.scheduled);
      const offset = d.getTimezoneOffset() / 60;
      opts.scheduled = new Date(d.getTime() - offset);
      opts.wait_until_done = false;
      dbg(`opts.scheduled = ${opts.scheduled}`);
    }

    dbg("write query requesting the copy to happen to the database");
    await callback2(database._query, {
      query: "INSERT INTO copy_paths",
      values: {
        "id                ::UUID": copyID,
        "time              ::TIMESTAMP": new Date(),
        "source_project_id ::UUID": this.project_id,
        "source_path       ::TEXT": opts.path,
        "target_project_id ::UUID": opts.target_project_id,
        "target_path       ::TEXT": opts.target_path,
        "overwrite_newer   ::BOOLEAN": opts.overwrite_newer,
        "public            ::BOOLEAN": opts.public,
        "delete_missing    ::BOOLEAN": opts.delete_missing,
        "backup            ::BOOLEAN": opts.backup,
        "bwlimit           ::TEXT": opts.bwlimit,
        "timeout           ::NUMERIC": opts.timeout,
        "scheduled         ::TIMESTAMP": opts.scheduled,
      },
    });

    if (opts.wait_until_done == true) {
      dbg("waiting for the copy request to complete...");
      await this.waitUntilCopyFinished(copyID, 60 * 4);
      dbg("finished");
      return "";
    } else {
      return copyID;
    }
  }

  private getProjectSynctable(): any {
    // this is all in coffeescript, hence the any type above.
    return database.synctable({
      table: "projects",
      columns: ["state", "action_request"],
      where: { "project_id = $::UUID": this.project_id },
      // where_function is a fast easy test for matching:
      where_function: (project_id) => project_id == this.project_id,
    });
  }

  private async actionRequest(action: "start" | "stop"): Promise<void> {
    await callback2(database._query, {
      query: "UPDATE projects",
      where: { "project_id  = $::UUID": this.project_id },
      jsonb_set: {
        action_request: {
          action,
          time: new Date(),
          started: undefined,
          finished: undefined,
        },
      },
    });
  }

  private async waitUntilProject(
    until: (obj) => boolean,
    timeout: number // in seconds
  ): Promise<void> {
    let synctable: any = undefined;
    try {
      synctable = this.getProjectSynctable();
      await callback2(synctable.wait, {
        until: () => until(synctable.get(this.project_id)?.toJS() ?? {}),
        timeout,
      });
    } finally {
      synctable?.close();
    }
  }

  private getCopySynctable(): any {
    return database.synctable({
      table: "copy_paths",
      columns: ["id", "started", "error", "finished"],
      where: { "time > $::TIMESTAMP": new Date() },
      where_function: () => true,
    });
  }

  private async waitUntilCopyFinished(
    copy_id: string,
    timeout: number // in seconds
  ): Promise<void> {
    let synctable: any = undefined;
    try {
      synctable = this.getCopySynctable();
      await callback2(synctable.wait, {
        until: () => synctable.getIn([copy_id, "finished"]),
        timeout,
      });
      const err = synctable.getIn([copy_id, "error"]);
      if (err) {
        throw Error(err);
      }
    } finally {
      synctable?.close();
    }
  }
}

export default async function get(project_id: string): Promise<Project> {
  const P: Project =
    (getProject(project_id) as Project) ?? new Project(project_id);
  await P.waitUntilReady();
  return P;
}
