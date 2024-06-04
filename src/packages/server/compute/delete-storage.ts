/*
Fully permanently deletes a storage filesystem.  Deletes the actual data, configuration, database record,
etc.  This is not just deprovisioning.
*/
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getStorage } from "./storage";
import { deleteBucket } from "./cloud/google-cloud/storage";
import { deleteServiceAccount } from "./cloud/google-cloud/service-account";
import { getServiceAccountId } from "./create-storage";
import { removeBucketPolicyBinding } from "./cloud/google-cloud/policy";
import { delay } from "awaiting";

const logger = getLogger("server:compute:delete-storage");

export default async function deleteStorage({
  id,
  lock,
}: {
  id: number;
  lock?: string;
}) {
  logger.debug("deleteStorage", { id });

  const storage = await getStorage(id);
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

  const bucket = storage.bucket;
  if (storage.secret_key) {
    // delete service account first before bucket, since if things break
    // we want the bucket name to still be in the database.
    logger.debug("deleteStorage: delete the service account");
    const serviceAccountId = await getServiceAccountId(id);
    let error: any = null;
    if (bucket) {
      for (let i = 0; i < 10; i++) {
        // potentially try multiple times, since removeBucketPolicy may fail due to race condition (by design)
        try {
          await removeBucketPolicyBinding({
            serviceAccountId,
            bucketName: bucket,
          });
          error = null;
          break;
        } catch (err) {
          error = err;
          logger.debug(
            "error removing bucket policy binding -- may try again",
            err,
          );
          await delay(Math.random() * 5);
        }
      }
    }
    if (error != null) {
      throw Error(`failed to remove bucket policy -- ${error}`);
    }

    await deleteServiceAccount(serviceAccountId);
    await pool.query("UPDATE storage SET secret_key=NULL WHERE id=$1", [id]);
  }

  if (bucket) {
    logger.debug("deleteStorage: delete the Google cloud bucket");
    await deleteBucket(bucket);
    await pool.query("UPDATE storage SET bucket=NULL WHERE id=$1", [id]);
  }
  logger.debug("deleteStorage: delete the database record");
  await pool.query("DELETE FROM storage WHERE id=$1", [id]);
}
