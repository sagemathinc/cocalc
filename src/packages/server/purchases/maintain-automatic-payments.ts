/*
For each account that has automatic payments setup (so stripe_usage_subscription is
set in the accounts table), and their most recent recent statement with interval "month"
has both fields automatic_payment and paid_purchase_id null and a negative balance,
we charge for the amount of the negative balance.

We restrict to automatic_payment null to ensure a payment didn't get attempted
and paid_purchase_id null in case somehow the user manually made the payment.
E.g., you could imagine a situation where automatic payments aren't setup,
user makes a payment, then sets up automatic payments.

If the charge goes through, then the user will get credited to the account and
the subscriptions, etc. will get renewed.

The relevant database schemas:

smc=# \d statements
                                            Table "public.statements"
      Column       |            Type             | Collation | Nullable |                Default
-------------------+-----------------------------+-----------+----------+----------------------------------------
 id                | integer                     |           | not null | nextval('statements_id_seq'::regclass)
 interval          | text                        |           |          |
 account_id        | uuid                        |           |          |
 time              | timestamp without time zone |           |          |
 balance           | real                        |           |          |
 paid_purchase_id  | integer                     |           |          |
 automatic_payment | timestamp without time zone |           |          |
 ...

smc=# \d accounts
                                  Table "public.accounts"
           Column            |            Type             | Collation | Nullable | Default
-----------------------------+-----------------------------+-----------+----------+---------
 account_id                  | uuid                        |           | not null |
 stripe_usage_subscription   | character varying(256)      |           |          |
...
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { collectPayment } from "./stripe-usage-based-subscription";
import { getServerSettings } from "@cocalc/database/settings";

const logger = getLogger("purchase:maintain-automatic-payments");

// GPT-4 and I wrote this QUERY after a lot of back and forth.  It finds all the
// relevant statements that we need to do automatic payments on in one
// single query to the database.   It's careful to only consider the MOST
// RECENT monthly statement and ignore any older ones.
// The subquery latest_statements gives the statements with interval 'month'
// but no other condition (except that the account has stripe_usage_subscription
// not null) and uses the ROW_NUMBER() trick so we can grab the most recent one.
// That's used to make a query that pull out just the latest_statements that
// have both automatic_payment and paid_purchase_id both NULL.
const QUERY = `
WITH latest_statements AS (
  SELECT
    a.account_id,
    s.id as statement_id,
    s.balance,
    s.time,
    s.automatic_payment,
    s.paid_purchase_id,
    ROW_NUMBER() OVER(PARTITION BY a.account_id ORDER BY s.time DESC) AS rn
  FROM
    accounts a
  JOIN
    statements s
    ON a.account_id = s.account_id
  WHERE
    a.stripe_usage_subscription IS NOT NULL
    AND s.interval = 'month'
)
SELECT
  account_id,
  balance,
  statement_id,
  time
FROM
  latest_statements
WHERE
  rn = 1
  AND automatic_payment IS NULL
  AND paid_purchase_id IS NULL
  AND balance < 0;
`;

export default async function maintainAutomaticPayments() {
  const { pay_as_you_go_min_payment } = await getServerSettings();

  const pool = getPool();
  const { rows } = await pool.query(QUERY);
  logger.debug("Got ", rows.length, " statements to automatically pay");
  for (const { time, account_id, balance, statement_id } of rows) {
    logger.debug(
      "Paying statement ",
      { statement_id },
      " with balance ",
      balance,
      " from ",
      time,
    );
    try {
      // disabling this since it seems potentially very confusing:
      //       // Determine sum of credits that user explicitly paid *after* the statement date.
      //       // We deduct this from their automatic payment.  Usually the automatic payment happens
      //       // very quickly after the statement is made, so it's highly unlikely the user paid
      //       // anything manually, but just in case we check.
      //       const x = await pool.query(
      //         "SELECT -SUM(cost) AS credit FROM purchases WHERE account_id=$1 AND service='credit' AND time >= $2 AND cost < 0",
      //         [account_id, time]
      //       );
      //       // Records that we are attempted to set collecting of payment into motion.
      //       const { credit } = x.rows[0];
      //       logger.debug("User has ", credit, " in credit from after the statement");
      //       const amount = -(balance + credit);

      // Set that automatic_payment has been *processed* for this statement.
      // This only means there was an actual payment attempt if the balance was negative.
      await pool.query(
        "UPDATE statements SET automatic_payment=NOW() WHERE id=$1",
        [statement_id],
      );
      if (balance < 0 && Math.abs(balance) >= pay_as_you_go_min_payment) {
        logger.debug(
          "Since balance ",
          balance,
          " is negative and at least the minimum payment thresh, will try to collect automatically",
          balance,
        );

        // Now make the attempt.  This might work quickly, it might take a day, it might
        // never succeed, it might throw an error.  That's all ok.
        if (mockCollectPayment != null) {
          await mockCollectPayment({ account_id, amount: -balance });
        } else {
          await collectPayment({ account_id, amount: -balance });
        }
      }
    } catch (err) {
      logger.debug("WARNING - error trying to collect payment", err);
    }
  }
}

// This is a hook to mock payment collection, which is very helpful for unit testing,
// so we know exactly what happened and don't have to involve stripe...
let mockCollectPayment: null | typeof collectPayment = null;
export function setMockCollectPayment(f: typeof collectPayment) {
  mockCollectPayment = f;
}
