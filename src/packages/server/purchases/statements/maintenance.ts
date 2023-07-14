/*
See packages/util/db-schema/statements.ts for the definition of a statement.

NOTE: This is not coded in a way that would scale up to having like 100K active
users who make purchases every day, since the first step is too load some data
into memory about every user active with a purchase in a given day.  By the time
we get anywhere close to that level of usage, I can higher somebody else to
rewrite this to scale better.
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
  if (time >= new Date()) {
    // because we are basically assuming no new purchases happen <= time.
    throw Error("time must be in the past");
  }
  const pool = getPool();

  /*
  For every purchase where `${interval}_statement_id` is null and purchase_time <= time, compute:
     - total of charges, number of charges
     - total of credits, number of credits
  */
  const charges = await getData(time, pool, interval, "charges");
  const credits = await getData(time, pool, interval, "credits");
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
    // Finally set the statement id's for all the purchases.
    for (const { account_id, id } of rows) {
      await pool.query(
        `UPDATE purchases SET ${interval}_statement_id=$1 WHERE account_id=$2 AND ${interval}_statement_id IS NULL AND time<=$3`,
        [id, account_id, time]
      );
    }
  }
}

function getQuery(
  time: Date,
  interval: Interval,
  type: "charges" | "credits"
): string {
  if (interval == "day") {
    return `SELECT account_id, SUM(cost) AS total_${type}, count(*) AS num_${type} FROM purchases WHERE ${interval}_statement_id IS NULL AND time <= $1 AND cost ${
      type == "charges" ? " > 0" : "< 0"
    } GROUP BY account_id`;
  } else if (interval == "month") {
    // for interval = 'month' we need to add an additional where clause about the purchase_closing_day from the accounts table.
    const purchase_closing_day = time.getDate();
    return `SELECT purchases.account_id AS account_id, SUM(purchases.cost) AS total_${type}, count(*) AS num_${type} FROM purchases, accounts WHERE purchases.account_id = accounts.account_id AND accounts.purchase_closing_day = ${purchase_closing_day} AND purchases.${interval}_statement_id IS NULL AND purchases.time <= $1 AND purchases.cost ${
      type == "charges" ? " > 0" : "< 0"
    } GROUP BY purchases.account_id`;
  } else {
    throw Error("unknown interval");
  }
}

async function getData(
  time: Date,
  pool,
  interval: Interval,
  type: "charges" | "credits"
) {
  const query = getQuery(time, interval, type);
  const { rows } = await pool.query(query, [time]);
  return toAccountMap(rows);
}

function toAccountMap(rows) {
  const map: {
    [account_id: string]: {
      total_charges: number;
      num_charges: number;
      total_credits: number;
      num_credits: number;
    };
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
