/*
Scalable distributed storage

NOTE: obviously, this isn't implemented yet!
*/

import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:storage");

export type StorageConf = any[];

export async function getStorageConf(project_id: string): Promise<StorageConf> {
  logger.debug("getStorageConf: ", { project_id });
  return [];
}
