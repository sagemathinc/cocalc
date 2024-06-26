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
import {
  createBucket,
  CreateBucketRequest,
  storageClassToOptions,
} from "@cocalc/server/compute/cloud/google-cloud/storage";
import {
  createServiceAccount,
  createServiceAccountKey,
} from "@cocalc/server/compute/cloud/google-cloud/service-account";
import { addBucketPolicyBinding } from "@cocalc/server/compute/cloud/google-cloud/policy";
import { uuid } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import { delay } from "awaiting";
import { FIELDS } from "./get";

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
  CloudFilesystem,
} from "@cocalc/util/db-schema/cloud-filesystems";

export interface Options extends CreateCloudFilesystem {
  account_id: string;
}

// creates bucket -- a race condition here would result in creating an extra bucket (garbage).
// mutates input
export async function ensureBucketExists(
  cloudFilesystem: Partial<CloudFilesystem>,
) {
  const { id } = cloudFilesystem;
  if (!id) {
    throw Error("ensureBucketExists failed -- id must be specified");
  }
  if (cloudFilesystem.bucket) {
    // already created
    return;
  }
  logger.debug("ensureBucketExists: creating for ", id);
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
    logger.debug("ensureBucketExists", { bucket });
    // in place mutate!
    cloudFilesystem.bucket = bucket;

    // create storage bucket -- for now only support google
    // cloud storage, as mentioned above.
    await createBucket(bucket, bucketOptions(cloudFilesystem));
    const pool = getPool();
    await pool.query("UPDATE cloud_filesystems SET bucket=$1 WHERE id=$2", [
      bucket,
      id,
    ]);
  } catch (err) {
    logger.debug("ensureBucketExists: error ", err);
    const pool = getPool();
    await pool.query("UPDATE cloud_filesystems SET error=$1 WHERE id=$2", [
      `${err}`,
      id,
    ]);
    throw err;
  }
}

// - create service account that has access to storage bucket
// - mutates input
// - race condition would create identical service account twice, so not a problem.
export async function ensureServiceAccountExists(
  cloudFilesystem: Partial<CloudFilesystem>,
) {
  if (cloudFilesystem.secret_key) {
    // already created
    return;
  }
  if (!cloudFilesystem.bucket) {
    throw Error("bucket must be set");
  }
  const { id } = cloudFilesystem;
  logger.debug("ensureServiceAccountExists: creating for ", id);
  if (!id) {
    throw Error("id must be specified");
  }
  const pool = getPool();
  try {
    // create service account that has access to storage bucket
    const serviceAccountId = await getServiceAccountId(id);
    await createServiceAccount(serviceAccountId);
    let error: any = null;
    for (let i = 0; i < 10; i++) {
      // potentially try multiple times, since addBucketPolicy may fail due to race condition (by design)
      try {
        await addBucketPolicyBinding({
          serviceAccountId,
          bucketName: cloudFilesystem.bucket,
        });
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
    // in place mutate!
    cloudFilesystem.secret_key = secret_key;
  } catch (err) {
    logger.debug("ensureServiceAccountExists: error ", err);
    // maybe error was due to race condition with two clients trying to create
    // service account at once -- in that case, take the win from the one that
    // succeeded.
    const { rows } = await pool.query(
      "SELECT secret_key FROM cloud_filesystems WHERE id=$1",
      [id],
    );
    if (rows[0]?.secret_key) {
      logger.debug("ensureServiceAccountExists: but key exists, so fine");
      cloudFilesystem.secret_key = rows[0]?.secret_key;
      return;
    }

    await pool.query("UPDATE cloud_filesystems SET error=$1 WHERE id=$2", [
      `${err}`,
      id,
    ]);
    throw err;
  }
}

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

  // always set mount to false during creation, so that it doesn't try to mount *while* we're creating the bucket.
  const mount_orig = opts.mount;
  opts.mount = false;

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
  const cloudFilesystem: Partial<CloudFilesystem> = {};
  const push = (field, param) => {
    fields.push(field);
    params.push(param);
    dollars.push(`$${fields.length}`);
    cloudFilesystem[field] = param;
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

  // there could be a race condition if user tries to make two cloud filesystems at
  // same time for same project -- one would fail and they get an error due to
  // database uniqueness constraint. That's fine for now.
  const project_specific_id = await getAvailabelProjectSpecificId(
    opts.project_id,
  );
  push("project_specific_id", project_specific_id);

  const query = `INSERT INTO cloud_filesystems(${fields.join(
    ",",
  )}) VALUES(${dollars.join(",")}) RETURNING id`;
  const pool = getPool();
  const { rows } = await pool.query(query, params);
  const { id } = rows[0];

  cloudFilesystem.id = id;
  // NOTE: no matter what, be sure to create the bucket but NOT the service account because
  // creating the bucket twice at once could lead to waste via
  // a race condition (e.g., multiple compute servers causing creating in different hubs),
  // with multiple bucket names and garbage.  However, creating the service
  // account is canonical so no worries about the race condition.
  // Also, in general we will delete the service account completely when the
  // filesystem isn't active, to avoid having too many service accounts and
  // role bindings, but we obviously can't just delete the bucket when
  // it isn't active!
  try {
    await ensureBucketExists(cloudFilesystem);
    if (mount_orig) {
      // only now that the bucket exists do we actually mount.
      await pool.query("UPDATE cloud_filesystems SET mount=TRUE WHERE id=$1", [
        id,
      ]);
    }
  } catch (err) {
    await pool.query(
      "UPDATE cloud_filesystems SET error=$1,mount=FALSE WHERE id=$2",
      [`${err}`, id],
    );
    throw err;
  }

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

// TODO: as of June "Soft delete policy" is by default 7 days and is FREE
// until Sept 1, when it gets potentially expensive.
//   https://cloud.google.com/resources/storage/soft-delete-announce?hl=en

function bucketOptions({
  bucket_storage_class,
  bucket_location,
}: Partial<Options>) {
  if (!bucket_storage_class || !bucket_location) {
    throw Error("bucket info incomplete");
  }
  return {
    location: bucket_location.toUpperCase(),
    ...storageClassToOptions(bucket_storage_class),
  } as CreateBucketRequest;
}

export async function getAvailabelProjectSpecificId(project_id: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT project_specific_id FROM cloud_filesystems WHERE project_id=$1",
    [project_id],
  );
  const x = new Set(
    rows.filter((x) => x.project_specific_id).map((x) => x.project_specific_id),
  );
  let id = 1;
  while (x.has(id)) {
    id += 1;
  }
  return id;
}
