/*
Create a scalable cloud filesystem and returns the numerical id of it.

This DOES create an actual GCP bucket and service account that has
access ONLY to that one bucket.

To prevent abuse we ensure it is possible to charge a small token charge.
**We do not actually make the charge.**

CRITICAL: Google Cloud Storage has EXCELLENT "Quotas and limits" by default related
to buckets as explained here: https://cloud.google.com/storage/quotas#buckets
and discussed here: https://stackoverflow.com/questions/20639484/is-there-a-max-limit-of-buckets-that-a-google-cloud-storage-project-can-have
Other providers, e.g., backblaze and AWS, have **VERY** horrible restrictions on
creation of buckets, e.g., for AWS "By default, you can create up to 100 buckets in each of your AWS accounts."
See https://docs.aws.amazon.com/AmazonS3/latest/userguide/BucketRestrictions.html
These restrictions would make the architecture we're using for storage completely
impossible except on GCP.

For fully onprem we will have to support using Ceph Object Storage or something
like https://garagehq.deuxfleurs.fr/ or https://min.io/ that is possible to self host.
Of course, using Google cloud storage with your own google resources
is also fully supported for "on prem".
This will come later, and for the first release, on-prem storage for on-prem
compute servers just won't be supported, but of google cloud based storage will be.
This is fine because right now we don't even know if this
scalable storage will be a massive success or failure.  OnPrem places also
likely have their own SAN or NFS they want to use instead.
*/

import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import getLogger from "@cocalc/backend/logger";
import { getGoogleCloudPrefix } from "@cocalc/server/compute/cloud/google-cloud/index";
import { createBucket } from "@cocalc/server/compute/cloud/google-cloud/storage";
import {
  createServiceAccount,
  createServiceAccountKey,
} from "@cocalc/server/compute/cloud/google-cloud/service-account";
import { addBucketPolicyBinding } from "@cocalc/server/compute/cloud/google-cloud/policy";
import { uuid } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import { delay } from "awaiting";

const logger = getLogger("server:compute:cloud-filesystem:create");

import {
  CREATE_CLOUD_FILESYSTEM_COST,
  DEFAULT_CONFIGURATION,
  MAX_CLOUD_FILESYSTEMS_PER_PROJECT,
  MIN_PORT,
  MAX_PORT,
  MIN_BLOCK_SIZE,
  MAX_BLOCK_SIZE,
  CreateCloudFilesystem,
  assertValidPath,
  assertValidCompression,
} from "@cocalc/util/db-schema/cloud-filesystems";

interface Options extends CreateCloudFilesystem {
  account_id: string;
}

const FIELDS =
  "project_id,account_id,bucket,mountpoint,secret_key,port,compression,block_size,title,color,notes,lock,mount,position,mount_options,keydb_options".split(
    ",",
  );

