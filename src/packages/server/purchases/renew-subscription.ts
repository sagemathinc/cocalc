/*
Renewing a membership subscription creates a new purchase for the next period
and updates current_period dates and status.
*/

import getPool, { getTransactionClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import dayjs from "dayjs";
import type { Status } from "@cocalc/util/db-schema/subscriptions";
import { hoursInInterval } from "@cocalc/util/stripe/timecalcs";
import createPurchase from "./create-purchase";
import { toDecimal } from "@cocalc/util/money";

const logger = getLogger("purchases:renew-subscription");

interface Options {
  account_id: string;
  subscription_id: number;
}

export default async function renewSubscription({
  account_id,
  subscription_id,
}: Options): Promise<number | null | undefined> {
  // might not be a purchase in case there's no fee
  logger.debug({ account_id, subscription_id });
  const subscription = await getSubscription(subscription_id);
  if (subscription.account_id != account_id) {
    throw Error("you must be signed in as the owner of the subscription");
  }
  const { metadata, interval, current_period_end, cost } = subscription;
  if (metadata?.type != "membership") {
    throw Error("subscription must be a membership");
  }
  const end = addInterval(current_period_end, interval);

  // Use a transaction so we either edit license and update subscription or do nothing.
  const client = await getTransactionClient();
  try {
    const purchase_id = await createPurchase({
      account_id,
      service: "membership",
      description: {
        type: "membership",
        subscription_id,
        class: metadata.class,
        interval,
      },
      client,
      cost,
      period_start: subtractInterval(end, interval),
      period_end: end,
    });

    await client.query(
      "UPDATE subscriptions SET status='active',current_period_start=$1,current_period_end=$2,latest_purchase_id=$3 WHERE id=$4",
      [subtractInterval(end, interval), end, purchase_id, subscription_id],
    );
    await client.query("COMMIT");
    return purchase_id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// add the interval to the date.  The day of the month (and time) should be unchanged
export function addInterval(expires: Date, interval: "month" | "year"): Date {
  if (interval != "month" && interval != "year") {
    throw Error(`interval must be 'month' or 'year' but it is "${interval}"`);
  }
  let newExpires = dayjs(expires);
  return newExpires.add(1, interval).toDate();
}

function subtractInterval(expires: Date, interval: "month" | "year"): Date {
  if (interval != "month" && interval != "year") {
    throw Error(`interval must be 'month' or 'year' but it is "${interval}"`);
  }
  let newExpires = dayjs(expires);
  return newExpires.subtract(1, interval).toDate();
}

export function intervalContainingNow(
  end: Date,
  interval: "month" | "year",
): { start: Date; end: Date } {
  const now = new Date();
  // not being clever, since usually the interval needed is just 1 or 2 steps away.
  for (let i = 0; i < 1000; i++) {
    let start = subtractInterval(end, interval);
    if (start <= now && now <= end) {
      // now  is in this interval
      return { start, end };
    }
    if (now < start) {
      end = subtractInterval(end, interval);
    } else if (now > end) {
      end = addInterval(end, interval);
    }
  }
  throw Error(`bug in intervalContainingNow ${end} ${interval}`);
}

export const test = {
  addInterval,
  subtractInterval,
};

export async function getSubscription(subscription_id: number): Promise<{
  id: number;
  account_id: string;
  metadata: any;
  cost: number;
  cost_per_hour: number;
  interval: "month" | "year";
  current_period_end: Date;
  status: Status; // used externally (not in this file)
}> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, account_id, metadata, cost, interval, current_period_end, status FROM subscriptions WHERE id=$1",
    [subscription_id],
  );
  if (rows.length == 0) {
    throw Error(`no subscription with id=${subscription_id}`);
  }
  const costValue = toDecimal(rows[0]?.cost ?? 0);
  return {
    ...rows[0],
    cost: costValue.toNumber(),
    cost_per_hour: costValue.div(hoursInInterval(rows[0].interval)).toNumber(),
  };
}
