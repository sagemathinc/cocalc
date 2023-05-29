import getPool from "@cocalc/database/pool";
import type { Description } from "@cocalc/util/db-schema/purchases";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getQuota from "./get-quota";
import getBalance from "./get-balance";

/*
Creates the requested purchase if possible, given the user's quota.  If not, throws an exception.
*/
export default async function createPurchase({
  account_id,
  cost,
  description,
  notes,
  tag,
}: {
  account_id: string;
  cost: number;
  description: Description;
  notes?: string;
  tag?: string;
}): Promise<number> {
  await assertPurchaseAllowed({ account_id, cost });
  // OK, we can do the purchase
  const pool = getPool();
  const { rows } = await pool.query(
    "INSERT INTO purchases (time, account_id, cost, description, notes, tag) VALUES(CURRENT_TIMESTAMP, $1, $2, $3, $4, $5) RETURNING id",
    [account_id, cost, description, notes, tag]
  );
  return rows[0].id;
}

// Throws an exception if purchase is not allowed.
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
      `Insufficient quota.  balance + cost > quota.   $${balance} + $${cost} > $${quota}.  Verify your email address, add credit, or contact support to incrase your quota.`
    );
  }
}
