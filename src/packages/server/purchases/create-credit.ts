/*
Create the given credit.

If there is already a credit with the given invoice_id, then
do not create the credit again.

In all cases, it returns the purchase id number.
*/

import getPool, { PoolClient } from "@cocalc/database/pool";
import type { Credit } from "@cocalc/util/db-schema/purchases";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getLogger from "@cocalc/backend/logger";
import getBalance from "./get-balance";

const logger = getLogger("purchases:create-credit");

export default async function createCredit({
  account_id,
  invoice_id,
  amount,
  notes,
  tag,
  description,
  client,
  service = "credit",
}: {
  account_id: string;
  // id of Stripe invoice or payment intent.
  invoice_id?: string;
  amount: number;
  notes?: string;
  tag?: string;
  description?: Omit<Credit, "type">;
  client?: PoolClient;
  service?: "credit" | "auto-credit";
}): Promise<number> {
  logger.debug("createCredit", { account_id, invoice_id, amount, service });
  if (!(await isValidAccount(account_id))) {
    throw Error(`${account_id} is not a valid account`);
  }
  if (amount <= 0) {
    throw Error(`credit amount (=${amount}) must be positive`);
  }
  const pool = client ?? getPool();

  if (invoice_id) {
    const x = await pool.query(
      "SELECT id FROM purchases WHERE invoice_id=$1 AND service=$2",
      [invoice_id, service],
    );
    if (x.rows.length > 0) {
      logger.debug(
        "createCredit",
        { invoice_id },
        " already exists, so doing nothing further (this credit was already processed)",
      );
      return x.rows[0].id;
    }
  }

  logger.debug("createCredit -- adding to database");
  const { rows } = await pool.query(
    "INSERT INTO purchases (service, time, account_id, cost, description, invoice_id, notes, tag) VALUES($7, CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6) RETURNING id",
    [
      account_id,
      -amount,
      { type: "credit", ...description } as Credit,
      invoice_id,
      notes,
      tag,
      service,
    ],
  );

  // call getbalance to trigger update of the balance field in the accounts table.
  await getBalance({ account_id });

  return rows[0].id;
}
