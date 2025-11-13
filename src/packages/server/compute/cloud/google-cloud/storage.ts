/*
Google API docs
 - storage -- https://googleapis.dev/nodejs/storage/latest/
*/

import { getCredentials } from "./client";
import getLogger from "@cocalc/backend/logger";
import { CreateBucketRequest, Storage } from "@google-cloud/storage";
import { StorageTransferServiceClient } from "@google-cloud/storage-transfer";
import { uuid } from "@cocalc/util/misc";
import { getGoogleCloudPrefix } from "./index";
import { addStorageTransferPolicy, getProjectNumber } from "./policy";
import type { GoogleCloudBucketStorageClass } from "@cocalc/util/db-schema/cloud-filesystems";
import { GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES } from "@cocalc/util/db-schema/cloud-filesystems";

export type { CreateBucketRequest };

const logger = getLogger("server:compute:cloud:google-cloud:storage");

// create a google cloud storage bucket
export async function createBucket(
  bucketName: string,
  // see https://googleapis.dev/nodejs/storage/latest/global.html#CreateBucketRequest
  options?: CreateBucketRequest,
): Promise<void> {
  logger.debug("createBucket", bucketName);
  const credentials = await getCredentials();
  const storage = new Storage(credentials);
  await storage.createBucket(bucketName, options);
}

/*
It is VERY tricky to efficiently delete all files in a bucket on Google Cloud Storage.
Most guides suggest that you MUST delete each file one by one.
There is a method bucket.deleteFiles, but if you look up the source
code it just grabs every object, then does a separate API call to delete it,
and this is slow for a large number of files.
The juicefs format command is basically the same
and only deletes a few dozen objects per second.  Fortunately,
there is a major new trick on the block!!  One of the answers at
https://stackoverflow.com/questions/29840033/fast-way-of-deleting-non-empty-google-bucket
mentions using the new "Storage Transfer Service", and this really
is significantly faster than other approaches, probably due to
everything just being kept close, etc.

This takes about 25 seconds of overhead, but then deletes objects
at a rate of about 300/second in my test.  That stackoverlow has numbers that
are much larger, but maybe their situation is different.
I got only 30-40/second with the same parameters using juicefs format, etc.
*/

export async function deleteFilesUsingTransferService(
  bucketName: string,
  _addTransferPolicy = false, // used in case of failure
) {
  logger.debug("deleteFilesUsingTransferService", {
    bucketName,
    _addTransferPolicy,
  });
  const credentials = await getCredentials();

  // Initialize the client
  const transferClient = new StorageTransferServiceClient(credentials);

  if (_addTransferPolicy) {
    logger.debug(
      "deleteFilesUsingTransferService -- adding transfer service account role binding",
    );
    // Note that the client's service account by default doesn't have permissions to
    // actually do anything, so the transfer fails.  The source code of StorageTransferServiceClient says
    // "Users should add this service account to the Google Cloud Storage
    // bucket ACLs to grant access to Storage Transfer Service."
    // We fix this by doing just that via the api as given below.
    // We only need to do this once, which is why the awkward style of this code,
    // where it fails and tries this.
    //     const [serviceAccount] = await transferClient.getGoogleServiceAccount();
    //     const { accountEmail } = serviceAccount;
    //     if (!accountEmail) {
    //       throw Error("unable to get storage transfer service email");
    //     }
    // I can't get the above to work ! -- at least with all the permissions and api's I know about enabling.
    // Fortunately the service account email for the transfer client follows a predictable pattern,
    // so we just use that:
    const accountEmail = `project-${await getProjectNumber()}@storage-transfer-service.iam.gserviceaccount.com`;
    await addStorageTransferPolicy(accountEmail);
  }

  const { projectId } = credentials;

  // temporary bucket
  const s = `-temporary-${uuid()}`;
  const tempBucket = `${(await getGoogleCloudPrefix()).slice(
    0,
    63 - s.length - 1,
  )}${s}`;
  try {
    await createBucket(tempBucket);

    const transferJob = {
      projectId,
      transferSpec: {
        gcsDataSource: {
          bucketName: tempBucket,
        },
        gcsDataSink: {
          bucketName,
        },
        transferOptions: {
          deleteObjectsUniqueInSink: true,
        },
      },
      status: "ENABLED" as "ENABLED",
    };

    logger.debug(
      "deleteFilesUsingTransferService: creating transfer job",
      transferJob,
    );

    const [job] = await transferClient.createTransferJob({ transferJob });

    logger.debug("deleteFilesUsingTransferService: transfer job created", job);
    const runRequest = {
      jobName: job.name,
      projectId,
    };
    logger.debug(
      "deleteFilesUsingTransferService: submitting request",
      runRequest,
    );
    const [operation] = await transferClient.runTransferJob(runRequest);

    logger.debug(
      "deleteFilesUsingTransferService: waiting for the operation to complete",
    );
    await operation.promise();

    logger.debug("deleteFilesUsingTransferService: operation completed!");

    // Delete the job after completion
    logger.debug(
      "deleteFilesUsingTransferService: deleting transfer job",
      job.name,
    );
    await transferClient.updateTransferJob({
      jobName: job.name,
      projectId,
      transferJob: {
        status: "DELETED", // Setting status to "DELETED"
      },
      updateTransferJobFieldMask: { paths: ["status"] },
    });
    logger.debug("deleteFilesUsingTransferService: transfer job deleted");
  } catch (err) {
    if (!_addTransferPolicy) {
      logger.debug(
        "deleteFilesUsingTransferService: failed -- trying again after adding storage policy",
        err,
      );
      await deleteFilesUsingTransferService(bucketName, true);
      return;
    }
  } finally {
    logger.debug("deleteFilesUsingTransferService: deleting temp bucket");
    // obviously do not use transfer service for this!
    deleteBucket({ bucketName: tempBucket, useTransferService: false });
  }
}

