/*
Managing a Stripe usage-based subscription created via Stripe Checkout.

- creating a new subscription
- retrieving the subscription ID for a user
- retrieving a list of usage-based subscriptions for a user
- setting the subscription ID
- adding usage to a subscription.


This is basically a *hack* to provide a way to automatically collect
money from a user periodically.  The problem is that Stripe Checkout's
mode:'setup' requires figuring out exactly what payment methods to
support, which makes absolutely no sense at all.  See
             create-stripe-payment-method-session.ts
for more details.

The way this hack works is that we -- once and for all -- make a
product called "cocalc-automatic-billing" in stripe, if it doesn't
already exist.  This product costs exactly one penny and is metered,
so we can add any amount we want of it.

For each user there is a day d, once per month, when the following happens:

- A: we create their monthly statement, which shows their balance on this day
- B: we compute the cost to renew all of their active monthly (or yearly)
  subscriptions. These subscriptions should all be defined so that their
  renewal is on day d + 3.
- we add to the usage-based subscription the sum of the above amounts: A+B
- we update the subscription's billing_cycle_anchor to now as explained here
   https://stripe.com/docs/api/subscriptions/update
  which causes an immediate invoice of the subscription and crediting the
  user's account.
- if their account is credited with a credit coming from their usage-based
  subscription, we credit their account, then immediately renew their subscriptions.

Note that we assume 1 <= d+3 <= 28, so that d <= 25.  This provides plenty of
wiggle room in case the usage-based subscription fails.

If the user doesn't have a usage based subscription we still compute A,B, but
we also send the user an email encouraging them to sign in and add credit to
their account (if necessary) so that their subscriptions will renew.

NOTE: All currencies presented to the user are in US dollars, unfortunately,
as documented at https://stripe.com/docs/payments/checkout/present-local-currencies where
it says "Automatic currency conversion doesn’t apply for any Sessions with multi-currency
prices, subscriptions".
*/

import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getLogger from "@cocalc/backend/logger";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import { getStripeCustomerId } from "./stripe/util";
import {
  getCurrentSession,
  setStripeCheckoutSession,
} from "./create-stripe-checkout-session";
import type { Stripe } from "stripe";
import { delay } from "awaiting";
import { createCreditFromPaidStripePaymentIntent } from "./create-invoice";
import syncPaidInvoices from "./sync-paid-invoices";
import { isValidUUID } from "@cocalc/util/misc";
import dayjs from "dayjs";
import { moneyToStripe, toDecimal, type MoneyValue } from "@cocalc/util/money";

const logger = getLogger("purchases:stripe-usage-based-subscription");

interface Options {
  account_id: string;
  success_url: string;
  cancel_url?: string;
}

export async function createStripeUsageBasedSubscription(
  opts: Options,
): Promise<Stripe.Checkout.Session> {
  const { account_id, success_url, cancel_url } = opts;
  const log = (...args) => {
    logger.debug("createStripeUsageBasedSubscription", ...args);
  };
  log(opts);

  if (!success_url) {
    throw Error("success_url must be set");
  }
  // check if there is already a stripe checkout session; if so throw error.
  if ((await getCurrentSession(account_id)) != null) {
    throw Error("there is already an active stripe checkout session");
  }
  const curSubscription = await getUsageSubscription(account_id);
  if (curSubscription != null && !curSubscription.id.startsWith("card")) {
    throw Error("user already has an active usage-based subscription");
  }
  if (!(await isValidAccount(account_id))) {
    throw Error("account must be valid");
  }
  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: true });
  log({ customer });
  const price_id = await getPriceId();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    success_url,
    cancel_url,
    line_items: [
      {
        price: price_id,
      },
    ],
    client_reference_id: account_id,
    customer,
    customer_email:
      customer == null ? await getEmailAddress(account_id) : undefined,
    subscription_data: { metadata: { account_id, service: "credit" } },
    tax_id_collection: { enabled: true },
    automatic_tax: {
      enabled: true,
    },
    customer_update: {
      address: "auto",
      name: "auto",
      shipping: "auto",
    },
  });
  await setStripeCheckoutSession({ account_id, session });
  return session;
}

