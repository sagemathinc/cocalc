/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getPool from "@cocalc/database/pool";
import type {
  FileUseTimesOptions,
  FileUseTimesResponse,
} from "@cocalc/nats/hub-api/db";

export async function fileUseTimes({
  project_id,
  account_id,
  path,
  target_account_id,
  limit = 1000,
  access_times = true,
  edit_times,
}: FileUseTimesOptions): Promise<FileUseTimesResponse> {
  // Verify that that user has access.  Throws exception if not allowed.
  if (!account_id || !(await isCollaborator({ account_id, project_id }))) {
    throw Error("user does not have read access to the given project");
  }

  target_account_id = target_account_id ?? account_id;

  const resp: FileUseTimesResponse = { target_account_id };

  if (access_times) {
    // Query the file_access_log file.
    const pool = getPool("long");
    const { rows } = await pool.query(
      "SELECT time FROM file_access_log WHERE project_id=$1 AND filename=$2 AND account_id=$3 ORDER BY time DESC LIMIT $4",
      [project_id, path, target_account_id, limit],
    );
    resp.access_times = [];
    for (const { time } of rows) {
      resp.access_times.push(time.valueOf());
    }
  }

  if (edit_times) {
    console.log("edit_times not supported");
    resp.edit_times = [];
  }

  // This data is no longer recorded in the database, and can only be currently obtained
  // via expensive access to NATS. Thus it is deprecated.

  //   // The patches data
  //   if (edit_times) {
  //     const string_id = db.sha1(project_id, path);
  //     const edit_times: { time: Date }[] = await query({
  //       db,
  //       table: "patches",
  //       select: ["time"],
  //       where: { string_id },
  //       one: false,
  //       order_by: "time desc",
  //       limit: limit,
  //     });
  //     resp.edit_times = [];
  //     for (const d of edit_times) {
  //       resp.edit_times.push(d.time.valueOf());
  //     }
  //   }

  return resp;
}
