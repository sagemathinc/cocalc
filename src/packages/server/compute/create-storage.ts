/*
Create a scalable storage filesystem and returns the numerical id of that storage.

This DOES create an actual GCP bucket and service account, and we charge
a small token charge for doing so to prevent abuse.

CRITICAL: Google Cloud Storage has EXCELLENT "Quotas and limits" by default related
to buckets as explained here: https://cloud.google.com/storage/quotas#buckets
and discussed here: https://stackoverflow.com/questions/20639484/is-there-a-max-limit-of-buckets-that-a-google-cloud-storage-project-can-have
Other providers, e.g., backblaze and AWS, have **VERY** horrible restrictions on
creation of buckets, e.g., for AWS "By default, you can create up to 100 buckets in each of your AWS accounts."
See https://docs.aws.amazon.com/AmazonS3/latest/userguide/BucketRestrictions.html
These restrictions would make the architecture we're using for storage completely
impossible except on GCP.

For onprem we will have to support using Ceph Object Storage or something
like https://garagehq.deuxfleurs.fr/ that is easier to self host.
This will come later, and for the first release on-prem just won't
be supported.  This is fine because right now we don't even know if this
scalable storage will be a massive success or failure.
*/

import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import getLogger from "@cocalc/backend/logger";
//import getPool from "@cocalc/database/pool";

const logger = getLogger("server:compute:create-storage");

import {
  CREATE_STORAGE_COST,
  CreateStorage,
} from "@cocalc/util/db-schema/storage";

interface Options extends CreateStorage {
  account_id: string;
}

export async function createStorage(opts: Options): Promise<number> {
  logger.debug("createStorage", opts);
  // check that user has enough credit on account to make a MINIMAL purchase, to prevent abuse
  const { allowed, reason } = await isPurchaseAllowed({
    account_id: opts.account_id,
    service: "compute-server",
    cost: CREATE_STORAGE_COST,
  });
  if (!allowed) {
    throw Error(reason);
  }

  // create storage bucket and service account -- for now only support google cloud storage

  return 0;
}