// Delete a google cloud storage bucket
// You should first delete most files using deleteFilesUsingTransferService.
// See the comment above.  Only call this when there's a few token files
// or folders left.
export async function deleteBucket({
  bucketName,
  // useTransferService - set to true (not the default) and it will be MASSIVELY
  // faster, use less bandwidth and CPU, etc., for buckets with many objects.
  useTransferService,
}: {
  bucketName: string;
  useTransferService?: boolean;
}): Promise<void> {
  logger.debug("deleteBucket", bucketName);
  const credentials = await getCredentials();
  const storage = new Storage(credentials);
  const bucket = storage.bucket(bucketName);
  if (useTransferService) {
    await deleteFilesUsingTransferService(bucketName);
  } else {
    await bucket.deleteFiles({ force: true });
  }

  // now delete actual bucket.
  await bucket.delete({ ignoreNotFound: true });
}

export function storageClassToOptions(
  storageClass: GoogleCloudBucketStorageClass,
): Partial<CreateBucketRequest> {
  if (!GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES.includes(storageClass)) {
    // paranoia beyond typescript
    throw Error(`unknown storage class: '${storageClass}'`);
  }
  if (storageClass.includes("autoclass")) {
    return {
      autoclass: {
        enabled: true,
        terminalStorageClass: storageClass.includes("nearline")
          ? "NEARLINE"
          : "ARCHIVE",
      },
    };
  } else {
    return { [storageClass]: true };
  }
}

// set the default storage class of a bucket
export async function setDefaultStorageClass({
  bucketName,
  storageClass,
}: {
  bucketName: string;
  storageClass: GoogleCloudBucketStorageClass;
}) {
  if (!GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES.includes(storageClass)) {
    // paranoia beyond typescript
    throw Error(`unknown storage class: '${storageClass}'`);
  }
  const credentials = await getCredentials();
  const storage = new Storage(credentials);
  const bucket = storage.bucket(bucketName);

  let metadata;
  if (storageClass.includes("autoclass")) {
    metadata = {
      storageClass: "STANDARD",
      autoclass: {
        enabled: true,
        terminalStorageClass: storageClass.includes("nearline")
          ? "NEARLINE"
          : "ARCHIVE",
      },
    };
  } else {
    metadata = {
      storageClass: storageClass.toUpperCase(),
      autoclass: { enabled: false },
    };
  }

  try {
    await bucket.setMetadata(metadata);
    logger.debug(
      "setDefaultStorageClass: Successfully set default storage class",
      { bucketName, storageClass },
    );
  } catch (error) {
    logger.error(
      "setDefaultStorageClass: Error setting default storage class",
      { bucketName, storageClass, error },
    );
    throw new Error(
      `Error setting default storage class for bucket ${bucketName}: ${error.message}`,
    );
  }
}
