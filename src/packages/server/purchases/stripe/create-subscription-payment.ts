import getLogger from "@cocalc/backend/logger";
import { getStripeCustomerId } from "./util";
import getPool from "@cocalc/database/pool";
import { SUBSCRIPTION_RENEWAL } from "@cocalc/util/db-schema/purchases";
import { isValidUUID } from "@cocalc/util/misc";
import dayjs from "dayjs";
import { ALLOWED_SLACK } from "@cocalc/server/purchases/shopping-cart-checkout";
import editLicense from "@cocalc/server/purchases/edit-license";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import createPaymentIntent from "./create-payment-intent";
import send from "@cocalc/server/messages/send";

const logger = getLogger("purchases:stripe:create-subscription-payment");

export default async function createSubscriptionPayment({
  account_id,
  subscription_id,
  return_url,
}: {
  account_id: string;
  subscription_id: number;
  return_url?;
}) {
  logger.debug("createSubscriptionPayment", { account_id, subscription_id });

  const customer = await getStripeCustomerId({ account_id, create: true });
  if (!customer) {
    throw Error("Unable to get stripe customer id");
  }

  logger.debug("createSubscriptionPayment -- ", { customer });
  const client = getPool();
  const { rows: subscriptions } = await client.query(
    "SELECT payment, cost, metadata, interval FROM subscriptions WHERE account_id=$1 AND id=$2",
    [account_id, subscription_id],
  );
  if (subscriptions.length == 0) {
    throw Error(`You do not have a subscription with id ${subscription_id}.`);
  }
  const {
    payment,
    cost: amount,
    metadata,
    interval,
  } = subscriptions[0] as Subscription;
  if (payment != null && payment.status == "active") {
    throw Error(
      "There is a current outstanding active payment -- either cancel it or pay it",
    );
  }

  if (metadata?.type != "license" || !isValidUUID(metadata.license_id)) {
    throw Error("subscription must be for a license");
  }
  const { license_id } = metadata ?? {};
  const { rows: licenses } = await client.query(
    "SELECT expires FROM site_licenses WHERE id=$1",
    [license_id],
  );
  if (licenses.length == 0) {
    throw Error(
      `subscription must be for a valid license, but there isn't one with id ${metadata.license_id}`,
    );
  }
  let start = new Date(licenses[0].expires);
  const now = new Date();
  if (start < now) {
    start = now;
  }
  const new_expires_ms = addInterval(start, interval).valueOf();

  const lineItems = [
    { description: `Renew subscription Id=${subscription_id}`, amount },
  ];
  const { payment_intent: payment_intent_id, hosted_invoice_url } =
    await createPaymentIntent({
      account_id,
      purpose: SUBSCRIPTION_RENEWAL,
      description: "Renew a subscription",
      lineItems,
      return_url,
      metadata: {
        subscription_id: `${subscription_id}`,
      },
    });

  const payment1 = {
    payment_intent_id,
    subscription_id,
    amount,
    created: Date.now(),
    status: "active",
    new_expires_ms,
  };

  await client.query("UPDATE subscriptions SET payment=$1 WHERE id=$2", [
    payment1,
    subscription_id,
  ]);

  await sendSubscriptionPaymentMessage({
    account_id,
    hosted_invoice_url,
    subscription_id,
  });
}

async function sendSubscriptionPaymentMessage({
  account_id,
  subscription_id,
  hosted_invoice_url,
}) {
  await send({
    to_ids: [account_id],
    subject: `Subscription Renewal: Id ${subscription_id}`,
    body: `Invoice: ${hosted_invoice_url}`,
  });
}

export async function processSubscriptionRenewal({
  account_id,
  paymentIntent,
  amount,
}) {
  const { subscription_id } = paymentIntent?.metadata ?? {};
  logger.debug("processSubscriptionRenewal", {
    account_id,
    amount,
    subscription_id,
  });
  const client = getPool();
  const { rows: subscriptions } = await client.query(
    "SELECT payment, cost, metadata, interval FROM subscriptions WHERE account_id=$1 AND id=$2",
    [account_id, parseInt(subscription_id)],
  );
  if (subscriptions.length == 0) {
    throw Error(`You do not have a subscription with id ${subscription_id}.`);
  }
  const { payment, cost, metadata, interval } = subscriptions[0];
  const { license_id } = metadata ?? {};
  logger.debug("processSubscriptionRenewal", {
    payment,
    cost,
    metadata,
    interval,
    license_id,
  });
  if (amount + ALLOWED_SLACK <= cost) {
    logger.debug("processSubscriptionRenewal: SUSPICIOUS! -- not doing it.");
    throw Error(
      `subscription costs a lot more than payment -- contact support.`,
    );
  }

  const end = new Date(payment.new_expires_ms);

  logger.debug(
    "processSubscriptionRenewal: extend the license to payment.new_expires_ms",
  );
  const { purchase_id } = await editLicense({
    account_id,
    license_id,
    changes: { end },
    cost,
    note: "This is a subscription with a fixed cost per period.",
    isSubscriptionRenewal: true,
    force: true,
  });

  logger.debug(
    "processSubscriptionRenewal: mark payment done, and update period",
  );
  payment.status = "paid";
  logger.debug(
    "UPDATE subscriptions SET payment=$5, status='active',current_period_start=$1,current_period_end=$2,latest_purchase_id=$3 WHERE id=$4",
    [
      subtractInterval(end, interval),
      end,
      purchase_id,
      subscription_id,
      payment,
    ],
  );
  await client.query(
    "UPDATE subscriptions SET payment=$5, status='active',current_period_start=$1,current_period_end=$2,latest_purchase_id=$3 WHERE id=$4",
    [
      subtractInterval(end, interval),
      end,
      purchase_id,
      subscription_id,
      payment,
    ],
  );
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
