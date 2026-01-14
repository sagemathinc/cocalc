import getLogger from "@cocalc/backend/logger";
import { getStripeCustomerId } from "./util";
import getPool, { getTransactionClient } from "@cocalc/database/pool";
import { SUBSCRIPTION_RENEWAL } from "@cocalc/util/db-schema/purchases";
import { moneyRound2Down, moneyToCurrency, toDecimal } from "@cocalc/util/money";
import dayjs from "dayjs";
import { ALLOWED_SLACK } from "@cocalc/server/purchases/shopping-cart-checkout";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import createPaymentIntent from "./create-payment-intent";
import {
  USE_BALANCE_TOWARD_SUBSCRIPTIONS,
  USE_BALANCE_TOWARD_SUBSCRIPTIONS_DEFAULT,
} from "@cocalc/util/db-schema/accounts";
import getBalance from "@cocalc/server/purchases/get-balance";
import send, { support, url } from "@cocalc/server/messages/send";
import adminAlert from "@cocalc/server/messages/admin-alert";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { sendCancelNotification } from "../cancel-subscription";
import getConn from "@cocalc/server/stripe/connection";
import createPurchase from "@cocalc/server/purchases/create-purchase";

// nothing should ever be this small, but just in case:
const MIN_SUBSCRIPTION_AMOUNT = 1;

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
  const pool = getPool();
  const { rows: subscriptions } = await pool.query(
    "SELECT payment, cost, metadata, interval, current_period_end FROM subscriptions WHERE account_id=$1 AND id=$2",
    [account_id, subscription_id],
  );
  if (subscriptions.length == 0) {
    throw Error(`You do not have a subscription with id ${subscription_id}.`);
  }
  const {
    payment,
    cost: amountRaw,
    metadata,
    interval,
    current_period_end,
  } = subscriptions[0] as Subscription;
  const amountValue = toDecimal(amountRaw ?? 0);
  if (payment != null && payment.status == "active") {
    throw Error(
      "There is a current outstanding active payment -- either cancel it or pay it",
    );
  }

  if (metadata?.type != "membership") {
    throw Error("subscription must be for a membership");
  }
  const now = new Date();
  let start = new Date(current_period_end);
  if (start < now) {
    start = now;
  }
  const new_expires_ms = addInterval(start, interval).valueOf();

  const lineItems = [
    {
      description: `Renew subscription Id=${subscription_id}`,
      amount: amountValue.toNumber(),
    },
  ];

  let payNow = false;
  if (amountValue.lte(MIN_SUBSCRIPTION_AMOUNT)) {
    payNow = true;
  } else if (await useBalanceTowardSubscriptions(account_id)) {
    // The user has "Use Balance Toward Subscriptions" enabled.
    const balance = toDecimal(await getBalance({ account_id }));
    if (balance.gte(amountValue)) {
      payNow = true;
    }
  }

  const { site_name } = await getServerSettings();

  if (payNow) {
    // Instead of trying to charge their credit card (etc.), we just
    // directly extend their subscription for another period using credit
    // on their account, possibly going negative (in case of MIN_SUBSCRIPTION_AMOUNT).
    // If that happens, they will get billed some other way, or be required to fix
    // that in order to make future purchases.
    // completely pay with credit -- we just process the renewal assuming money is there already.

    const payment = {
      subscription_id,
      amount: amountValue.toNumber(),
      created: Date.now(),
      status: "active",
      new_expires_ms,
    };
    // we use one transaction so if anything goes awry, it is ALL rolled back.
    const client = await getTransactionClient();
    try {
      await client.query("UPDATE subscriptions SET payment=$1 WHERE id=$2", [
        payment,
        subscription_id,
      ]);
      await processSubscriptionRenewal({
        account_id,
        paymentIntent: { metadata: { subscription_id } },
        amount: amountValue.toNumber(),
        client,
      });
      // it worked -- so commit it
      client.query("COMMIT");
    } catch (err) {
      logger.debug("error renewing subscription", err);
      await client.query("ROLLBACK");
      adminAlert({
        subject: `${site_name} Subscription Renewal: Id ${subscription_id}`,
        body: `Something that should not happen has gone wrong renewing subscription id=${subscription_id} for account account_id=${account_id}.  CoCalc tried to pay for the subscription renewal entirely out of the user's balance, but something crashed.  Please look into this ASAP, so their service is not inerrupted. \n\n${err}`,
      });
      throw err;
    } finally {
      client.release();
    }
    // It worked! Tell the user.
    await send({
      to_ids: [account_id],
      subject: `${site_name} Subscription Renewal: Id ${subscription_id}`,
      body: `Your ${site_name} subscription (id=${subscription_id}) has been renewed for ${moneyToCurrency(amountValue)} using credit on your account.  Your subscription is now fully paid through ${new Date(new_expires_ms)}. \n\n- Account Balance: ${moneyToCurrency(
        moneyRound2Down(toDecimal(await getBalance({ account_id }))),
      )}`,
    });
    return;
  }

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
      force: true,
    });

  const payment1 = {
    payment_intent_id,
    subscription_id,
    amount: amountValue.toNumber(),
    created: Date.now(),
    status: "active",
    new_expires_ms,
  };

  await pool.query("UPDATE subscriptions SET payment=$1 WHERE id=$2", [
    payment1,
    subscription_id,
  ]);
  await send({
    to_ids: [account_id],
    subject: `${site_name} Subscription Renewal: Id ${subscription_id}`,
    body: `
${site_name} has started renewing your ${moneyToCurrency(amountValue)}/${interval} subscription (id=${subscription_id}).

- [Subscription Status](${await url(`/settings/subscriptions#id=${subscription_id}`)})

- Hosted Invoice: ${hosted_invoice_url}

- [All Payments](${await url("settings", "payments")})

- [All Purchases](${await url("settings", "purchases")})


${await support()}`,
  });
}

export async function processSubscriptionRenewal({
  account_id,
  paymentIntent,
  amount,
  client,
  force,
}: {
  account_id: string;
  paymentIntent: { metadata: { subscription_id: number | string } };
  amount: number;
  client?;
  force?: boolean;
}) {
  const { subscription_id } = paymentIntent?.metadata ?? {};
  logger.debug("processSubscriptionRenewal", {
    account_id,
    amount,
    subscription_id,
  });
  const amountValue = toDecimal(amount);
  client = client ?? getPool();
  const { rows: subscriptions } = await client.query(
    "SELECT payment, cost, metadata, interval FROM subscriptions WHERE account_id=$1 AND id=$2",
    [
      account_id,
      typeof subscription_id != "number"
        ? parseInt(subscription_id)
        : subscription_id,
    ],
  );
  if (subscriptions.length == 0) {
    throw Error(`You do not have a subscription with id ${subscription_id}.`);
  }
  const { cost, metadata, interval } = subscriptions[0];
  const costValue = toDecimal(cost);
  let { payment } = subscriptions[0];
  logger.debug("processSubscriptionRenewal", {
    payment,
    cost,
    metadata,
    interval,
  });
  if (metadata?.type != "membership") {
    throw Error("subscription must be for a membership");
  }
  if (!force && amountValue.add(ALLOWED_SLACK).lte(costValue)) {
    logger.debug("processSubscriptionRenewal: SUSPICIOUS! -- not doing it.");
    throw Error(
      `subscription costs a lot more than payment -- contact support.`,
    );
  }

  if (payment == null || (payment?.new_expires_ms ?? 0) < Date.now()) {
    // I've read through all the code and this "is" impossible, given
    // postgresql semantics, etc.  I also can't reproduce it by putting
    // in delays.   However, payment==null *did* happen in production
    // once, so we just do it manually in this case :-(
    // We also ensure new_expires_ms is in the future so the period update
    // happens for sure.
    // this code is same as resumeSubscriptionSetPaymentIntent below:
    const new_expires_ms = addInterval(
      new Date(),
      subscriptions[0].interval,
    ).valueOf();
    payment = { new_expires_ms };
  }

  const end = new Date(payment.new_expires_ms);

  const purchase_id = await createPurchase({
    account_id,
    service: "membership",
    description: {
      type: "membership",
      subscription_id:
        typeof subscription_id != "number"
          ? parseInt(subscription_id)
          : subscription_id,
      class: metadata.class,
      interval,
    },
    client,
    cost: costValue,
    period_start: subtractInterval(end, interval),
    period_end: end,
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

export async function useBalanceTowardSubscriptions(
  account_id: string,
): Promise<boolean> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    `SELECT other_settings#>>'{${USE_BALANCE_TOWARD_SUBSCRIPTIONS}}' as use_balance FROM accounts WHERE account_id=$1`,
    [account_id],
  );
  switch (rows[0]?.use_balance) {
    case "true":
      return true;
    case "false":
      return false;
    default:
      return USE_BALANCE_TOWARD_SUBSCRIPTIONS_DEFAULT;
  }
}