export async function createCloudFilesystem(opts: Options): Promise<number> {
  logger.debug("createCloudFilesystem", opts);
  // copy to avoid mutating
  opts = { ...opts };

  // fill in default values
  for (const field in DEFAULT_CONFIGURATION) {
    if (opts[field] == null) {
      opts[field] = DEFAULT_CONFIGURATION[field];
    }
  }
  // sanity checks
  assertValidCompression(opts.compression);
  if (opts.mountpoint) {
    assertValidPath(opts.mountpoint);
  }

  if (
    opts["block_size"] < MIN_BLOCK_SIZE ||
    opts["block_size"] > MAX_BLOCK_SIZE
  ) {
    throw Error(
      `block_size must be between ${MIN_BLOCK_SIZE} and ${MAX_BLOCK_SIZE}, inclusive`,
    );
  }

  // check that user has enough credit on account to make a MINIMAL purchase, to prevent abuse
  const { allowed, reason } = await isPurchaseAllowed({
    account_id: opts.account_id,
    service: "compute-server",
    cost: CREATE_CLOUD_FILESYSTEM_COST,
  });
  if (!allowed) {
    logger.debug("createCloudFilesystem -- not allowed", reason);
    throw Error(reason);
  }
  if (
    (await numberOfCloudFilesystems(opts.project_id)) >=
    MAX_CLOUD_FILESYSTEMS_PER_PROJECT
  ) {
    throw Error(
      `there is a limit of ${MAX_CLOUD_FILESYSTEMS_PER_PROJECT} for project`,
    );
  }

  logger.debug("createCloudFilesystem -- allowed");

  // create storage record in the database
  const push = (field, param) => {
    fields.push(field);
    params.push(param);
    dollars.push(`$${fields.length}`);
  };
  const fields: string[] = [];
  const params: any[] = [];
  const dollars: string[] = [];
  for (const field of FIELDS) {
    if (opts[field] != null) {
      push(field, opts[field]);
    }
  }
  const now = new Date();
  push("created", now);
  push("last_edited", now);
  const port = await getPort(opts.project_id);
  push("port", port);

  const query = `INSERT INTO cloud_filesystems(${fields.join(
    ",",
  )}) VALUES(${dollars.join(",")}) RETURNING id`;
  const pool = getPool();
  const { rows } = await pool.query(query, params);
  const { id } = rows[0];

  try {
    // randomized bucket name -- all GCS buckets are in a single global
    // namespace, but by using a uuid it's extremely unlikely that
    // a bucket name would ever not be avialable; also nobody will
    // ever guess a bucket name, which is an extra level of security.
    // If there is a conflict, it would be an error and the user
    // would just retry creating their bucket (it's much more likely
    // to hit a random networking error).
    const s = `-${id}-${uuid()}`;
    const bucket = `${(await getGoogleCloudPrefix()).slice(
      0,
      63 - s.length - 1,
    )}${s}`;
    logger.debug("createCloudFilesystem", { bucket });

    // create storage bucket -- for now only support google
    // cloud storage, as mentioned above.
    await createBucket(bucket);
    await pool.query("UPDATE cloud_filesystems SET bucket=$1 WHERE id=$2", [
      bucket,
      id,
    ]);

    // create service account that has access to storage bucket
    const serviceAccountId = await getServiceAccountId(id);
    await createServiceAccount(serviceAccountId);
    let error: any = null;
    for (let i = 0; i < 10; i++) {
      // potentially try multiple times, since addBucketPolicy may fail due to race condition (by design)
      try {
        await addBucketPolicyBinding({ serviceAccountId, bucketName: bucket });
        error = null;
        break;
      } catch (err) {
        error = err;
        logger.debug(
          "error adding bucket policy binding -- may try again",
          err,
        );
        await delay(Math.random() * 5);
      }
    }
    if (error != null) {
      throw Error(`failed to create bucket policy -- ${error}`);
    }
    const secret_key = await createServiceAccountKey(serviceAccountId);
    await pool.query("UPDATE cloud_filesystems SET secret_key=$1 WHERE id=$2", [
      secret_key,
      id,
    ]);
  } catch (err) {
    await pool.query("UPDATE cloud_filesystems SET error=$1 WHERE id=$2", [
      `${err}`,
      id,
    ]);
    throw err;
  }

  // TODO: make the purchase (?); if it fails, delete everything.

  return id;
}

async function numberOfCloudFilesystems(project_id: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM cloud_filesystems WHERE project_id=$1",
    [project_id],
  );
  return rows[0].count;
}

async function getPort(project_id: string): Promise<number> {
  const pool = getPool();
  for (let i = 0; i < 100; i++) {
    const port = Math.floor(
      Math.random() * (MAX_PORT + 1 - MIN_PORT) + MIN_PORT,
    );
    const { rows } = await pool.query(
      "SELECT COUNT(*) AS count FROM cloud_filesystems WHERE project_id=$1 AND port=$2",
      [project_id, port],
    );
    if (rows[0].count == 0) {
      return port;
    }
  }
  // should be insanely unlikely / impossible
  throw Error(
    `bug -- unable to allocate port for storage in project ${project_id}`,
  );
}

export async function getServiceAccountId(id: number) {
  const t = `-cloudfs-${id}`;
  return `${(await getGoogleCloudPrefix()).slice(0, 30 - t.length - 1)}${t}`;
}
