/*
UPCOMING NOTIFICATIONS:
  For each subscription that has status not 'canceled' and current_period_end
  is within the next 7 days, send a message that the subscription will be renewed.
  Include a link to pay now for the renewal using the method of your choice, or
  to pause or edit the subscription.

CREATE PAYMENTS:
  For each subscription that has status not 'canceled' and current_period_end
  is within the next 48 hours, and there isn't already a renewal process happening
  for that subscription, we do the following:

  - Create a payment intent for the amount to renew the subscription for the next
    period. The metadata says what this payment is for and what should happen
    when payment is processed.  If user has selected to pay from credit on file
    and they have enough to covert the entire renewal, subscription is immediately
    renewed using available credit.

  - After successfully making the payment intent, extend the license so it does not
    expires 5 days from now (3 days after expire), as a free automatic grace
    period, since payments can take a while to complete.

      ABUSE POTENTIAL: this is slightly DANGEROUS!!  The user could maybe cancel everything and
      get a prorated refund on the license that would give them credit for these 3
      days.  It's not too dangerous though, since this only happens automatically
      on the subscription renewal and there is no way for the user to trigger it.
      We might want to not allow this...  We'll see.

  - Send message about subscription renewal payment.  Including invoice
    payment link from stripe in that message.

      - This email will say the license stops working at the expire date, but users
        can still use projects in a degraded way.


PROCESS PAYMENT:
  - When processed, add a 'subscription-credit' line item saying
    "this is for renewal of this subscription". Then create a
    "subscription-payment" service line item taking that money back.
  - Extend the expire date on the license (so it keeps working), and save the
    payment intent id with the license.
  - The frontend UI should also clearly surface this payment state, e.g., the
    displayed license, the subscription, and the payment display in the frontend
    UI should all reflect this status.  In particular, the UI should clearly show
    the grace period status to avoid confusion.
  - Users can have an account setting to apply any balance on their account
    first toward subscriptions.


PAYMENT FOLLOW-UP:

  - If the payment intent is not actually paid, then the license expire date doesn't
    get updated and the license stops working. This doesn't require anybody doing anything
    and it just happens.  Thus there is never any danger about somebody using a big
    license and not paying for it.  At the same time, users have a 3 day grace period
    in case they are slow to complete their payment.

  - In particular, if a user doesn't pay their monthly subscription for 90 days (say),
    then their license would have not worked during the last 90 days and we didn't
    try to charge them during the second two periods, and moreover their payment
    got cancelled/expired.   At this point, if they click "pay manually", then
    they can pay for the *next month* as usually and their subscription/license
    starts working again.  Policy: They must pay for a full subscription period
    at this point, and the billing day for this subscription changes to the day
    of reactivation.

MANUAL PAYMENTS:

- User can manually pay for the next period of a subscription at
  any point in time by clicking a button.  This will make developing the above
  functionality easier, but also give users more clarity into what to
  expect and make it easier for them to plan.  This is also closely related to what
  is linked to in the reminder emails.     This button will also allow paying
  for the next period of a subscription manually using positive balance.

SHIFT SUBSCRIPTION PERIOD:

- Similarly, provide a tool so a user can manually shift their subscription period.
  When they do this, they have to pay the prorated difference to make the shift,
  using our standard methods (min payment size, credit can be used).


*/

