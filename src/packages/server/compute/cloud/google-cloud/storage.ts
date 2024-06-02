/*
Google API docs: https://googleapis.dev/nodejs/storage/latest/
*/

import { getCredentials } from "./client";
import getLogger from "@cocalc/backend/logger";
import { CreateBucketRequest, Storage } from "@google-cloud/storage";

const logger = getLogger("server:compute:cloud:google-cloud:storage");

import type { GoogleCloudServiceAccountKey } from "@cocalc/util/db-schema/storage";

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

// delete a google cloud storage bucket
export async function deleteBucket(bucketName: string): Promise<void> {
  logger.debug("deleteBucket", bucketName);
  const credentials = await getCredentials();
  const storage = new Storage(credentials);
  const bucket = storage.bucket(bucketName);
  if (!(await bucket.exists())) {
    // deleting already deleted bucket gracefully works.
    return;
  }
  // actually fully deleting of course takes a long time, depending
  // on what is in the bucket -- this just launches the process.
  await bucket.delete();
}

// create a google cloud service account that can only do one thing, which is use this specific bucket.
export async function createServiceAccount(
  bucketName: string,
): Promise<GoogleCloudServiceAccountKey> {
  // todo: make sure deleting already deleted service account fully works.
  logger.debug("createServiceAccount", bucketName);
  return {} as GoogleCloudServiceAccountKey;
}

export async function deleteServiceAccount(
  serviceAccount: GoogleCloudServiceAccountKey,
): Promise<void> {
  logger.debug("deleteServiceAccount", serviceAccount.client_email);
}
