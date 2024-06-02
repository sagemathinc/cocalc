/*
Create a scalable storage filesystem and returns the numerical id of that storage.

This DOES create an actual GCP bucket and service account, and we charge
a small token charge for doing so to prevent abuse.
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

  return 0;
}
