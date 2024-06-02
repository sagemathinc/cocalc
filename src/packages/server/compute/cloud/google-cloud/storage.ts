import { getCredentials } from "./client";
import getLogger from "@cocalc/backend/logger";
import { Storage } from "@google-cloud/storage";

const logger = getLogger("server:compute:cloud:google-cloud:storage");

import type { GoogleCloudServiceAccountKey } from "@cocalc/util/db-schema/storage";

// create a google cloud storage bucket
export async function createBucket(opts: { bucket: string }): Promise<void> {
  logger.debug("createBucket", opts);
  const credentials = await getCredentials();
  const client = new Storage(credentials);
  await client.createBucket(opts.bucket)
}

// create a google cloud service account that can only do one thing, which is use this specific bucket.
export async function createServiceAccount(
  bucket: string,
): Promise<GoogleCloudServiceAccountKey> {
  logger.debug("createServiceAccount", bucket);
  return {} as GoogleCloudServiceAccountKey;
}