import createSubscriptionPayment from "./stripe/create-subscription-payment";
import send, { url } from "@cocalc/server/messages/send";
import adminAlert from "@cocalc/server/messages/admin-alert";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getPool, { getTransactionClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import renewSubscription from "@cocalc/server/purchases/renew-subscription";
import cancelSubscription from "./cancel-subscription";
import sendSubscriptionRenewalEmails from "./subscription-renewal-emails";
import { isEmailConfigured } from "@cocalc/server/email/send-email";
import { getPendingBalance } from "./get-balance";
import { describeQuotaFromInfo } from "@cocalc/util/licenses/describe-quota";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import { currency } from "@cocalc/util/misc";
import dayjs from "dayjs";

const logger = getLogger("purchases:maintain-subscriptions");

export default async function maintainSubscriptions() {
  logger.debug("maintaining subscriptions");
  try {
    await sendUpcomingRenewalNotifications();
  } catch (err) {
    logger.debug("nonfatal ERROR in sendUpcomingRenewalNotifications- ", err);
    adminAlert({
      subject: `ERROR in sendUpcomingRenewalNotifications`,
      body: err,
    });
  }
  try {
    await createPayments();
  } catch (err) {
    logger.debug("nonfatal ERROR in createPayments - ", err);
    adminAlert({
      subject: `nonfatal ERROR in createPayments`,
      body: err,
    });
  }
}

// UPCOMING NOTIFICATIONS (see above)

export async function sendUpcomingRenewalNotifications() {
  logger.debug("sendUpcomingRenewalNotifications");
  const { support_account_id: from_id, site_name } = await getServerSettings();
  if (from_id == null) {
    throw Error("configure the support account_id in admin settings.");
  }

  // Find each subscription that has status not 'canceled' and current_period_end
  // is within the next 7 days.

  const pool = getPool();
  const cutoff = "1 week";
  const query = `
    SELECT id, cost, interval, metadata, account_id
    FROM subscriptions
    WHERE
      status != 'canceled' AND
      current_period_end > NOW() AND
      current_period_end <= NOW() + INTERVAL '${cutoff}' AND
      (renewal_email IS NULL OR renewal_email < NOW() - INTERVAL '${cutoff}')
  `;
  const { rows } = await pool.query(query);
  logger.debug(
    "sendUpcomingRenewalNotifications -- ",
    rows.length,
    "subscriptions",
  );

  for (const { id, cost, interval, metadata, account_id } of rows) {
    const subject = `Upcoming ${site_name} Subscription Renewal - Id ${id}`;
    const { name } = await getUser(account_id);
    const body = `
Hello ${name},

You have a ${interval}ly subscription that will **automatically renew** in ${cutoff}.
If you do nothing you will be automatically billed and may continue using your subscription.  You can also make a payment right now, pay in a different way,
cancel, change or pause your subscription or modify the renewal date:

${url("subscriptions", id)}

### Details

- ${interval == "month" ? "Monthly" : "Yearly"} Subscription (id=${
      id
    }) for ${currency(cost)}/${interval}
- ${await describeLicense(metadata?.license_id)}
`;

    logger.debug("sendUpcomingRenewalNotifications to ", name);
    //console.log(subject, "\n", body);
    await send({ to_ids: [account_id], from_id, subject, body });
    await pool.query(
      "UPDATE subscriptions SET renewal_email=NOW() WHERE id=$1",
      [id],
    );
  }
}

async function describeLicense(license_id?: string): Promise<string> {
  if (!license_id) {
    return "";
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "select info->'purchased' as purchased from site_licenses where id=$1",
    [license_id],
  );
  if (rows.length == 0) {
    return "";
  }
  return describeQuotaFromInfo(rows[0].purchased);
}

// CREATE PAYMENTS (see above)

export async function createPayments() {
  logger.debug(
    "createPayments -- checking for subscriptions with payment due now...",
  );
  // Do a query for each subscription that:
  //    - has status not 'canceled', and
  //    - current_period_end is within the next 48 hours, and
  //    - there isn't already an outstanding payment for this subscription
  const pool = getPool();
  const { rows } = await pool.query(
    `
  SELECT id as subscription_id, account_id FROM subscriptions WHERE
      status != 'canceled' AND
      current_period_end <= NOW() + interval '48 hours' AND
      coalesce(payment#>>'{status}','') != 'active'
  `,
  );
  logger.debug(
    `createPayments -- got ${rows.length} unbilled subscriptions due now`,
  );
  for (const { subscription_id, account_id } of rows) {
    try {
      await createSubscriptionPayment({ subscription_id, account_id });
      logger.debug(
        `createPayments -- successfully billed subscription id ${subscription_id}`,
      );
    } catch (err) {
      adminAlert({
        subject: `ERROR billing subscription id ${subscription_id}`,
        body: err,
      });
      logger.debug(
        `createPayments -- ERROR billing subscription id ${subscription_id} -- ${err}`,
      );
    }
    await gracePeriod({
      subscription_id,
      until: dayjs().add(5, "days").toDate(),
    });
  }
}

export async function gracePeriod({
  subscription_id,
  until,
}: {
  subscription_id: number;
  until: Date;
}) {
  logger.debug("gracePeriod", { subscription_id, until });
  // Check to ensure the license does not expire until after "until".
  // It might have been renewed already by the time we get here.
  const pool = getPool();
  const { rows: subscriptions } = await pool.query(
    "SELECT metadata FROM subscriptions WHERE id=$1",
    [subscription_id],
  );
  const license_id = subscriptions[0]?.metadata?.license_id;
  if (!license_id) {
    logger.debug("gracePeriod: no license_id");
    return;
  }
  logger.debug("gracePeriod:", { license_id });
  const { rows: licenses } = await pool.query(
    "SELECT expires FROM site_licenses WHERE id=$1",
    [license_id],
  );
  if (licenses.length == 0) {
    logger.debug("gracePeriod: no such license", { license_id });
    return;
  }
  const expires = licenses[0].expires;
  if (expires == null) {
    logger.debug("gracePeriod: suspicious license - no expires set (?)", {
      license_id,
    });
    return;
  }
  if (expires < until) {
    logger.debug("gracePeriod: adding grace period to license.");
    await pool.query("UPDATE site_licenses SET expires=$1 WHERE id=$2", [
      until,
      license_id,
    ]);
  }
}

//////////////////////////////////

// DEPRCATED Everything below here was from the OLD VERSION

export async function maintainSubscriptions0() {
  logger.debug("maintaining subscriptions");
  try {
    await renewSubscriptions();
  } catch (err) {
    logger.debug("nonfatal ERROR in renewSubscriptions- ", err);
  }
  try {
    await updateStatus();
  } catch (err) {
    logger.debug("nonfatal ERROR in updateStatus - ", err);
  }
  try {
    await cancelAllPendingSubscriptions();
  } catch (err) {
    logger.debug("nonfatal ERROR in cancelAllPendingSubscriptions- ", err);
  }
  try {
    if (await isEmailConfigured()) {
      await sendSubscriptionRenewalEmails();
    }
  } catch (err) {
    logger.debug("nonfatal ERROR in sendSubscriptionRenewalEmails- ", err);
  }
}

async function renewSubscriptions() {
  logger.debug("renewSubscriptions");
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT id, cost, account_id FROM subscriptions WHERE status != 'canceled' AND
    current_period_end <= NOW() + INTERVAL '1' DAY`,
  );
  logger.debug(
    "renewSubscriptions -- there are ",
    rows.length,
    "subscriptions that we will try to renew",
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
    try {
      await renewSubscription({ account_id, subscription_id, force: true });
    } catch (err) {
      logger.debug(
        "renewSubscriptions -- nonfatal error renewing subscription",
        {
          subscription_id,
          err,
        },
      );
      if (test.failOnError) {
        throw err;
      }
    }
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
  is at least subscription_maintenance.grace days in the past.  Note that subscriptions
  normally get canceled via cancelOnePendingSubscription after a pending payment attempt
  fails.
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
    [subscription_maintenance.request ?? 6],
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
    [subscription_maintenance.grace ?? 3],
  );
}

/*
For each subscription for which the last payment has been pending
for at least `grace` days, cancel that subscription immediately
and provide a prorated refund.  Also, set the corresponding payment
to no longer be pending (most of it will be included in the refund).
*/

async function getGracePeriodDays(): Promise<number> {
  const { subscription_maintenance } = await getServerSettings();
  return subscription_maintenance?.grace ?? 3;
}

async function cancelAllPendingSubscriptions() {
  const grace = await getGracePeriodDays();

  const pool = getPool();
  const { rows } = await pool.query(
    `
SELECT account_id, id as purchase_id FROM purchases WHERE pending=true AND time <= NOW() - interval '${grace} days' AND service = 'edit-license'`,
  );
  logger.debug(
    "cancelPendingSubscriptions -- pending subscription purchases = ",
    rows,
  );
  for (const obj of rows) {
    try {
      await cancelOnePendingSubscription(obj);
    } catch (err) {
      logger.debug(
        "WARNING: cancelOnePendingSubscription failed",
        obj,
        `${err}`,
      );
      if (test.failOnError) {
        throw err;
      }
    }
  }
}

// [ ] TODO: send email when canceling a subscription/license this way
// with instructions to restart it?
async function cancelOnePendingSubscription({ account_id, purchase_id }) {
  // Do NOT both canceling any user subscription if their pending payments
  // total up to less than the pay as you go minimum (with a little slack).
  // This is because we don't automatically collect payments in such cases.
  // They might manually pay anyways, but we don't want to count on that.
  const pendingBalance = await getPendingBalance(account_id);
  const { pay_as_you_go_min_payment } = await getServerSettings();
  if (Math.abs(pendingBalance) <= pay_as_you_go_min_payment + 1) {
    // pandingBalance is actually <=0.
    return;
  }
  const client = await getTransactionClient();
  try {
    const subscription_id = await getSubscriptionWithPurchaseId(
      purchase_id,
      client,
    );
    await cancelSubscription({
      account_id,
      subscription_id,
      cancelImmediately: true,
      client,
    });
    await client.query("UPDATE purchases SET pending=false WHERE id=$1", [
      purchase_id,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Get the id of the subscription that was (or should be) paid for using the
// given purchase.
export async function getSubscriptionWithPurchaseId(
  purchase_id: number,
  client?,
): Promise<number> {
  const pool = client ?? getPool();
  // very easy case:
  const x = await pool.query(
    "SELECT id FROM subscriptions WHERE latest_purchase_id=$1",
    [purchase_id],
  );
  let subscription_id = x.rows[0]?.id;
  if (subscription_id) {
    logger.debug("getSubscriptionWithPurchaseId -- latest purchase works");
    return subscription_id;
  }
  // Unfortunately, we don't store that subscription id in the purchase itself,
  // which makes it extra work to local the subscription.  But we can get it this
  // way by using the metadata jsonb.  Basically the purchase description has the license_id
  // and the subscription metadata also has the same license id, and there is only one
  // subscription for a license.  I do select the newest subscription in case there is more
  // than one for the same license (should be impossible).
  logger.debug(
    "getSubscriptionWithPurchaseId -- use license_id metadata and a join",
  );
  const y = await pool.query(
    "SELECT subscriptions.id AS id FROM purchases,subscriptions WHERE (purchases.description#>>'{license_id}')::uuid=(subscriptions.metadata#>>'{license_id}')::uuid AND purchases.id=$1 ORDER BY subscriptions.created DESC",
    [purchase_id],
  );
  subscription_id = y.rows[0]?.id;
  if (subscription_id) {
    return subscription_id;
  }
  throw Error(`there is no subscription with purchase id ${purchase_id}`);
}

// This export is only to make some private functions in this file available for unit testing.
// Don't otherwise use or instead change those to explicit exports if needed for some reason.
export const test = {
  renewSubscriptions,
  updateStatus,
  cancelAllPendingSubscriptions,
  getGracePeriodDays,
  failOnError: false, // test mode can set this to true so that exceptions are fatal instead of just logged
};

/*

THE PREVIOUS WAYS WE AUTOMATED SUBSCRIPTIONS IN THE PAST.  Only relevant for better
understanding how to transition, I guess.

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
