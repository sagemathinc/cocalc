import { getServerSettings } from "@cocalc/server/settings/server-settings";
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import renewSubscription from "@cocalc/server/purchases/renew-subscription";

const logger = getLogger("purchases:maintain-subscriptions");

export default async function maintainSubscriptions() {
  logger.debug("maintaining subscriptions");
  try {
    await renewSubscriptions();
  } catch (err) {
    logger.debug("ERROR in renewSubscriptions- ", err);
  }
  try {
    await updateStatus();
  } catch (err) {
    logger.debug("ERROR in updateStatus - ", err);
  }
}

/*
For each subscription that has status not 'canceled' and current_period_end 
is in the past or within 1 day, renew that subscription.  Basically, we renew
subscriptions 1 day before they would automatically cancel for non-payment. 
We renew them here EVEN if that pushes the user's balance below the limit.

There's another maintenance task to actually cancel and refund the subscription
if the user doesn't pay.

Users can of course easily get almost any money spent via this automatic 
process  back by just canceling the subscription again.
*/
async function renewSubscriptions() {
  logger.debug("renewSubscriptions");
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT id, cost, account_id FROM subscriptions WHERE status != 'canceled' AND 
    current_period_end <= NOW() + INTERVAL '1' DAY`
  );
  logger.debug(
    "renewSubscriptions -- there are ",
    rows.length,
    "subscriptions that we will try to renew"
  );
  for (const { id: subscription_id, cost, account_id } of rows) {
    logger.debug("renewSubscriptions -- considering one:", {
      subscription_id,
      cost,
      account_id,
    });
    logger.debug("renewSubscriptions -- renewing subscription", {
      subscription_id,
    });
    await renewSubscription({ account_id, subscription_id, force: true });
  }
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
  logger.debug("updateStatus: active-->unpaid");
  await pool.query(
    `UPDATE subscriptions
   SET status = 'unpaid'
   WHERE status = 'active'
   AND current_period_end <= NOW() + INTERVAL '1' DAY * $1`,
    [subscription_maintenance.request ?? 6]
  );

  // unpaid --> past_due
  logger.debug("updateStatus: unpaid-->past_due");
  await pool.query(`UPDATE subscriptions
   SET status = 'past_due'
   WHERE status = 'unpaid'
   AND current_period_end <= NOW()`);

  // past_due --> canceled
  logger.debug("updateStatus: past_due-->canceled");
  await pool.query(
    `UPDATE subscriptions
   SET status = 'canceled'
   WHERE status = 'past_due'
   AND current_period_end < NOW() - INTERVAL '1' DAY * $1`,
    [subscription_maintenance.grace ?? 3]
  );
}

/*

This is a plan regarding how to automate payments:

I think what we need to do is simply empower users fully.  In particular, just make a section somewhere called "Automatic Payments".  A user can choose to configure this or not.  If they configure it:

- we [create a stripe usage-based subscription](https://www.phind.com/agent?cache=clk4hjfhp0007ml08nb36qh0z) for the user using stripe checkout.
- each month when we create their statement, if there is an amount due, we add that to their usage-based cost
- when renewing a subscription, we add that amount to their usage-based cost.  This happens several days before the subscription end date.
- we make sure that the cocalc subscriptions all end on the purchase_close_day
- we also make sure the stripe subscription is 2 days earlier -- https://www.phind.com/agent?cache=clk4i6jxp0016l308mrfuv799  -- via billing_cycle_anchor.
- when user pays their subscription the amount is credited to their account (via stripe webhook / sync)
- at the moment of renewal subscription cost always comes directly from user account in cocalc as usual.

If users do NOT have automatic payments, then instead of adding to their usage a few days earlier, we send them a link so they can add sufficient credit to their account to pay the subscription in any way they want.

-----

This was a plan at some point too:

For each active subscription, possibly do the following:

    send emails, collect payments, and extend license end dates.
  
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