// We set payment status to canceled *and* cancel the subscription --
// user can resume it at current rates at a later date.
export async function processSubscriptionRenewalFailure({ paymentIntent }) {
  const { subscription_id } = paymentIntent?.metadata ?? {};
  if (!subscription_id) {
    throw Error(
      `invalid paymentIntent ${paymentIntent?.id} -- metadata must contain subscription_id`,
    );
  }
  const id =
    typeof subscription_id != "number"
      ? parseInt(subscription_id)
      : subscription_id;
  const pool = getPool();
  await pool.query(
    `UPDATE subscriptions SET payment = jsonb_set(payment, '{status}', '"canceled"'), status='canceled', canceled_at=NOW(), canceled_reason='The payment was canceled instead of being paid.' WHERE id=$1`,
    [id],
  );
  await sendCancelNotification({ subscription_id });
}

export async function processResumeSubscriptionFailure({ paymentIntent }) {
  await clearResumeSubscriptionPayment({ paymentIntent });
}

async function clearResumeSubscriptionPayment({ paymentIntent }) {
  const { subscription_id } = paymentIntent?.metadata ?? {};
  if (!subscription_id) {
    throw Error(
      `invalid paymentIntent ${paymentIntent?.id} -- metadata must contain subscription_id`,
    );
  }
  const id =
    typeof subscription_id != "number"
      ? parseInt(subscription_id)
      : subscription_id;
  const pool = getPool();
  await pool.query(
    `UPDATE subscriptions SET resume_payment_intent=NULL WHERE id=$1`,
    [id],
  );
}

