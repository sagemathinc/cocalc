/*
For each active subscription, send emails, collect payments, and extend license end dates.
More precisely, the following should happen for all of the user's subscriptions.

- For each subscription whose "current_period_end" is at most X days from now, 
  and for which we have not sent an email, send an email that the subscription will be 
  renewed. The email contains:
     - statement about renewal of the subscription, including period and what sub is for.
     - link to renew the subscription -- when clicked that link will add enough credits
       if necessary then purchase the next period of the subscription
     - link to cancel the subscription -- when clicked link will set status of 
       subscription to canceled
     - support link

- Automatic attempt to renew: assuming the above email didn't trigger any user action (i.e., 
  the canceled or renewed), for each subscription whose current_period_end is at most Y days 
  from now, run the "edit license" function to extend the end date of the license and charge 
  the user.  The edit license will run, but with two changes:
     - the cost is past in.  The charge to the user is thus a prorated amount based on the 
       parameters of their subscription, not the current cost of editing the license (i.e., 
       they get a locked in rate).
     - if user has a credit card on file and insufficient funds in their account, an attempt 
       is made to charge their card.
     - if they don't have funds in their account to pay the charge, then their license 
       end date is updated with Z days of "grace period".   Send a second email reminder 
       with a link to pay, and include that the grace period is an additional Z days.

- For each subscription that hasn't been paid past the grace period, cancel that license
  and send an email saying that the subscription is now paused due to non-payment.   Provide 
  clear instructions on how they can reactivate their subscription, such as adding funds
  to their account.

NOTES:

- Related to the above, whenever the user signs into cocalc, if they have a
subscription that needs to be renewed within Y days, they will see a modal
asking them to pay and renew the subscription. Make sure this modal is very easy
to dismiss and not too obtrusive.

- In all cases above, provide an option within the renewal email or the user
sign-in page to easily change the license they get with their subscription plan,
if desired. Instead of cancelling, they can just pay less or more, or generally
make things more flexible

- I will make it so all subscriptions all have the same renewal date each month
by making that date be the user's statement date. I'm a little concerned that
this will itself cause confusion, since it makes the first charge less than
normal. This will make it so users receive exactly one initial email about their
upcoming subscription renewal.

- Fully revive the page listing "payment methods" on file for a user,
and allowing to select the default one or delete one. If you have a
subscription, you can be encouraged to have a payment method on file. 

*/

import { getServerSettings } from "@cocalc/server/settings/server-settings";
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchases:maintain-subscriptions");

export default async function maintainSubscriptions() {
  logger.debug("maintaining subscriptions");
  await updateStatus();
}

/*
Update the status field of all subscriptions.

- Set status to 'unpaid' for every subscription with status 'active' for which
  current_period_end is within subscription_maintenance.request days
  from right now.
- Set to 'past_due' every subscription with status 'unpaid' for which current_period_end
  is in the past.
- Set to 'canceled' every subscription with status 'unpaid' for which current_period_end
  is at least subscription_maintenance.grace days in the past.
*/
async function updateStatus() {
  const { subscription_maintenance } = await getServerSettings();
  logger.debug("updateStatus", subscription_maintenance);
  const pool = getPool();

  // active --> unpaid
  logger.debug(
    "updateStatus: active-->unpaid",
    await pool.query(
      `UPDATE subscriptions
   SET status = 'unpaid'
   WHERE status = 'active'
   AND current_period_end <= NOW() + INTERVAL '1' DAY * $1`,
      [subscription_maintenance.request ?? 6]
    )
  );

  // unpaid --> past_due
  logger.debug(
    "updateStatus: unpaid-->past_due",
    await pool.query(`UPDATE subscriptions
   SET status = 'past_due'
   WHERE status = 'unpaid'
   AND current_period_end <= NOW()`)
  );

  // past_due --> canceled
  logger.debug(
    "updateStatus: past_due-->canceled",
    await pool.query(
      `UPDATE subscriptions
   SET status = 'canceled'
   WHERE status = 'past_due'
   AND current_period_end < NOW() - INTERVAL '1' DAY * $1`,
      [subscription_maintenance.grace ?? 3]
    )
  );
}
