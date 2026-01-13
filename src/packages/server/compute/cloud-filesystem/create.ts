/*
Create a scalable cloud file system and returns the numerical id of it.

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
import createPurchase from "@cocalc/server/purchases/create-purchase";
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
import { moneyToCurrency } from "@cocalc/util/money";

const logger = getLogger("server:compute:cloud-filesystem:create");

import {
  CREATE_CLOUD_FILESYSTEM_AMOUNT,
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

const zeroPad = (num, places) => String(num).padStart(places, "0");

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

  // check that user has enough credit on account to make a MINIMAL purchase
  const { allowed, reason } = await isPurchaseAllowed({
    account_id: opts.account_id,
    service: "compute-server-storage",
    cost: CREATE_CLOUD_FILESYSTEM_AMOUNT,
  });
  if (!allowed) {
    logger.debug("createCloudFilesystem -- not allowed", reason);
    throw Error(
      `You must have at least ${moneyToCurrency(
        CREATE_CLOUD_FILESYSTEM_AMOUNT,
      )} credit on your account to create a cloud file system.  There is no charge to create the file system.`,
    );
  }
  if (
    (await numberOfCloudFilesystems(opts.project_id)) >=
    MAX_CLOUD_FILESYSTEMS_PER_PROJECT
  ) {
    throw Error(
      `there is a limit of ${MAX_CLOUD_FILESYSTEMS_PER_PROJECT} for project`,
    );
  }

  logger.debug("createCloudFilesystem: allowed");

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
  // bytes_used MUST always be set, and of course initially it is 0.
  push("bytes_used", 0);

  // there could be a race condition if user tries to make two cloud file systems at
  // same time for same project -- one would fail and they get an error due to
  // database uniqueness constraint. That's fine for now.
  const project_specific_id = await getAvailableProjectSpecificId(
    opts.project_id,
  );
  push("project_specific_id", project_specific_id);
  logger.debug("createCloudFilesystem", { cloudFilesystem });

  const query = `INSERT INTO cloud_filesystems(${fields.join(
    ",",
  )}) VALUES(${dollars.join(",")}) RETURNING id`;
  const pool = getPool();
  const { rows } = await pool.query(query, params);
  const { id } = rows[0];
  if (id == null) {
    throw Error("bug");
  }
  cloudFilesystem.id = id;

  try {
    const bucket = await createRandomBucketName(id);
    await pool.query("UPDATE cloud_filesystems SET bucket=$1 WHERE id=$2", [
      bucket,
      id,
    ]);

    logger.debug("createCloudFilesystem: start the purchase");
    await createCloudStoragePurchase({
      cloud_filesystem_id: id,
      account_id: opts.account_id,
      project_id: opts.project_id,
      bucket,
    });

    // NOTE: no matter what, be sure to create the bucket but NOT the service account because
    // creating the bucket twice at once could lead to waste via
    // a race condition (e.g., multiple compute servers causing creating in different hubs),
    // with multiple bucket names and garbage.  However, creating the service
    // account is canonical so no worries about the race condition.
    // Also, in general we will delete the service account completely when the
    // filesystem isn't active, to avoid having too many service accounts and
    // role bindings, but we obviously can't just delete the bucket when
    // it isn't active!
    await createBucket(bucket, bucketOptions(cloudFilesystem));
  } catch (err) {
    logger.debug("createCloudFilesystem: failed -- ", err);
    await pool.query("DELETE FROM cloud_filesystems WHERE id=$1", [id]);
    throw err;
  }

  return id;
}

export async function createCloudStoragePurchase(opts: {
  cloud_filesystem_id: number;
  account_id: string;
  project_id: string;
  bucket: string;
  period_start?: Date;
}) {
  const { cloud_filesystem_id, account_id, project_id, bucket, period_start } =
    opts;
  logger.debug("createCloudStoragePurchase: ", opts);
  const purchase_id = await createPurchase({
    client: null,
    account_id,
    project_id,
    service: "compute-server-storage",
    period_start: period_start ?? new Date(),
    description: {
      type: "compute-server-storage",
      cloud: "google-cloud",
      bucket,
      cloud_filesystem_id,
      last_updated: Date.now(),
    },
  });
  const pool = getPool();
  await pool.query("UPDATE cloud_filesystems SET purchase_id=$1 WHERE id=$2", [
    purchase_id,
    cloud_filesystem_id,
  ]);
  return purchase_id;
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

export async function getAvailableProjectSpecificId(project_id: string) {
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

async function createRandomBucketName(id: number): Promise<string> {
  // randomized bucket name -- all GCS buckets are in a single global
  // namespace, but by using a uuid it's sufficiently unlikely that
  // a bucket name would ever not be available; also nobody will
  // ever guess a bucket name, which is an extra level of security.
  // If there is a conflict, it would be an error and the user
  // would just retry creating their bucket (it's much more likely
  // to hit a random networking error).
  const s = `-${zeroPad(id, 8)}-${uuid()}`;
  const bucket = `${(await getGoogleCloudPrefix()).slice(
    0,
    63 - s.length - 1,
  )}${s}`;
  return bucket;
}
