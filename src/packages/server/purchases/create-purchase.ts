import getPool from "@cocalc/database/pool";
import type { Description } from "@cocalc/util/db-schema/purchases";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getQuota from "./get-quota";
import getBalance from "./get-balance";
import getLogger from "@cocalc/backend/logger";
import { delay } from "awaiting";

const logger = getLogger("purchase:create-purchase");

/*
Creates the requested purchase if possible, given the user's quota.  If not, throws an exception.
*/
export default async function createPurchase({
  account_id,
  project_id,
  cost,
  description,
  notes,
  tag,
}: {
  account_id: string;
  project_id?: string;
  cost: number;
  description: Description;
  notes?: string;
  tag?: string;
}): Promise<number> {
  const pool = getPool();
  let eps = 3000;
  let error = Error("unable to create purchase");
  for (let i = 0; i < 10; i++) {
    try {
      const { rows } = await pool.query(
        "INSERT INTO purchases (time, account_id, project_id, cost, description, notes, tag) VALUES(CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6) RETURNING id",
        [account_id, project_id, cost, description, notes, tag]
      );
      return rows[0].id;
    } catch (err) {
      error = err;
      // could be ill-timed database outage...?
      logger.debug("Failed to insert purchase into purchases table.", {
        account_id,
        cost,
        description,
        err,
      });
      await delay(eps);
      eps *= 1.2;
    }
  }
  throw error;
}

// Throws an exception if purchase is not allowed.  Code should
// call this before giving the thing and doing createPurchase.
// This is NOT part of createPurchase, since we could easily call
// createPurchase after providing the service.
export async function assertPurchaseAllowed({
  account_id,
  cost,
}: {
  account_id: string;
  cost: number;
}) {
  if (!(await isValidAccount(account_id))) {
    throw Error(`${account_id} is not a valid account`);
  }
  if (!Number.isFinite(cost) || cost <= 0) {
    throw Error(`cost must be positive`);
  }
  const quota = await getQuota({ account_id });
  const balance = await getBalance({ account_id });
  if (balance + cost > quota) {
    throw Error(
      `Insufficient quota.  balance + potential_cost > quota.   $${balance} + $${cost} > $${quota}.  Verify your email address, add credit, or contact support to increase your quota.`
    );
  }
}
