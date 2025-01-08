/*
See packages/util/db-schema/statements.ts for the definition of a statement.

NOTE: This is not coded in a way that would scale up to having like "one bazillion"
active users who make purchases every day, since the first step is too load some data
into memory about every user active with a purchase in a given day.  By the time
we get anywhere close to that level of usage, I can higher somebody else to
rewrite this to scale better.
*/

import { getTransactionClient } from "@cocalc/database/pool";
import type { Interval, Statement } from "@cocalc/util/db-schema/statements";
import multiInsert from "@cocalc/database/pool/multi-insert";
import getLogger from "@cocalc/backend/logger";
import LRU from "lru-cache";

const logger = getLogger("purchases:create-statements");

export async function createDayStatements() {
  await createStatements({ time: mostRecentMidnight(), interval: "day" });
}

export async function createMonthStatements() {
  await createStatements({ time: mostRecentMidnight(), interval: "month" });
}

function mostRecentMidnight(): Date {
  const currentDate = new Date();
  currentDate.setUTCHours(0, 0, 0, 0);
  return currentDate;
}

/*
createStatements -  Create the given type of statements for the given
cutoff time and interval.

It should be safe to call this multiple times with the same input
without causing any trouble. The first time it creates the statements,
and the second time it finds that there are no purchases that aren't
attached to a statement, so nothing further happens.
Even if you called this twice at once it should be fine since everything
is done in a transaction.

That said, calling this within 4 hours of the last call is a no-op.

The one thing that would be bad would be editing or deleting a purchase
that has already had its statement_id set. **That should NEVER HAPPEN**,
and being able to detect that may have happened is a big point of statements.
*/
const lastCalled = new LRU<string, true>({
  ttl: 1000 * 3600 * 4, // once every 4 hours
  max: 1000,
});

export const _TEST_ = { lastCalled };

export async function createStatements({
  time, // must be in the past
  interval,
}: {
  time: Date;
  interval: Interval;
}) {
  logger.debug("createStatements", { time, interval });
  if (time >= new Date()) {
    // because we are basically assuming no new purchases happen <= time.
    throw Error("time must be in the past");
  }
  const key = `${time.toISOString()}-${interval}`;
  if (lastCalled.has(key)) {
    logger.debug(
      "createStatements",
      { time, interval },
      "called within 4 hours, so no-op",
    );
    return;
  } else {
    logger.debug(
      "createStatements",
      { time, interval },
      "not called recently, so ensuring all statements exist and are up to date",
    );
  }
  lastCalled.set(key, true);

  // Absolutely critical to do everything in a single transaction, so that
  // we don't end up with a statement that is missing
  // ${interval}_statement_id that should point to it but were
  // included in its computation!
  const client = await getTransactionClient();

  // Get all accounts that had a statement already with this time and interval
  // -- the time is UTC midnight of a given day, hence why we just use an
  // equality test.
  const { rows } = await client.query(
    "SELECT account_id FROM statements WHERE interval=$1 AND time=$2",
    [interval, time],
  );
  const alreadyHasStatement = new Set(rows.map((row) => row.account_id));

  try {
    /*
    For every purchase where `${interval}_statement_id` is null and purchase_time <= time, compute:
       - total of charges, number of charges
       - total of credits, number of credits
    */
    const charges = await getData(time, client, interval, "charges");
    const credits = await getData(time, client, interval, "credits");
    const accounts = new Set<string>([]);
    for (const account_id of Object.keys(credits)) {
      if (!alreadyHasStatement.has(account_id)) {
        accounts.add(account_id);
      }
    }
    for (const account_id of Object.keys(charges)) {
      if (!alreadyHasStatement.has(account_id)) {
        accounts.add(account_id);
      }
    }
    logger.debug(
      "createStatements",
      { time, interval },
      " got purchases for ",
      accounts.size,
      " distinct accounts",
    );
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
      const total = userCharges.total_charges + userCredits.total_credits;
      const balance =
        (await getPreviousStatementBalance(account_id, client, interval)) -
        total;
      statements.push({
        account_id,
        ...userCharges,
        ...userCredits,
        balance,
      });
    }
    if (statements.length > 0) {
      logger.debug(
        "createStatements",
        { time, interval },
        " inserting up to ",
        statements.length,
        " statements into database",
      );
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
          ],
        ),
      );
      const { rows } = await client.query(
        query + " RETURNING id, account_id",
        values,
      );
      // Finally, set the statement id's for all the purchases.
      for (const { account_id, id } of rows) {
        await client.query(
          `UPDATE purchases SET ${interval}_statement_id=$1 WHERE account_id=$2 AND ${interval}_statement_id IS NULL AND cost IS NOT NULL AND time<=$3`,
          [id, account_id, time],
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function getQuery(
  time: Date,
  interval: Interval,
  type: "charges" | "credits",
): string {
  if (interval == "day") {
    return `SELECT account_id, SUM(cost) AS total_${type}, count(*) AS num_${type} FROM purchases WHERE cost IS NOT NULL AND ${interval}_statement_id IS NULL AND time <= $1 AND cost ${
      type == "charges" ? " > 0" : "< 0"
    } GROUP BY account_id`;
  } else if (interval == "month") {
    // for interval = 'month' we need to add an additional where clause about the purchase_closing_day from the accounts table.
    const purchase_closing_day = time.getDate();
    return `SELECT purchases.account_id AS account_id, SUM(purchases.cost) AS total_${type}, count(*) AS num_${type} FROM purchases, accounts WHERE purchases.cost IS NOT NULL AND purchases.account_id = accounts.account_id AND accounts.purchase_closing_day = ${purchase_closing_day} AND purchases.${interval}_statement_id IS NULL AND purchases.time <= $1 AND purchases.cost ${
      type == "charges" ? " > 0" : "< 0"
    } GROUP BY purchases.account_id`;
  } else {
    throw Error("unknown interval");
  }
}

// Gets the charges or credits for the given interval, which aren't on any statement
// already.  This EXCLUDES anything where the cost field is not yet set.
async function getData(
  time: Date,
  pool,
  interval: Interval,
  type: "charges" | "credits",
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

// NOTE: we order statements by their numerical id to define "last", as also
// present them to users by their numerical id, rather than timestamp. This
// makes it so things work fine, even if for some reason there were multiple
// statements with the exact same timestamp, which could happen if servers
// were aggressively restarted, etc.
async function getPreviousStatementBalance(
  account_id: string,
  pool,
  interval: Interval,
): Promise<number> {
  const { rows } = await pool.query(
    "SELECT balance FROM statements WHERE interval=$1 AND account_id=$2 ORDER BY id DESC limit 1",
    [interval, account_id],
  );
  return rows[0]?.balance ?? 0;
}
