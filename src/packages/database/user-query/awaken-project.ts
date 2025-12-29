/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Project awakening logic - ensures a project is started when needed
 *
 * This throttles project start requests to at most once every 30 seconds per project.
 */

import * as async from "async";

import type { CB } from "@cocalc/util/types/callback";
import type { PostgreSQL } from "../postgres/types";

// Throttle tracking: maps project_id → last awaken time
const lastAwakenTime: Record<string, Date> = {};

/**
 * Awaken (start) a project if it hasn't been awakened recently
 *
 * This is throttled to prevent excessive start requests for the same project.
 * A project will only be awakened once every 30 seconds.
 *
 * @param db - PostgreSQL database instance
 * @param project_id - UUID of project to awaken
 * @param cb - Optional callback for completion
 */
export function awakenProject(
  db: PostgreSQL,
  project_id: string,
  cb?: CB,
): void {
  // Throttle so that this gets called *for a given project* at most once every 30s
  const now = new Date();
  if (
    lastAwakenTime[project_id] != null &&
    now.getTime() - lastAwakenTime[project_id].getTime() < 30000
  ) {
    return;
  }
  lastAwakenTime[project_id] = now;

  const dbg = db._dbg(`awakenProject(project_id=${project_id})`);
  if (db.projectControl == null) {
    dbg("skipping since no projectControl defined");
    return;
  }

  dbg("doing it...");
  return async.series(
    [
      async function (cb: CB) {
        try {
          const project = db.projectControl!(project_id);
          await project.start();
          return cb();
        } catch (err) {
          return cb(`error starting project = ${err}`);
        }
      },
      function (cb: CB) {
        if (db.ensure_connection_to_project == null) {
          cb();
          return;
        }
        dbg("also make sure there is a connection from hub to project");
        // This is so the project can find out that the user wants to save a file (etc.)
        return db.ensure_connection_to_project(project_id, cb);
      },
    ],
    function (err: any) {
      if (err) {
        dbg(`awaken project error -- ${err}`);
      } else {
        dbg("success awakening project");
      }
      return typeof cb === "function" ? cb(err) : undefined;
    },
  );
}
