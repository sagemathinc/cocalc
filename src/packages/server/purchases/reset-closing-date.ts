/*

API-accessible endpoint to set the closing day to today, or if the current day
is >= 29, then set it to 1. Calling this:

- computes the new statement day, which is today or at most the 28th, as mentioned above.
- shifts all subscription periods so they end on this date
- within the next few hours, the system will creates a new statement for the user for 
  all outstanding subscriptions and charges, if any (prorating subscription costs); this
  is just done automatically as part of the normal process.  Except on the 29,30,31 it
  will wait until the 1.

NOTES: 

- We follow stripe https://stripe.com/docs/billing/subscriptions/billing-cycle#api-now
  and "when you reset the billing cycle, the customer is invoiced immediately", to avoid
  potential issues with users playing games moving the billing cycle forward right 
  when they are about to pay, etc.  We don't actually invoice *immediately*, but it will
  happen within a few hours.
*/

import { getTransactionClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getClosingDay, setClosingDay } from "./closing-date";
import shiftAllSubscriptionsToEndOnDay from "./shift-subscriptions";
import { resetDay } from "@cocalc/util/purchases/closing-date";

const logger = getLogger("purchase:reset-closing-date");

export default async function resetClosingDate(account_id: string) {
  const closingDay = resetDay(new Date());
  logger.debug("resetClosingDate for ", account_id, " to ", closingDay);
  if ((await getClosingDay(account_id)) == closingDay) {
    logger.debug("nothing to do since nothing would change");
    return;
  }
  const client = await getTransactionClient();
  try {
    logger.debug("shifting all subscription to end on ", closingDay);
    await shiftAllSubscriptionsToEndOnDay(account_id, closingDay, client);
    logger.debug("setting close day to ", closingDay);
    await setClosingDay(account_id, closingDay, client);
    logger.debug("commit transaction");
    await client.query("COMMIT");
  } catch (err) {
    logger.debug("error -- ", err, " so rolling back transaction");
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
