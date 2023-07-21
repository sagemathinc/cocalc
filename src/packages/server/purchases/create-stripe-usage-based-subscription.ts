/*
Create a stripe checkout session for a usage based subscription for this user.
*/

import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getLogger from "@cocalc/backend/logger";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import {
  getStripeCustomerId,
  getCurrentSession,
} from "./create-stripe-checkout-session";
import type { Stripe } from "stripe";

const logger = getLogger("purchases:create-stripe-checkout-session");

interface Options {
  account_id: string;
  success_url: string;
  cancel_url?: string;
}

export default async function createStripeUsageBasedSubscription(
  opts: Options
): Promise<Stripe.Checkout.Session> {
  const { account_id, success_url, cancel_url } = opts;
  const log = (...args) => {
    logger.debug("createStripeUsageBasedSubscription", ...args);
  };
  log(opts);

  // check if there is already a stripe checkout session; if so throw error.
  if ((await getCurrentSession(account_id)) != null) {
    throw Error("there is already an active stripe checkout session");
  }
  if (await hasUsageSubscription(account_id)) {
    throw Error("user already has a usage based subscription");
  }
  if (!(await isValidAccount(account_id))) {
    throw Error("account must be valid");
  }
  if (!success_url) {
    throw Error("success_url must be nontrivial");
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
  const db = getPool();
  await db.query(
    "UPDATE accounts SET stripe_checkout_session=$2 WHERE account_id=$1",
    [account_id, { id: session.id, url: session.url }]
  );
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
        product
      );
      // This isn't allowed -- have to do something manually in the stripe
      // web interface instead:
      // await stripe.products.del(PRODUCT_ID);
      throw Error("default_price must be a string");
    }
    priceIdCache.price_id = product.default_price;
    logger.debug(
      "Usage based pricing product exists with id ",
      priceIdCache.price_id
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

export async function hasUsageSubscription(account_id): Promise<boolean> {
  const db = getPool();
  const { rows } = await db.query(
    "SELECT stripe_usage_subscription FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length == 0) {
    throw Error(`no such account ${account_id}`);
  }
  return !!rows[0].stripe_usage_subscription;
}

export async function getUsageSubscriptions(account_id) {
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
    query: `metadata['account_id']:'${account_id}' AND metadata['service']:'credit'`,
  });
}
