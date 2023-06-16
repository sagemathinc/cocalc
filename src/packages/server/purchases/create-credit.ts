import getPool from "@cocalc/database/pool";
import type { Credit } from "@cocalc/util/db-schema/purchases";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import { currency } from "./util";
import { getServerSettings } from "@cocalc/server/settings/server-settings";

export default async function createCredit({
  account_id,
  invoice_id,
  amount,
  notes,
  tag,
  unique,
}: {
  account_id: string;
  invoice_id?: string;
  amount: number;
  notes?: string;
  tag?: string;
  unique?: boolean;
}): Promise<number> {
  if (!(await isValidAccount(account_id))) {
    throw Error(`${account_id} is not a valid account`);
  }
  if (amount <= 0) {
    throw Error(`credit amount (=${amount}) must be positive`);
  }
  const { pay_as_you_go_min_payment } = await getServerSettings();
  if (amount <= pay_as_you_go_min_payment) {
    throw Error(
      `minimum credit you can add is ${currency(pay_as_you_go_min_payment)}.`
    );
  }
  const pool = getPool();

  if (unique && invoice_id) {
    const x = await pool.query(
      "SELECT COUNT(*) as count FROM purchases WHERE invoice_id=$1",
      [invoice_id]
    );
    if (x.rows[0].count > 0) {
      throw Error(`there is already a credit with invoice_id=$1`);
    }
  }

  const { rows } = await pool.query(
    "INSERT INTO purchases (service, time, account_id, cost, description, invoice_id, notes, tag) VALUES('credit', CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6) RETURNING id",
    [account_id, -amount, { type: "credit" } as Credit, invoice_id, notes, tag]
  );
  return rows[0].id;
}
