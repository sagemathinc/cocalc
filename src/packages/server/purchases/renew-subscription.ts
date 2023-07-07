/*
Right now cocalc subscriptions are ONLY for licenses and nothing else.
Renewing a subscription means that two big things happen:

 - the license end date is increased by the period: 'month' or 'year'
 - a purchase is created to pay for that period.

Also, the current_period dates for the subscription are updated, and 
the status is active.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import dayjs from "dayjs";
import editLicense from "./edit-license";

const logger = getLogger("purchases:renew-subscription");

interface Options {
  account_id: string;
  subscription_id: number;
}

export default async function renewSubscription({
  account_id,
  subscription_id,
}: Options): Promise<number | null> {
  logger.debug({ account_id, subscription_id });
  const subscription = await getSubscription(subscription_id);
  if (subscription.account_id != account_id) {
    throw Error("you must be signed in as the owner of the subscription");
  }
  const { metadata, interval, current_period_end, cost } = subscription;
  if (metadata?.type != "license" || metadata.license_id == null) {
    throw Error("only license subscriptions are currently implemented");
  }
  const { license_id } = metadata;
  const end = addInterval(current_period_end, interval);
  const { purchase_id } = await editLicense({
    account_id,
    license_id,
    changes: { end },
    cost,
    note: "This is a subscription with a fixed cost per period.",
    isSubscriptionRenewal: true,
  });

  const pool = getPool();
  await pool.query(
    "UPDATE subscriptions SET status='active',current_period_start=$1,current_period_end=$2,latest_purchase_id=$3 WHERE id=$4",
    [subtractInterval(end, interval), end, purchase_id, subscription_id]
  );

  return purchase_id;
}

// add the interval to the date.  The day of the month (and time) should be unchanged
function addInterval(expires: Date, interval: "month" | "year"): Date {
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

export const test = {
  addInterval,
  subtractInterval,
};

async function getSubscription(subscription_id: number): Promise<{
  account_id: string;
  metadata: any;
  cost: number;
  interval: "month" | "year";
  current_period_end: Date;
}> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, metadata, cost, interval, current_period_end FROM subscriptions WHERE id=$1",
    [subscription_id]
  );
  if (rows.length == 0) {
    throw Error(`no subscription with id=${subscription_id}`);
  }
  return rows[0];
}

