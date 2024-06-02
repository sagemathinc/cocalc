/*
Delete storage filesystem.  Deletes the actual data, but leaves the configuration around,
so like deprovisioning.
*/
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getStorage } from "./storage";
import {
  deleteBucket,
  deleteServiceAccount,
} from "./cloud/google-cloud/storage";

const logger = getLogger("server:compute:delete-storage");

export default async function deleteStorage(id: number, lock?: string) {
  logger.debug("deleteStorage", { id });
  const storage = await getStorage(id);
  if (storage.deleted) {
    // it is already deleted
    return;
  }
  if (storage.lock && storage.lock != lock) {
    throw Error(
      `deleteStorage: you must provide the lock string '${storage.lock}'`,
    );
  }
  const pool = getPool();

  // WORRY -- if a database query fails below due to an outage we get in an inconsistent
  // situation where we can't properly finish the delete, and manual intervention may
  // be required. Actually, this is fine, because deleting a deleted bucket and
  // deleting a deleted secret key works fine (by design!) so the next attempt will work.

  if (storage.bucket) {
    logger.debug("deleteStorage: delete the Google cloud bucket");
    await deleteBucket(storage.bucket);
    await pool.query("UPDATE storage SET bucket=NULL WHERE id=$1", [id]);
  }

  if (storage.secret_key) {
    logger.debug("deleteStorage: delete the service account");
    await deleteServiceAccount(storage.secret_key);
    await pool.query("UPDATE storage SET secret_key=NULL WHERE id=$1", [id]);
  }

  logger.debug(
    "deleteStorage: set the database record as deleted (like a deprovisioned server).",
  );
  await pool.query("UPDATE storage SET deleted=TRUE WHERE id=$1", [id]);
}
