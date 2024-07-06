/*
Fully permanently deletes a cloud file system.  Deletes the actual data, configuration, database record,
etc.  This is NOT just deprovisioning.

The actual call to delete the bucket can take arbitrarily long, and we need to come up with a
way to contend with that.
*/
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getCloudFilesystem } from "./index";
import { deleteBucket } from "@cocalc/server/compute/cloud/google-cloud/storage";
import { deleteServiceAccount } from "@cocalc/server/compute/cloud/google-cloud/service-account";
import { getServiceAccountId } from "./create";
import { removeBucketPolicyBinding } from "@cocalc/server/compute/cloud/google-cloud/policy";
import { delay } from "awaiting";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import {
  DEFAULT_LOCK,
  CloudFilesystem,
} from "@cocalc/util/db-schema/cloud-filesystems";
import { uuid } from "@cocalc/util/misc";

const logger = getLogger("server:compute:cloud-filesystem:delete");

export async function userDeleteCloudFilesystem({
  id,
  account_id,
  lock,
}: {
  id: number;
  account_id: string;
  lock?: string;
}) {
  logger.debug("userDeleteCloudFilesystem: request to delete ", {
    id,
    account_id,
    lock,
  });
  const cloudFilesystem = await getCloudFilesystem(id);
  if (cloudFilesystem.account_id != account_id) {
    const { name, email_address } = await getUser(account_id);
    logger.debug("userDeleteCloudFilesystem: no, not owner");
    throw Error(
      `only the owner of the cloud file system volume can delete it -- this volume is owned by ${name} - ${email_address}`,
    );
  }
  if ((cloudFilesystem.lock ?? DEFAULT_LOCK) != lock) {
    logger.debug("userDeleteCloudFilesystem: no, invalid lock string");
    throw Error(
      `you must provide the lock string '${
        cloudFilesystem.lock ?? DEFAULT_LOCK
      }'`,
    );
  }
  if (cloudFilesystem.mount) {
    logger.debug("userDeleteCloudFilesystem: no, mounted");
    throw Error("unmount the cloud file system first");
  }
  if (cloudFilesystem.deleting) {
    logger.debug("userDeleteCloudFilesystem: no, already deleting");
    throw Error(
      `cloud file system ${id} is currently being deleted; please wait`,
    );
  }
  logger.debug(
    "userDeleteCloudFilesystem: yes, launching the delete without blocking api call response",
  );
  launchDelete(id);
}

// this won't throw
async function launchDelete(id: number) {
  logger.debug("launchDelete: ", { id });
  // this tries to fully delete all bucket content and everything else, however
  // long that may take.  It could fail due to server restart, network issues, etc.,
  // but the actual delete of storage content is likely to work (since it is done
  // via a remote service on google cloud).
  // There is another service that checks for cloud file systems that haven't been
  // deleted from the database but have deleting=TRUE and last_edited sufficiently long
  // ago, and tries those again, so eventually everything gets properly deleted.
  const pool = getPool();
  try {
    logger.debug("launchDelete: ", { id }, " change mountpoint");
    await pool.query(
      "UPDATE cloud_filesystems SET deleting=TRUE, last_edited=NOW(), mount=FALSE, mountpoint=$2 WHERE id=$1",
      [id, `deleting-${uuid().slice(0, 6)}`],
    );
    logger.debug("launchDelete: ", { id }, " actually delete...");
    await deleteCloudFilesystem(id);
    logger.debug("launchDelete: ", { id }, " fully deleted");
  } catch (err) {
    logger.debug(
      "launchDelete: ",
      { id },
      " something went wrong -- saving error",
      err,
    );
    // makes it so the error is saved somewhere; user might see it in UI
    // Also, deleteMaintenance will run this function again somewhere an hour
    // from when we started above...
    await pool.query("UPDATE cloud_filesystems SET error=$1 WHERE id=$2", [
      `${err}`,
      id,
    ]);
  }
}

