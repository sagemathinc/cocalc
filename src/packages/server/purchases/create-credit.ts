import getPool from "@cocalc/database/pool";
import type { Credit } from "@cocalc/util/db-schema/purchases";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";

export default async function createCredit({
  account_id,
  amount,
  notes,
  tag,
}: {
  account_id: string;
  amount: number;
  notes?: string;
  tag?: string;
}): Promise<number> {
  if (!(await isValidAccount(account_id))) {
    throw Error(`${account_id} is not a valid account`);
  }
  if (amount <= 0) {
    throw Error(`credit amount (=${amount}) must be positive`);
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "INSERT INTO purchases (service, time, account_id, cost, description, notes, tag) VALUES('credit', CURRENT_TIMESTAMP, $1, $2, $3, $4, $5) RETURNING id",
    [account_id, -amount, { type: "credit" } as Credit, notes, tag]
  );
  return rows[0].id;
}
