/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Sync remote stripe view of all users with our local via (in our database).

Should get done eventually mostly via webhooks, etc., -- but for now this is OK.
*/

import { delay } from "awaiting";
import getConn from "./connection";
import { callback2 } from "@cocalc/util/async-utils";
import type { PostgreSQL } from "@cocalc/database/postgres/types";

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
    "get all customers from the database with stripe that have been active in the last month"
  );
  const users = (
    await database.async_query({
      query:
        "SELECT account_id, stripe_customer_id FROM accounts WHERE stripe_customer_id IS NOT NULL AND banned IS NOT TRUE  AND deleted IS NOT TRUE AND last_active >= NOW() - INTERVAL '1 MONTH'",
    })
  ).rows;

  dbg(`got ${users.length} users with stripe info`);
  const stripe = await getConn();
  for (const user of users) {
    dbg(`updating customer ${user.account_id} data to our local database`);
    await callback2(database.stripe_update_customer, {
      account_id: user.account_id,
      customer_id: user.stripe_customer_id,
      stripe,
    });
    // rate limiting
    await delay(delay_ms);
  }
  dbg("updated all customer info successfully");
}
