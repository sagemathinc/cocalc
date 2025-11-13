/*
Get cloud file systems -- suitable for frontend user clients (e.g., don't include secret_key)
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { SCHEMA } from "@cocalc/util/db-schema";

const logger = getLogger("server:compute:cloud-filesystem/get");
export const FIELDS = Object.keys(
  SCHEMA.cloud_filesystems?.user_query?.get?.fields ?? {},
);

// Returns changes that were actually made as an object
export async function userGetCloudFilesystems(opts: {
  id?: number;
  account_id: string;
  project_id?: string;
}): Promise<CloudFilesystem[]> {
  logger.debug("userGetCloudFilesystem", opts);
  if (FIELDS == null) {
    throw Error("cloud file systems not properly configured");
  }
  const { conditions, params, checkCollab } = await getConditions(opts);
  const query = `SELECT ${FIELDS.join(
    ",",
  )} FROM cloud_filesystems WHERE ${conditions}`;
  const pool = getPool();
  const { rows } = await pool.query(query, params);
  if (checkCollab) {
    for (const row of rows) {
      if (
        !(await isCollaborator({
          account_id: opts.account_id,
          project_id: row.project_id,
        }))
      ) {
        throw Error(
          `you must be a collaborator on the project that contains cloud file system ${row.id}`,
        );
      }
    }
  }
  return rows;
}

async function getConditions(opts): Promise<{
  conditions: string[];
  params: (string | number)[];
  checkCollab: boolean;
}> {
  if (opts.id) {
    // specific id
    return { conditions: ["id=$1"], params: [opts.id], checkCollab: true };
  }
  if (opts.project_id) {
    // all for project
    if (!(await isCollaborator(opts))) {
      throw Error("you must be a collaborator on the project");
    }
    return {
      conditions: ["project_id=$1"],
      params: [opts.project_id],
      checkCollab: false,
    };
  }
  // all for this user, across all projects
  return {
    conditions: ["account_id=$1"],
    params: [opts.account_id],
    checkCollab: false,
  };
}
