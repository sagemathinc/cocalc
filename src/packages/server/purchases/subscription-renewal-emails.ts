/*
Periodically send emails out to users that active subscriptions will renew soon.

USER FRIENDLY: The emails contain a 1-click link to cancel a subscription.
*/

import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import {
  currency,
  plural,
  is_valid_email_address as isValidEmailAddress,
} from "@cocalc/util/misc";
import { getUser } from "./statements/email-statement";
import { getTotalBalance } from "./get-balance";
import { getUsageSubscription } from "./stripe-usage-based-subscription";
import { describeQuotaFromInfo } from "@cocalc/util/licenses/describe-quota";
import { cancelSubscription } from "@cocalc/server/token-actions/create";
import sendEmail from "@cocalc/server/email/send-email";
import getLogger from "@cocalc/backend/logger";
import siteURL from "@cocalc/server/settings/site-url";

const logger = getLogger("purchases:subscription-renewal-emails");

interface Subscription {
  id: number;
  account_id: string;
  cost: number;
  current_period_end: Date;
  metadata;
  interval: "month" | "year";
}

export default async function sendSubscriptionRenewalEmails() {
  const subscriptionsByAccount = await getRelevantSubscriptions();
  for (const account_id in subscriptionsByAccount) {
    try {
      await sendSubscriptionRenewalEmail(
        account_id,
        subscriptionsByAccount[account_id]
      );
    } catch (err) {
      console.trace(err);
      logger.debug(
        `WARNING -- failed to send subscription renewal email: ${err}`,
        {
          account_id,
        }
      );
    }
  }
}

async function sendSubscriptionRenewalEmail(account_id, subs: Subscription[]) {
  logger.debug("sendSubscriptionRenewalEmail", { account_id, subs });
  const { help_email, site_name: siteName } = await getServerSettings();
  const { name, email_address: to } = await getUser(account_id);
  if (!isValidEmailAddress(to)) {
    throw Error(`no valid email address on file for ${name} -- got '${to}'`);
  }
  const subject = `${siteName} Subscription Renewals`;

  const totalBalance = await getTotalBalance(account_id);
  let cost = 0;
  for (const sub of subs) {
    cost += sub.cost ?? 0;
  }
  const usageSub = await getUsageSubscription(account_id);

  let pay = `Your account balance, including all pending transactions, is ${currency(
    totalBalance
  )}. `;
  if (totalBalance - cost < 0) {
    const amount = currency(Math.abs(totalBalance - cost));
    if (usageSub) {
      pay += ` You have automatic payments set up, and might be charged at least ${amount} in the next few days.`;
    } else {
      pay += ` Be sure to add at least ${amount} to your account to maintain your subscriptions
so they are not automatically canceled.   You will receive a reminder email in a few days with your next statement.`;
    }
  } else {
    pay += ` You have plenty of money in your account to cover these subscriptions.`;
  }

  let subscriptionList: string[] = [];
  for (const sub of subs) {
    subscriptionList.push(
      `<li>${sub.interval == "month" ? "Monthly" : "Yearly"} Subscription (id=${
        sub.id
      }) for ${currency(sub.cost)}/${sub.interval}: ${await describeLicense(
        sub.metadata?.license_id
      )} ${await cancelSubscriptionLink(sub.id)}</li>`
    );
  }

  const html = `
Hello ${name},

<br/><br/>

You have ${subs.length} ${siteName} ${plural(
    subs.length,
    "subscription"
  )} that will renew soon:

<br/><br/>

<ul>
${subscriptionList.join("\n")}
</ul>
NOTE: You can easily cancel any subscription by clicking the link above without having to sign in to ${siteName}.

<br/><br/>

${pay}

<br/><br/>

Visit
${await siteURL()}/settings/subscriptions to browse all of your subscriptions,
resume any that you have canceled, or easily edit any subscription
if you need more or less resources.  If you have any questions, reply
to this email to create a support request.

`;
  await sendEmail({ from: help_email, to, subject, html, text: html }); // TODO: lazy regarding text!

  const pool = getPool();
  await pool.query(
    "UPDATE subscriptions SET renewal_email=NOW() WHERE id=ANY($1)",
    [subs.map((x) => x.id)]
  );
}

async function describeLicense(license_id: string): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select info->'purchased' as purchased from site_licenses where id=$1",
    [license_id]
  );
  if (rows.length == 0) {
    return "";
  }
  return describeQuotaFromInfo(rows[0].purchased);
}

async function cancelSubscriptionLink(
  subscription_id: number
): Promise<string> {
  const url = await cancelSubscription(subscription_id);
  return ` <a href="${url}">(cancel)</a>`;
}

/*
Let request be a positive integer (it's subscription_maintenance.request).
Get the columns id, accont_id, cost, current_period_end, status and renewal_email for
each subscription sub for which:
   - sub.current_period_end in the future,
   - sub.current_period_end is within request days from now,
   - sub.renewal_email is null or is greater than request days in the past
   - sub.status is not "canceled"

The relevant parts the the database schemas:

smc=# \d subscriptions
                                             Table "public.subscriptions"
        Column        |            Type             | Collation | Nullable |                  Default
----------------------+-----------------------------+-----------+----------+-------------------------------------------
 id                   | integer                     |           | not null | nextval('subscriptions_id_seq'::regclass)
 account_id           | uuid                        |           |          |
 cost                 | real                        |           |          |
 current_period_end   | timestamp without time zone |           |          |
 status               | text                        |           |          |
 renewal_email        | timestamp without time zone |           |          |

After getting the results, combine the together by account_id, creating a map

{[account_id]: Subscription[]}

from account_id to an array of subscriptions as specified above.

*/
async function getRelevantSubscriptions() {
  const { subscription_maintenance } = await getServerSettings();
  const request = subscription_maintenance.request ?? 6;
  const pool = getPool(); // pg pool

  const query = `
    SELECT id, account_id, cost, current_period_end, metadata, interval
    FROM subscriptions
    WHERE
      current_period_end > NOW() AND
      current_period_end <= NOW() + INTERVAL '${request} days' AND
      (renewal_email IS NULL OR renewal_email < NOW() - INTERVAL '${request} days') AND
      status != 'canceled'
  `;

  const { rows } = await pool.query(query);

  const subscriptionsByAccount: {
    [account_id: string]: Subscription[];
  } = {};

  for (const row of rows) {
    const { account_id, ...subscription } = row;
    if (account_id in subscriptionsByAccount) {
      subscriptionsByAccount[account_id].push(subscription);
    } else {
      subscriptionsByAccount[account_id] = [subscription];
    }
  }

  return subscriptionsByAccount;
}
