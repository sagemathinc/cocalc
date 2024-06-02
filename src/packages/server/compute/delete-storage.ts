/*
Delete everything related to a storage filesystem.
*/
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:delete-storage");

export async function deleteStorage(id: number) {
  logger.debug("deleteStorage", { id });
  // delete the Google cloud bucket

  // delete the service account

  // set the database record as deleted, and also set an expire field so
  // that record is permanently deleted in a few weeks.
}
