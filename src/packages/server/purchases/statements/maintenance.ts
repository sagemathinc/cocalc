/*
See packages/util/db-schema/statements.ts for the definition of a statement.
*/

import getPool from "@cocalc/database/pool";
import type { Interval, Statement } from "@cocalc/util/db-schema/statements";
import multiInsert from "@cocalc/database/pool/multi-insert";

export default async function maintenance({
  time,
  interval,
}: {
  time: Date;
  interval: Interval;
}) {
  const pool = getPool();

  /*
  For every purchase where `${interval}_statement_id` is null and purchase_time <= time, compute:
     - total of charges, number of charges
     - total of credits, number of credits
     
  TODO: for interval = 'month' we need to add an additional where clause about the 
  purchase_closing_day from the accounts table.
  TODO: keep this performant by only doing a batch of n at a time.
  TODO: atomic transaction.
  */
  const charges = await getCharges(time, pool, interval);
  const credits = await getCredits(time, pool, interval);
  const accounts = new Set(Object.keys(charges));
  for (const account_id of Object.keys(credits)) {
    accounts.add(account_id);
  }
  const statements: Omit<Omit<Omit<Statement, "id">, "interval">, "time">[] =
    [];
  for (const account_id of accounts) {
    const userCharges = charges[account_id] ?? {
      total_charges: 0,
      num_charges: 0,
    };
    const userCredits = credits[account_id] ?? {
      total_credits: 0,
      num_credits: 0,
    };
    const balance =
      (await getLastStatementBalance(account_id, time, pool, interval)) +
      userCharges.total_charges +
      userCredits.total_credits;
    statements.push({
      account_id,
      ...userCharges,
      ...userCredits,
      balance,
    });
  }
  if (statements.length > 0) {
    const { query, values } = multiInsert(
      "INSERT INTO statements(interval,time,account_id,balance,total_charges,num_charges,total_credits,num_credits) ",
      statements.map(
        ({
          account_id,
          balance,
          total_charges,
          num_charges,
          total_credits,
          num_credits,
        }) => [
          interval,
          time,
          account_id,
          balance,
          total_charges,
          num_charges,
          total_credits,
          num_credits,
        ]
      )
    );
    const { rows } = await pool.query(
      query + " RETURNING id, account_id",
      values
    );
    console.log("rows = ", rows);
    // Finally set the statement id's for all the purchases.
    for (const { account_id, id } of rows) {
      await pool.query(
        `UPDATE purchases SET ${interval}_statement_id=$1 WHERE account_id=$2 AND ${interval}_statement_id IS NULL AND time<=$3`,
        [id, account_id, time]
      );
    }
  }
}

async function getCharges(time: Date, pool, interval: Interval) {
  const { rows } = await pool.query(
    `SELECT account_id, SUM(cost) AS total_charges, count(*) AS num_charges FROM purchases WHERE ${interval}_statement_id IS NULL AND time <= $1 AND cost > 0 GROUP BY account_id`,
    [time]
  );
  return toAccountMap(rows) as {
    [account_id: string]: { total_charges: number; num_charges: number };
  };
}

async function getCredits(time: Date, pool, interval: Interval) {
  const { rows } = await pool.query(
    `SELECT account_id, SUM(cost) AS total_credits, count(*) AS num_credits FROM purchases WHERE ${interval}_statement_id IS NULL AND time <= $1 AND cost < 0 GROUP BY account_id`,
    [time]
  );
  return toAccountMap(rows) as {
    [account_id: string]: { total_credits: number; num_credits: number };
  };
}

function toAccountMap(rows) {
  const map: {
    [account_id: string]:
      | { total_charges: number; num_charges: number }
      | { total_credits: number; num_credits: number };
  } = {};
  for (const row of rows) {
    map[row.account_id] = row;
  }
  return map;
}

async function getLastStatementBalance(
  account_id: string,
  time: Date,
  pool,
  interval: Interval
): Promise<number> {
  const { rows } = await pool.query(
    "SELECT balance FROM statements WHERE interval=$1 AND account_id=$2 AND time<$3 ORDER BY time DESC limit 1",
    [interval, account_id, time]
  );
  return rows[0]?.balance ?? 0;
}