export async function deleteMaintenance() {
  logger.debug("deleteMaintenance");
  // NOTE: if a single delete takes longer than 1 hour, then we'll end up running
  // two deletes at once.  This could happen maybe, if a bucket millions
  // of objects in it, maybe.  Estimate are between 300/s and 1500/s, so maybe 5 million.
  // In any case, I don't think it would be the end of the world.
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id FROM cloud_filesystems WHERE deleting=TRUE AND last_edited <= NOW() - interval '30 minutes'",
  );
  for (const { id } of rows) {
    logger.debug("deleteMaintenance: do delete", { id });
    launchDelete(id);
  }
}

export async function deleteCloudFilesystem(id) {
  logger.debug("deleteCloudFilesystem", { id });

  const cloudFilesystem = await getCloudFilesystem(id);
  const pool = getPool();
  if (cloudFilesystem.mount) {
    logger.debug(
      "deleteCloudFilesystem",
      { id },
      "unmount since it is mounted",
    );
    await pool.query("UPDATE cloud_filesystems SET mount=FALSE WHERE id=$1", [
      id,
    ]);
  }

  // WORRY -- if a database query fails below due to an outage we get in an inconsistent
  // situation where we can't properly finish the delete, and manual intervention may
  // be required. Actually, this is fine, because deleting a deleted bucket and
  // deleting a deleted secret key works fine (by design!) so the next attempt will work.
  await deleteServiceAccountAndBinding(cloudFilesystem);

  const { bucket } = cloudFilesystem;
  if (bucket) {
    // bucket should always be non-null
    logger.debug("deleteCloudFilesystem: delete the Google cloud bucket", {
      bucket,
    });
    await deleteBucket({
      bucketName: bucket,
      useTransferService: true,
    });
  }
  logger.debug("deleteCloudFilesystem: delete the database record");
  await pool.query("DELETE FROM cloud_filesystems WHERE id=$1", [id]);
}

async function deleteServiceAccountAndBinding(
  cloudFilesystem: CloudFilesystem,
) {
  if (!cloudFilesystem.secret_key) {
    return;
  }
  // delete service account first before bucket, since if things break
  // we want the bucket name to still be in the database.
  logger.debug("deleteServiceAccountAndBinding: delete the service account");
  const { id, bucket } = cloudFilesystem;
  const serviceAccountId = await getServiceAccountId(id);
  let error: any = null;
  if (bucket) {
    for (let i = 0; i < 10; i++) {
      // potentially try multiple times, since removeBucketPolicy may fail due to race condition (by design)
      try {
        logger.debug(
          "deleteServiceAccountAndBinding: delete the policy binding",
        );
        await removeBucketPolicyBinding({
          serviceAccountId,
          bucketName: bucket,
        });
        error = null;
        break;
      } catch (err) {
        error = err;
        logger.debug(
          "deleteServiceAccountAndBinding: error removing bucket policy binding -- may try again",
          err,
        );
        await delay(Math.random() * 5000);
      }
    }
  }
  if (error != null) {
    throw Error(`failed to remove bucket policy -- ${error}`);
  }
  logger.debug("deleteServiceAccountAndBinding: now delete service account");
  await deleteServiceAccount(serviceAccountId);
  const pool = getPool();
  await pool.query("UPDATE cloud_filesystems SET secret_key=NULL WHERE id=$1", [
    id,
  ]);
}

// Periodically ensure that all service accounts that haven't been used
// in a while are deleted to avoid clutter. Also the API for adding/removing
// rolebindings looks like to blow up in our face if there are
// too many of them!   We make this reasonably long, at least for now,
// since having to create the service account role binding on the fly
// can be disruptive -- and it takes "Typically 2 minutes, potentially
// 7 minutes or longer" to actually work.
// https://cloud.google.com/iam/docs/access-change-propagation

const SERVICE_ACCOUNT_PURGE_INTERVAL = "1 month";

export async function serviceAccountMaintenance() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM cloud_filesystems WHERE secret_key IS NOT NULL AND last_edited IS NOT NULL AND last_edited <= NOW() - INTERVAL '${SERVICE_ACCOUNT_PURGE_INTERVAL}'`,
  );
  logger.debug(
    `serviceAccountMaintenance: got ${rows.length} needing maintenance`,
  );
  for (const row of rows) {
    await deleteServiceAccountAndBinding(row);
  }
}