export async function resumeSubscriptionSetPaymentIntent({
  subscription_id,
  paymentIntentId,
}: {
  subscription_id: number;
  paymentIntentId: string;
}) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT resume_payment_intent, interval FROM subscriptions WHERE id=$1",
    [subscription_id],
  );
  if (rows.length == 0) {
    throw Error(`no such subscription id=${subscription_id}`);
  }
  if (rows[0].resume_payment_intent) {
    const stripe = await getConn();
    const intent = await stripe.paymentIntents.retrieve(
      rows[0].resume_payment_intent,
    );
    if (intent.status != "canceled" && intent.status != "succeeded") {
      throw Error(
        `There is an outstanding payment to resume this subscription.  Pay that invoice or cancel it.`,
      );
    }
  }
  const new_expires_ms = addInterval(new Date(), rows[0].interval).valueOf();
  await pool.query(
    "UPDATE subscriptions SET resume_payment_intent=$2, payment=$3 WHERE id=$1",
    [subscription_id, paymentIntentId, { new_expires_ms }],
  );
}

export async function processResumeSubscription({
  account_id,
  paymentIntent,
  amount,
}) {
  await processSubscriptionRenewal({
    account_id,
    paymentIntent,
    amount,
    force: true,
  });
  await clearResumeSubscriptionPayment({ paymentIntent });
}
