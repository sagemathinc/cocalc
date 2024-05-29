/*
Scalable distributed storage
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:storage");

export type StorageConf = any[];

export async function getStorageConf(project_id: string): Promise<StorageConf> {
  logger.debug("getStorageConf: ", { project_id });
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM storage WHERE project_id=$1 AND (deleted IS null or deleted=false)`,
    [project_id],
  );
  // TODO: we may have to address issues here with service account keys expiring, and
  // maybe with collaborators on a project.
  return rows;
}
