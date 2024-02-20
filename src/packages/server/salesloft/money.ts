/*
Add extra information about a given user based on historical statements data.

In particular, we compute and set cocalc_purchase_timestamp, cocalc_balance,
cocalc_last_month_spend, cocalc_last_year_spend (as defined in sync.ts)
based on daily statements (and monthly for last year) from our database only.
*/

import getPool from "@cocalc/database/pool";

export async function updateMoney(account_id: string) {
  const data = await getMoneyData(account_id);
  console.log(data);
}

// just get all daily statements for a given user during the last year.
export async function getMoneyData(account_id: string): Promise<{
  cocalc_purchase_timestamp: string;
  cocalc_balance: number;
  cocalc_last_month_spend: number;
  cocalc_last_year_spend: number;
}> {
  const pool = getPool("long");
  // get most recent daily statement
  const x = await pool.query(
    "SELECT time, balance FROM statements WHERE account_id=$1 AND interval='day' ORDER BY time desc LIMIT 1",
    [account_id],
  );
  if (x.rows.length == 0) {
    // no statements ever
    return {
      cocalc_balance: 0,
      cocalc_purchase_timestamp: "0000-00-00T00:00:00.000Z",
      cocalc_last_month_spend: 0,
      cocalc_last_year_spend: 0,
    };
  }
  const cocalc_balance = x.rows[0].balance;
  const cocalc_purchase_timestamp = x.rows[0].time.toISOString();

  const y = await pool.query(
    "SELECT sum(total_charges) as total FROM statements WHERE account_id=$1 AND interval='day' AND time >= NOW() - interval '1 month'",
    [account_id],
  );
  const cocalc_last_month_spend = y.rows[0]?.total;

  const z = await pool.query(
    "SELECT sum(total_charges) as total FROM statements WHERE account_id=$1 AND interval='month' AND time >= NOW() - interval '1 year'",
    [account_id],
  );
  const cocalc_last_year_spend = z.rows[0]?.total;
  return {
    cocalc_balance,
    cocalc_purchase_timestamp,
    cocalc_last_month_spend,
    cocalc_last_year_spend,
  };
}
