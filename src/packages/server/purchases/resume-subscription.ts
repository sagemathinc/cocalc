/*
Resume a canceled membership subscription, which does all of the following in a single ATOMIC transaction.

- Changes the status of the subscription to active, so it'll get renewed each month.
- Sets the current_period_start/end dates for the subscription with current_period_start=midnight today.
  and current_period_end an interval (='month' or 'year') from now.
*/

import { getTransactionClient } from "@cocalc/database/pool";
import { getSubscription, addInterval } from "./renew-subscription";
import dayjs from "dayjs";
import send, { support, url, name } from "@cocalc/server/messages/send";
import {
  type MembershipClass,
  RENEW_DAYS_BEFORE_END,
} from "@cocalc/util/db-schema/subscriptions";
import adminAlert from "@cocalc/server/messages/admin-alert";
import getBalance from "./get-balance";
import createPurchase from "./create-purchase";
import { toDecimal } from "@cocalc/util/money";

interface Options {
  account_id: string;
  subscription_id: number;
}

export default async function resumeSubscription({
  account_id,
  subscription_id,
}: Options): Promise<number | null | undefined> {
  const { metadata, start, end, current_period_end, periodicCost, interval } =
    await getSubscriptionRenewalData(subscription_id);
  const client = await getTransactionClient();
  let purchase_id: number | undefined = undefined;
  try {
    if (current_period_end <= new Date()) {
      // make purchase, if needed
      purchase_id = await createPurchase({
        account_id,
        service: "membership",
        description: {
          type: "membership",
          subscription_id,
          class: metadata.class,
          interval,
        },
        client,
        cost: periodicCost,
        period_start: start,
        period_end: end,
      });

      if (purchase_id) {
        await client.query(
          "UPDATE subscriptions SET status='active', resumed_at=NOW(), current_period_start=$3, current_period_end=$4, latest_purchase_id=$5 WHERE id=$1 AND account_id=$2",
          [subscription_id, account_id, start, end, purchase_id],
        );
      } else {
        await client.query(
          "UPDATE subscriptions SET status='active', resumed_at=NOW(), current_period_start=$3, current_period_end=$4 WHERE id=$1 AND account_id=$2",
          [subscription_id, account_id, start, end],
        );
      }
    } else {
      // only have to change subscription status so it works again
      await client.query(
        "UPDATE subscriptions SET status='active', resumed_at=NOW() WHERE id=$1 AND account_id=$2",
        [subscription_id, account_id],
      );
    }

    await client.query("COMMIT");
    send({
      to_ids: [account_id],
      subject: `Subscription Id=${subscription_id} Successfully Resumed!`,
      body: `
You have successfully manually resumed subscription id=${subscription_id} which covers your ${metadata.type}

Your subscription will automatically renew ${RENEW_DAYS_BEFORE_END} days before ${end.toDateString()}.

- [Your Subscriptions](${await url(`/settings/subscriptions#id=${subscription_id}`)})

Thank you!

${await support()}`,
    });
    adminAlert({
      subject: `User manually resumed canceled subscription ${subscription_id}`,
      body: `
**Good news** - The user ${await name(account_id)} with account_id=${account_id}
has manually resumed their canceled subscription id=${subscription_id}.

You might want to check in with them.`,
    });

    // update user's displayed balance
    await getBalance({ account_id });

    return purchase_id;
  } catch (err) {
    await client.query("ROLLBACK");

    send({
      to_ids: [account_id],
      subject: `Subscription Id=${subscription_id} Failed to Resume`,
      body: `
An unexpected error happened when manually resuming your subscription with id=${subscription_id} for your ${metadata.type}

- [Your Subscriptions](${await url(`/settings/subscriptions#id=${subscription_id}`)})

- ERROR: ${err}

${await support()}`,
    });
    adminAlert({
      subject: `Unexpected error when user manually resumed canceled subscription ${subscription_id}`,
      body: `
PROBLEM: The user ${await name(account_id)} with account_id=${account_id} tried to manually resume
their canceled subscription id=${subscription_id}, but there was an unexpected
error. An admin should check in on this.

- ERROR: ${err}
`,
    });

    throw err;
  } finally {
    client.release();
  }
}

async function getSubscriptionRenewalData(subscription_id): Promise<{
  metadata: { type: "membership"; class: MembershipClass };
  start: Date;
  end: Date;
  periodicCost: number;
  current_period_end: Date;
  interval: "month" | "year";
}> {
  const {
    cost: currentCost,
    interval,
    metadata,
    status,
    current_period_end,
  } = await getSubscription(subscription_id);
  if (metadata?.type != "membership") {
    throw Error("subscription must be a membership");
  }
  if (status != "canceled") {
    throw Error(
      `You can only resume a canceled subscription, but this subscription is "${status}"`,
    );
  }
  const currentCostValue = toDecimal(currentCost ?? 0);
  let periodicCostValue = currentCostValue;
  const start = dayjs().startOf("day").toDate();
  const end = addInterval(start, interval);
  return {
    metadata,
    start,
    end,
    periodicCost: periodicCostValue.toNumber(),
    current_period_end,
    interval,
  };
}

export async function costToResumeSubscription(
  subscription_id,
): Promise<{ periodicCost: number; cost: number }> {
  const { periodicCost, current_period_end } =
    await getSubscriptionRenewalData(subscription_id);
  return {
    periodicCost,
    cost: current_period_end >= new Date() ? 0 : periodicCost,
  };
}
