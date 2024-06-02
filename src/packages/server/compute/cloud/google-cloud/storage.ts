import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:cloud:google-cloud:storage");

import type { GoogleCloudServiceAccountKey } from "@cocalc/util/db-schema/storage";

// create a google cloud storage bucket
export async function createBucket(opts: { name: string }): Promise<void> {
  logger.debug("createBucket", opts);
}

// create a google cloud service account that can only do one thing, which is use this specific bucket.
export async function createBucketServiceAccount(
  bucketName: string,
): Promise<GoogleCloudServiceAccountKey> {
  logger.debug("createBucketServiceAccount", bucketName);
  return {} as GoogleCloudServiceAccountKey;
}
