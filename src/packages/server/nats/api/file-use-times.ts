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
import { dstream } from "@cocalc/nats/sync/dstream";
import { patchesStreamName } from "@cocalc/nats/sync/synctable-stream";

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
    const name = patchesStreamName({ project_id, path });
    // TODO: performance worries - this involves reading all data for the full history of editing
    // this file, setting up a watch, etc., then removing it.... It is thus not optimized as
    // much as possible.  Instead, probably we want to grab this data from somewhere else, e.g., some
    // sort of "inventory" like index.
    const s = await dstream({
      project_id,
      name,
      noAutosave: true,
      noInventory: true,
    });
    resp.edit_times = s.times().map((x) => x?.valueOf());
    s.close();
  }

  return resp;
}
