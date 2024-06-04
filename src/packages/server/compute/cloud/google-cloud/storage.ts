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
import { addStorageTransferPolicy } from "./policy";

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
*/

export async function deleteFilesUsingTransferService(
  bucketName: string,
  _addTransferPolicy = false, // used in case of failure
) {
  logger.debug("deleteFolderUsingTransferService", {
    bucketName,
    _addTransferPolicy,
  });
  const credentials = await getCredentials();

  // Initialize the client
  const transferClient = new StorageTransferServiceClient(credentials);

  if (_addTransferPolicy) {
    logger.debug(
      "deleteFolderUsingTransferService -- adding transfer service account role binding",
    );
    // Note that the client's service account by default doesn't have permissions to
    // actually do anything, so the transfer fails.  The source code of StorageTransferServiceClient says
    // "Users should add this service account to the Google Cloud Storage
    // bucket ACLs to grant access to Storage Transfer Service."
    // We fix this by doing just that via the api as given below.
    // We only need to do this once, which is why the awkward style of this code,
    // where it fails and tries this.
    const [serviceAccount] = await transferClient.getGoogleServiceAccount();
    const { accountEmail } = serviceAccount;
    if (!accountEmail) {
      throw Error("unable to get storage transfer service email");
    }
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
      "deleteFolderUsingTransferService: creating transfer job",
      transferJob,
    );

    const [job] = await transferClient.createTransferJob({ transferJob });

    logger.debug("deleteFolderUsingTransferService: transfer job created", job);
    const runRequest = {
      jobName: job.name,
      projectId,
    };
    logger.debug(
      "deleteFolderUsingTransferService: submitting request",
      runRequest,
    );
    const [operation] = await transferClient.runTransferJob(runRequest);

    logger.debug(
      "deleteFolderUsingTransferService: waiting for the operation to complete",
    );
    await operation;

    logger.debug("deleteFolderUsingTransferService: operation completed!");
  } catch (err) {
    if (!_addTransferPolicy) {
      logger.debug(
        "deleteFolderUsingTransferService: failed -- trying again after adding storage policy",
        err,
      );
      await deleteFilesUsingTransferService(bucketName, true);
      return;
    }
  } finally {
    logger.debug("deleteFolderUsingTransferService: deleting temp bucket");
    // obviously do not use transfer service for this!
    deleteBucket({ bucketName: tempBucket, useTransferService: false });
  }
}

// Delete a google cloud storage bucket
// You should first delete most files using deleteFolderUsingTransferService.
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
