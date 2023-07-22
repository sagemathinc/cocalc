/*
Create the given credit.  

If there is already a credit with the given invoice_id, then
do not create the credit again.  

In all cases, it returns the purchase id number.
*/

import getPool from "@cocalc/database/pool";
import type { Credit } from "@cocalc/util/db-schema/purchases";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getLogger from "@cocalc/backend/logger";
import updatePendingPurchases from "./update-pending-purchases";

const logger = getLogger("purchases:create-credit");

export default async function createCredit({
  account_id,
  invoice_id,
  amount,
  notes,
  tag,
}: {
  account_id: string;
  invoice_id?: string;
  amount: number;
  notes?: string;
  tag?: string;
}): Promise<number> {
  logger.debug("createCredit", { account_id, invoice_id, amount });
  if (!(await isValidAccount(account_id))) {
    throw Error(`${account_id} is not a valid account`);
  }
  if (amount <= 0) {
    throw Error(`credit amount (=${amount}) must be positive`);
  }
  const pool = getPool();

  if (invoice_id) {
    const x = await pool.query(
      "SELECT id FROM purchases WHERE invoice_id=$1 AND service='credit'",
      [invoice_id]
    );
    if (x.rows.length > 0) {
      logger.debug(
        "createCredit",
        { invoice_id },
        " already exists, so doing nothing further (this credit was already processed)"
      );
      return x.rows[0].id;
    }
  }

  logger.debug("createCredit -- adding to database");
  const { rows } = await pool.query(
    "INSERT INTO purchases (service, time, account_id, cost, description, invoice_id, notes, tag) VALUES('credit', CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6) RETURNING id",
    [account_id, -amount, { type: "credit" } as Credit, invoice_id, notes, tag]
  );
  updatePending(account_id); // don't block on this async call that won't throw.

  return rows[0].id;
}

async function updatePending(account_id) {
  try {
    await updatePendingPurchases(account_id);
  } catch (err) {
    // if something goes wrong this just means some pending flags weren't flipped.
    // They'll get flipped later, and this basically only gives the user a little
    // bit of temporary credit.
    logger.debug(
      "createCredit -- WARNING -- nonfatal error updating pending purchases",
      err
    );
  }
}