const PRODUCT_ID = "cocalc-automatic-billing";
const priceIdCache = { price_id: "" };
async function getPriceId(): Promise<string> {
  if (priceIdCache.price_id) {
    return priceIdCache.price_id;
  }
  const stripe = await getConn();
  try {
    const product = await stripe.products.retrieve(PRODUCT_ID);
    if (typeof product.default_price != "string") {
      logger.debug(
        "Usage based pricing product exists but is NOT valid.  This should never happen.  An admin probably has to manually delete the ",
        PRODUCT_ID,
        "product via the stripe console.",
        product,
      );
      // This isn't allowed -- have to do something manually in the stripe
      // web interface instead:
      // await stripe.products.del(PRODUCT_ID);
      throw Error("default_price must be a string");
    }
    priceIdCache.price_id = product.default_price;
    logger.debug(
      "Usage based pricing product exists with id ",
      priceIdCache.price_id,
    );
  } catch (err) {
    // create it:
    logger.debug("creating usage based pricing product...", err);
    const product = await stripe.products.create({
      name: "CoCalc Automatic Billing",
      id: PRODUCT_ID,
      statement_descriptor: "COCALC BILLING",
      url: "https://cocalc.com",
    });
    const price = await stripe.prices.create({
      unit_amount: 1,
      currency: "usd",
      recurring: { interval: "month", usage_type: "metered" },
      product: product.id,
    });
    await stripe.products.update(PRODUCT_ID, { default_price: price.id });
    priceIdCache.price_id = price.id;
  }
  return priceIdCache.price_id;
}

export async function cancelUsageSubscription(account_id: string) {
  const sub = await getUsageSubscription(account_id);
  if (sub == null) {
    // already disabled or disabled due to checks
    return;
  }
  // there is an active subscription -- let's cancel it in stripe, and
  // also nullify it in the database:
  const stripe = await getConn();
  await stripe.subscriptions.cancel(sub.id);
  await setUsageSubscription({ account_id, subscription_id: "" });
}

// Returns the usage subscription if it exists and is active.
// Otherwise, returns "null" and clears the entry the entry in the database.
// This always checks with stripe that the subscription exists and is
// currently active so do not call it too much.
export async function getUsageSubscription(account_id: string) {
  const db = getPool();
  const { rows } = await db.query(
    "SELECT stripe_usage_subscription, stripe_customer_id FROM accounts WHERE account_id=$1",
    [account_id],
  );
  if (rows.length == 0) {
    throw Error(`no such account ${account_id}`);
  }
  const { stripe_customer_id, stripe_usage_subscription } = rows[0];
  if (!stripe_usage_subscription) {
    return null;
  }

  const stripe = await getConn();

  if (stripe_usage_subscription.startsWith("card")) {
    // Deprecated LEGACY fallback until all users upgrade their card
    // on file to a stripe usage subscription...
    try {
      const card = await stripe.customers.retrieveSource(
        stripe_customer_id,
        stripe_usage_subscription,
      );
      return card;
    } catch (err) {
      if (err.code == "resource_missing") {
        // The card was deleted or canceled from stripe, so we delete it from our records.
        // If we don't do this, deleted/canceled cards can get replaced
        // in the "Automic Payments: Update Required" process.
        await setUsageSubscription({ account_id, subscription_id: "" });
        return null;
      }
    }
  }

  const subscription_id = rows[0].stripe_usage_subscription;
  try {
    const sub = await stripe.subscriptions.retrieve(subscription_id);
    if (sub.status != "active") {
      await setUsageSubscription({ account_id, subscription_id: "" });
      return null;
    }
    return sub;
  } catch (err) {
    if (err.statusCode == 404) {
      // 404 means the subscription just doesn't exist at all in stripe.
      // record that in database.
      await setUsageSubscription({ account_id, subscription_id: "" });
      return null;
    }
    throw err;
  }
}

// not used, but might be useful:
/*
async function getAllUsageSubscriptions(account_id) {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer)
    return {
      object: "search_result",
      data: [],
      has_more: false,
      next_page: null,
      url: "/v1/subscriptions/search",
    };
  const stripe = await getConn();
  return await stripe.subscriptions.search({
    query: `status:"active" AND metadata['account_id']:'${account_id}' AND metadata['service']:'credit'`,
  });
}
*/

export async function setUsageSubscription({
  account_id,
  subscription_id,
}: {
  account_id: string;
  subscription_id: string; // note: set to "" instead of null so that frontend will update properly; this is just a shortcoming in our changefeeds
}) {
  const pool = getPool();
  await pool.query(
    "UPDATE accounts SET stripe_usage_subscription=$1 WHERE account_id=$2",
    [subscription_id, account_id],
  );
}

// minimum of $1 or it is an error.  Stripe I think hardcodes a min of $0.50, so this
// gives us a little room.
export const MINIMUM_PAYMENT = 1;

