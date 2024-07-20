/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sync remote stripe view of with our local view (in our database).

ALMOST DEPRECATED - THIS EXISTS ONLY TO SUPPORT THE LEGACY UPGRADE SUBSCRIPTIONS.

We only sync customers that currently have stripe_customer non-null and
were active in the last month.

And if ever a customer doesn't have any legacy upgrade subscriptions,
then we set stripe_customer to null so that we never consider them again.
*/

import { delay } from "awaiting";
import getConn from "./connection";
import type { PostgreSQL } from "@cocalc/database/postgres/types";
import { syncCustomer } from "@cocalc/database/postgres/stripe";

export async function stripe_sync({
  logger,
  database,
  delay_ms = 500,
}: {
  logger: { debug: Function };
  database: PostgreSQL;
  delay_ms?: number; // ms, additional delay to avoid rate limiting
}): Promise<void> {
  if (!delay_ms) {
    delay_ms = 100;
  }
  const dbg = (m?) => logger.debug(`stripe_sync: ${m}`);
  dbg(
    "get all customers from the database with stripe_customer_id set that were active during the last month but are older than 2 years (since this is only for legacy upgrades which are from before 2020 and we want to reduce load)",
  );
  const users = (
    await database.async_query({
      query:
        "SELECT account_id, stripe_customer_id FROM accounts WHERE stripe_customer_id IS NOT NULL AND banned IS NOT TRUE AND deleted IS NOT TRUE AND last_active >= NOW() - INTERVAL '1 MONTH' AND (created IS NULL OR created <= NOW() - INTERVAL '4 year')",
    })
  ).rows;

  dbg(`got ${users.length} users with stripe info`);
  const stripe = await getConn();
  for (const user of users) {
    dbg(`updating customer ${user.account_id} data to our local database`);
    await syncCustomer({
      account_id: user.account_id,
      customer_id: user.stripe_customer_id,
      stripe,
    });
    // rate limiting
    await delay(delay_ms);
  }
  dbg("updated all customer info successfully");
}
