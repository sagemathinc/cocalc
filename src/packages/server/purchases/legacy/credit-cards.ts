/*
Migration script that figures out default card on file for each user that has one, and 
set stripe_usage_subscription to the id of that card, which is of the form 
card_1NTwIyGbwvoRbeYxedsR3ndw

This does nothing for accounts for which stripe_usage_subscription is already set
to something.
*/

import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchases:legacy:credit-cards");

export async function migrateAllCreditCards() {
  const stripe = await getConn();
  const pool = getPool();
  logger.debug("migrateAllCreditCards: getting accounts...");
  const { rows } = await pool.query(
    "SELECT account_id, stripe_customer_id FROM accounts WHERE stripe_customer_id IS NOT NULL AND stripe_usage_subscription IS NULL"
  );
  logger.debug(
    "migrateAllCreditCards: got ",
    rows.length,
    "accounts that use stripe but don't have stripe_usage_subscription setup"
  );
  let i = 1;
  for (const { account_id, stripe_customer_id } of rows) {
    logger.debug("migrateAllCreditCards:", i, "/", rows.length, {
      account_id,
    });
    const customer = await stripe.customers.retrieve(stripe_customer_id);
    // @ts-ignore
    const default_source = customer.default_source;
    if (default_source?.startsWith("card_")) {
      await pool.query(
        "UPDATE accounts SET stripe_usage_subscription=$1 WHERE account_id=$2",
        [default_source, account_id]
      );
    }
    i += 1;
  }
}
