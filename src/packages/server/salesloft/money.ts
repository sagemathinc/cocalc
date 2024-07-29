/*
Add extra information about a given user based on historical statements data.

In particular, we compute and set cocalc_purchase_timestamp, cocalc_balance,
cocalc_last_month_spend, cocalc_last_year_spend (as defined in sync.ts)
based on daily statements (and monthly for last year) from our database only.
*/

import getPool from "@cocalc/database/pool";
import { update } from "./people";
import { sync } from "./sync";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("salesloft:money");

export async function updateMoney(cutoff: string = "2 days") {
  const pool = getPool("long");
  // get most recent daily statement
  const { rows } = await pool.query(
    `SELECT DISTINCT statements.account_id AS account_id, accounts.salesloft_id AS salesloft_id FROM statements, accounts WHERE
        statements.time >= now() - interval '${cutoff}'
        AND statements.account_id=accounts.account_id
        AND statements.interval='day'`,
  );
  log.debug(
    "updateMoney ",
    { cutoff },
    " got this many users with new statements: ",
    rows.length,
  );

  const account_ids: string[] = [];
  for (const { account_id, salesloft_id } of rows) {
    if (salesloft_id == null) {
      account_ids.push(account_id);
    }
  }
  let salesloft_ids: { [account_id: string]: number } = {};
  if (account_ids.length > 0) {
    log.debug(
      "updateMoney: adding ",
      account_ids.length,
      " users to salesloft",
    );
    // add missing users to salesloft
    ({ salesloft_ids } = await sync(account_ids));

    log.debug("got ", salesloft_ids);
  }

  for (const { account_id, salesloft_id } of rows) {
    const id = salesloft_id ?? salesloft_ids[account_id];
    if (id == null) {
      log.debug(
        "not computing money data for this user since they have no salesloft id",
        account_id,
      );
      continue;
    }
    const data = await getMoneyData(account_id);
    log.debug("updateMoney: ", { salesloft_id: id, account_id, data });
    try {
      await update(id, { custom_fields: data });
    } catch (err) {
      // this can happen, e.g., if the id for the person is no longer in salesloft for some reason
      // or just invalid.  This is the case with my wstein@sagemath.com account, which caused
      //   https://github.com/sagemathinc/cocalc/issues/7683
      // Better is to just make this a warning and skip those accounts -- salesloft doesn't need
      // perfect info about all users.
      log.debug("WARNING ", err);
    }
  }
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
