/*
UPCOMING NOTIFICATIONS:
  For each subscription that has status not 'canceled' and current_period_end
  is within the next 7 days, send a message that the subscription will be renewed
  in two days.  Include a link to pay now for the renewal using the method of your
  choice, or to pause or edit the subscription.

CREATE PAYMENTS:
  For each subscription that has status not 'canceled' and current_period_end
  is within the next {RENEW_DAYS_BEFORE_END} days, and there isn't already a renewal process happening
  for that subscription, we do the following:

  - Create a payment intent for the amount to renew the subscription for the next
    period. The metadata says what this payment is for and what should happen
    when payment is processed.  If user has selected to pay from credit on file
    and they have enough to covert the entire renewal, subscription is immediately
    renewed using available credit.

  - Send message about subscription renewal payment.  Including invoice
    payment link from stripe in that message.


PROCESS PAYMENT:
  - When processed, add a 'subscription-credit' line item saying
    "this is for renewal of this subscription". Then create a
    "subscription-payment" service line item taking that money back.
  - Extend the expire date on the license (so it keeps working), and save the
    payment intent id with the license.
  - The frontend UI clearly surfaces this payment state, e.g., the
    displayed license, the subscription, and the payment display in the frontend
    UI should all reflect this status.  In particular, the UI should clearly show
    the grace period status to avoid confusion.
  - Users have an account setting to apply any balance on their account
    first toward subscriptions.


PAYMENT FOLLOW-UP:

  - If the payment intent is not actually paid, then the license expire date doesn't
    get updated and the license stops working. This doesn't require anybody doing anything
    and it just happens.  Thus there is never any danger about somebody using a big
    license and not paying for it.  There is no danger of abuse due to edits or refunds
    involving a subscription.  At this point, when processing the canceled payment
    intent we *do* also cancel the license, thus putting it in the right state
    to be resumed with a new closing date, etc., and avoiding any further automated
    attempts to collect money.   If the user wants to use the license, they just click
    a button to resume it and they are back to work.

  - In particular, if a user doesn't pay their monthly subscription for 90 days (say),
    then their license would have not worked during the last 90 days and we didn't
    try to charge them during the second two periods, and moreover their payment
    got canceled/expired.  They can start their canceled subscription, paying for a
    full subscription period at this point, and the billing day for this subscription
    changes to the day when they resume the subscription.

MANUAL PAYMENTS:

- User can manually pay for the next period of a subscription at
  any point in time by clicking a button.  This will make developing the above
  functionality easier, but also give users more clarity into what to
  expect and make it easier for them to plan.  This is also closely related to what
  is linked to in the reminder emails.     This button will also allow paying
  for the next period of a subscription manually using positive balance.

*/

import createSubscriptionPayment from "./stripe/create-subscription-payment";
import send, { url } from "@cocalc/server/messages/send";
import adminAlert from "@cocalc/server/messages/admin-alert";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { describeQuotaFromInfo } from "@cocalc/util/licenses/describe-quota";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import { moneyToCurrency } from "@cocalc/util/money";
import { RENEW_DAYS_BEFORE_END } from "@cocalc/util/db-schema/subscriptions";

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

You have a ${interval}ly subscription that will **automatically renew**.
If you do nothing you will be automatically billed two days from now,
and can continue using your subscription.  You can also cancel or
change your subscription:

[Manage Subscription](${await url(`/settings/subscriptions#id=${id}`)})

### Details

- ${interval == "month" ? "Monthly" : "Yearly"} Subscription (id=${
      id
    }) for ${moneyToCurrency(cost)}/${interval}
- ${await describeSubscription(metadata)}
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

async function describeSubscription(metadata): Promise<string> {
  if (!metadata) {
    return "";
  }
  if (metadata.type == "membership") {
    return `Membership (${metadata.class ?? "unknown"})`;
  }
  if (metadata.type != "license" || !metadata.license_id) {
    return "";
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "select info->'purchased' as purchased from site_licenses where id=$1",
    [metadata.license_id],
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
  //    - current_period_end is within the next RENEW_DAYS_BEFORE_END days, and
  //    - there isn't already an outstanding payment for this subscription
  const pool = getPool();
  const { rows } = await pool.query(
    `
  SELECT id as subscription_id, account_id FROM subscriptions WHERE
      status != 'canceled' AND
      current_period_end <= NOW() + interval '${RENEW_DAYS_BEFORE_END} days' AND
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
  }
}
