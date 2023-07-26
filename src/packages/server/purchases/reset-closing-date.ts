/*

API-accessible endpoint to set the closing day to today, or if the current day
is >= 29, then set it to 28. Calling this:

- computes the new statement day, which is today or at most the 28th, as mentioned above.
- shifts all subscription periods so they end on this date
- within the next few hours, the system will creates a new statement for the user for 
  all outstanding subscriptions and charges, if any (prorating subscription costs); this
  is just done automatically as part of the normal process.

NOTES: 

- We follow stripe https://stripe.com/docs/billing/subscriptions/billing-cycle#api-now
  and "when you reset the billing cycle, the customer is invoiced immediately", to avoid
  potential issues with users playing games moving the billing cycle forward right 
  when they are about to pay, etc.  We don't actually invoice *immediately*, but it will
  happen within a few hours.

- We do not allow changing your closing day if you don't have automatic payments enabled,
  since maybe that leads to an attack vector (?).
*/

import { getTransactionClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getClosingDay, setClosingDay } from "./closing-date";
import { hasUsageSubscription } from "./stripe-usage-based-subscription";
import shiftAllSubscriptionsToEndOnDay from "./shift-subscriptions";

const logger = getLogger("purchase:reset-closing-date");

export async function resetClosingDate(account_id: string) {
  logger.debug("resetClosingDate for ", account_id);
  if (!(await hasUsageSubscription(account_id))) {
    throw Error(
      `${account_id} does not have automatic billing setup so can't change their closing date`
    );
  }
  const today = new Date();
  const closingDay = Math.min(28, today.getDate());
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
