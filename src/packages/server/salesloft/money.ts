/*
Add extra information about a given user based on historical statements data.

In particular, we compute and set cocalc_purchase_timestamp, cocalc_balance,
cocalc_last_month_spend, cocalc_last_year_spend (as defined in sync.ts)
based on daily statements from our database only.
*/

import getPool from "@cocalc/database/pool";
import type { Statement } from "@cocalc/util/db-schema/statements";

export async function updateMoney(account_id: string) {
  const statements = await getDailyStatements(account_id);
  console.log(statements);
}

// just get all daily statements for a given user during the last year.
export async function getDailyStatements(
  account_id: string,
): Promise<Statement[]> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT time, balance, total_charges, total_credits FROM statements WHERE account_id=$1 AND interval='day' AND time >= NOW() - interval '1 year' ORDER BY time desc",
    [account_id],
  );
  return rows;
}
