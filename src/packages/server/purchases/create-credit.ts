import getPool from "@cocalc/database/pool";
import type { Credit } from "@cocalc/util/db-schema/purchases";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import { currency } from "./util";
import { getServerSettings } from "@cocalc/server/settings/server-settings";

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
  const { pay_as_you_go_min_payment } = await getServerSettings();
  if (amount <= pay_as_you_go_min_payment) {
    throw Error(`minimum credit you can add is ${currency(pay_as_you_go_min_payment)}.`);
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "INSERT INTO purchases (service, time, account_id, cost, description, notes, tag) VALUES('credit', CURRENT_TIMESTAMP, $1, $2, $3, $4, $5) RETURNING id",
    [account_id, -amount, { type: "credit" } as Credit, notes, tag]
  );
  return rows[0].id;
}