// This puts in motion collecting money ASAP from the user for the given amount.
// For a credit card it's basically instant.  For other payment methods, I suppose
// it could take days (?).  There's of course no guarantee, even if it returns
// successfully without an error, that payment will ever arrive.
// NOTE: do not make this accessible to call via any api exposed to users.
export async function collectPayment({
  account_id,
  amount, // in dollars; is rounded up to pennies.
}: {
  account_id: string;
  amount: MoneyValue;
}) {
  const sub = await getUsageSubscription(account_id);
  if (sub == null) {
    throw Error("No active usage subscription -- please create a new one.");
  }
  let amountValue = toDecimal(amount);
  if (amountValue.lt(MINIMUM_PAYMENT)) {
    logger.debug(
      "collectPayment: increasing amount from ",
      amountValue.toNumber(),
      "to the min allowed amount of",
      MINIMUM_PAYMENT,
    );
    amountValue = toDecimal(MINIMUM_PAYMENT);
  }
  if (sub.object == "card") {
    // legacy fallback for credit cards
    await collectPaymentUsingCreditCard({
      account_id,
      amount: amountValue,
      card: sub,
    });
    return;
  }
  if (sub.object != "subscription") {
    throw Error("bug"); // for typescript
  }
  const subscription_item = sub.items.data[0]?.id;
  if (!subscription_item) {
    throw Error("Usage subscription is invalid -- please create a new one.");
  }
  const stripe = await getConn();
  const stripeAmount = moneyToStripe(amountValue);
  await stripe.subscriptionItems.createUsageRecord(subscription_item, {
    quantity: stripeAmount,
  });
  await stripe.subscriptions.update(sub.id, { billing_cycle_anchor: "now" });

  // if they pay soon, then create credit in our system.
  // Like below, this is ONLY relevant when webhooks aren't configured,
  // so basically for limited dev use.
  (async () => {
    try {
      for (const d of [10, 60, 180]) {
        if (await syncPaidInvoices(account_id)) {
          return;
        }
        await delay(1000 * d);
      }
    } catch (_) {}
  })();
}

export async function hasUsageSubscription(
  account_id: string,
): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT stripe_usage_subscription FROM accounts WHERE account_id=$1",
    [account_id],
  );
  if (rows.length == 0) {
    throw Error(`no such account ${account_id}`);
  }
  return !!rows[0].stripe_usage_subscription;
}

/*
Legacy function to collect money from user via a credit card.
This can get deleted when there are no more credit cards on file...
*/
async function collectPaymentUsingCreditCard({
  account_id,
  amount,
  card,
}: {
  account_id: string;
  amount: MoneyValue;
  card: any;
}) {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    throw Error("no stripe customer id");
  }
  const stripe = await getConn();
  const stripeAmount = moneyToStripe(amount);
  const intent = await stripe.paymentIntents.create({
    customer,
    amount: stripeAmount,
    currency: "usd",
    confirm: true,
    description: "Credit CoCalc Account",
    metadata: { account_id, service: "credit" },
    payment_method: card.id,
  });
  if (intent.status == "succeeded") {
    await createCreditFromPaidStripePaymentIntent(intent);
  } else {
    // if they pay soon, then create credit in our system.
    // This is ONLY relevant when webhooks aren't configured,
    // so basically for limited dev use.
    const { id } = intent;
    (async () => {
      try {
        for (const d of [10, 60, 180]) {
          await delay(1000 * d);
          const intent = await stripe.paymentIntents.retrieve(id);
          if (intent.status == "succeeded") {
            await createCreditFromPaidStripePaymentIntent(intent);
            return;
          }
        }
      } catch (_) {}
    })();
  }
}

/*
Sync stripe usage subscription only relevant in case webhooks aren't
working/configure/available.
*/

async function getUsageBasedSubscriptions(
  account_id: string,
  limit?: number,
  created?: Date, // greater than or equal to this date
): Promise<any[]> {
  logger.debug("getUsageBasedSubscriptions: account_id = ", account_id);
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    // not a customer, so they can't have any subscriptions.
    return [];
  }
  logger.debug("customer = ", account_id);
  const stripe = await getConn();
  const subs = await stripe.subscriptions.list({
    customer,
    limit,
    created:
      created != null
        ? { gte: Math.round(created.valueOf() / 1000) }
        : undefined,
  });
  return subs.data;
}

export async function syncUsageBasedSubscription(
  account_id: string,
): Promise<boolean> {
  const subs = await getUsageBasedSubscriptions(
    account_id,
    10,
    dayjs().subtract(1, "day").toDate(),
  );
  logger.debug(
    "syncUsageBasedSubscriptions: considering ",
    subs.length,
    "recently created subs",
  );
  for (const sub of subs) {
    const { account_id: x, service } = sub.metadata ?? {};
    if (isValidUUID(x) && service == "credit") {
      await setUsageSubscription({ account_id, subscription_id: sub.id });
      return true;
    }
  }
  return false;
}
