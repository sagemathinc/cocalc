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
import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";
import { expire_time, is_valid_uuid_string, uuid } from "@cocalc/util/misc";

class Project extends BaseProject {
  constructor(project_id: string) {
    super(project_id);
  }

  private async get(columns: string[]): Promise<{ [field: string]: any }> {
    return await callback2(db().get_project, {
      project_id: this.project_id,
      columns,
    });
  }

  async state(): Promise<ProjectState> {
    return (await this.get(["state"]))?.state ?? {};
  }

  async status(): Promise<ProjectStatus> {
    const status = (await this.get(["status"]))?.status ?? {};
    // In KuCalc the ports for various services are hardcoded constants,
    // and not actually storted in the database, so we put them here.
    // This is also hardcoded in kucalc's addons/project/image/init/init.sh (!)
    status["hub-server.port"] = 6000;
    status["browser-server.port"] = 6001;
    return status;
  }

  async copyPath(opts: CopyOptions): Promise<string> {
    const dbg = this.dbg("copyPath");
    dbg(JSON.stringify(opts));
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
    dbg(`copyID=${copyID}`);

    // expire in 1 month
    const oneMonthSecs = 60 * 60 * 24 * 30;
    let expire: Date = expire_time(oneMonthSecs);

    if (opts.scheduled) {
      // we parse it if it is a string
      if (typeof opts.scheduled === "string") {
        const scheduledTS: number = Date.parse(opts.scheduled);

        if (isNaN(scheduledTS)) {
          throw new Error(
            `opts.scheduled = ${opts.scheduled} is not a valid date. Can't be parsed by Date.parse()`,
          );
        }

        opts.scheduled = new Date(scheduledTS);
      }

      if (opts.scheduled instanceof Date) {
        // We have to remove the timezone info, b/c the PostgreSQL field is without timezone.
        // Ideally though, this is always UTC, e.g. "2019-08-08T18:34:49".
        const d = new Date(opts.scheduled);
        const offset = d.getTimezoneOffset() / 60;
        opts.scheduled = new Date(d.getTime() - offset);
        opts.wait_until_done = false;
        dbg(`opts.scheduled = ${opts.scheduled}`);
        // since scheduled could be in the future, we want to expire it 1 month after that
        expire = new Date(
          Math.max(opts.scheduled.getTime(), Date.now()) + oneMonthSecs * 1000,
        );
      } else {
        throw new Error(
          `opts.scheduled = ${opts.scheduled} is not a valid date.`,
        );
      }
    }

    dbg("write query requesting the copy to happen to the database");

    await callback2(db()._query, {
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
        "exclude           ::TEXT[]": opts.exclude,
        "expire            ::TIMESTAMP": expire,
      },
    });

    if (opts.wait_until_done == true) {
      dbg("waiting for the copy request to complete...");
      await this.waitUntilCopyFinished(copyID, 60 * 4);
      dbg("finished");
      return "";
    } else {
      dbg("NOT waiting for copy to complete");
      return copyID;
    }
  }

  private getCopySynctable(copyID: string): any {
    return db().synctable({
      table: "copy_paths",
      columns: ["started", "error", "finished"],
      where: { "id = $::UUID": copyID },
      where_function: (id) => id == copyID,
    });
  }

  private async waitUntilCopyFinished(
    copyID: string,
    timeout: number, // in seconds
  ): Promise<void> {
    let synctable: any = undefined;
    try {
      synctable = this.getCopySynctable(copyID);
      await callback2(synctable.wait, {
        until: () => synctable.getIn([copyID, "finished"]),
        timeout,
      });
      const err = synctable.getIn([copyID, "error"]);
      if (err) {
        throw Error(err);
      }
    } finally {
      synctable?.close();
    }
  }
}

export default function get(project_id: string): Project {
  return (getProject(project_id) as Project) ?? new Project(project_id);
}
