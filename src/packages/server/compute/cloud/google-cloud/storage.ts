/*
Google API docs
 - storage -- https://googleapis.dev/nodejs/storage/latest/
*/

import { getCredentials } from "./client";
import getLogger from "@cocalc/backend/logger";
import { CreateBucketRequest, Storage } from "@google-cloud/storage";

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

// export async function getBucket(bucketName: string) {
//   logger.debug("deleteBucket", bucketName);
//   const credentials = await getCredentials();
//   const storage = new Storage(credentials);
//   return storage.bucket(bucketName);
// }
