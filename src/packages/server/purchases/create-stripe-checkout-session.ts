/*
Create a stripe checkout session for this user.

See https://stripe.com/docs/api/checkout/sessions
*/

import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";
import stripeName from "@cocalc/util/stripe/name";
import { setStripeCustomerId } from "@cocalc/database/postgres/stripe";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getLogger from "@cocalc/backend/logger";
import type { Stripe } from "stripe";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import { MAX_COST } from "@cocalc/util/db-schema/purchases";
import { currency } from "@cocalc/util/misc";

const logger = getLogger("purchases:create-stripe-checkout-session");

interface Options {
  account_id: string;
  amount: number; // amount in US Dollars
  description: string;
  success_url: string;
  cancel_url?: string;
  force?: boolean; // if true and there's an existing session, discard it instead of throwing an error; also allow payments less than the minimum
  token?: string; // if this is for a token action, this is the token; will be set in metadata, and when payment is processed, the token has the paid field of the description.
}

export default async function createStripeCheckoutSession(
  opts: Options,
): Promise<Stripe.Checkout.Session> {
  let { amount } = opts;
  const { account_id, description, success_url, cancel_url, force, token } =
    opts;
  logger.debug("createStripeCheckoutSession", opts);

  // check if there is already a stripe checkout session; if so throw error.
  if (!force && (await getCurrentSession(account_id)) != null) {
    throw Error("there is already an active stripe checkout session");
  }

  if (!force) {
    const { pay_as_you_go_min_payment } = await getServerSettings();
    if (!amount || amount < pay_as_you_go_min_payment) {
      throw Error(`amount must be at least $${pay_as_you_go_min_payment}`);
    }
  } else {
    // has to be at least $0.50 due to stripe rules.
    if (!amount || amount < 0.5) {
      amount = 0.5;
    }
  }
  if (amount > MAX_COST) {
    throw Error(
      `Amount exceeds the maximum allowed amount of ${currency(MAX_COST)}. Please contact support.`,
    );
  }
  if (!description?.trim()) {
    throw Error("description must be nontrivial");
  }
  if (!(await isValidAccount(account_id))) {
    throw Error("account must be valid");
  }
  if (!success_url) {
    throw Error("success_url must be nontrivial");
  }
  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: true });
  logger.debug("createStripeCheckoutSession", { customer });
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url,
    cancel_url,
    line_items: [
      {
        price_data: {
          unit_amount: Math.round(100 * amount), // stripe uses pennies not dollars.
          currency: "usd",
          product_data: {
            name: description,
          },
        },
        quantity: 1,
      },
    ],
    client_reference_id: account_id, // not sure we'll use this, but it's a good double check
    customer,
    customer_email:
      customer == null ? await getEmailAddress(account_id) : undefined,
    invoice_creation: {
      enabled: true,
      invoice_data: {
        metadata: {
          account_id,
          service: "credit",
          ...(token != null ? { token } : undefined),
        },
      },
    },
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

export async function setStripeCheckoutSession({ account_id, session }) {
  const db = getPool();
  await db.query(
    "UPDATE accounts SET stripe_checkout_session=$2 WHERE account_id=$1",
    [account_id, { id: session.id, url: session.url }],
  );
}

export async function getStripeCustomerId({
  account_id,
  create,
}: {
  account_id: string;
  create: boolean;
}): Promise<string | undefined> {
  const db = getPool();
  const { rows } = await db.query(
    "SELECT stripe_customer_id FROM accounts WHERE account_id=$1",
    [account_id],
  );
  const stripe_customer_id = rows[0]?.stripe_customer_id;
  if (stripe_customer_id) {
    logger.debug(
      "getStripeCustomerId",
      "customer already exists",
      stripe_customer_id,
    );
    return stripe_customer_id;
  }
  if (create) {
    return await createStripeCustomer(account_id);
  } else {
    return undefined;
  }
}

async function createStripeCustomer(account_id: string): Promise<string> {
  logger.debug("createStripeCustomer", account_id);
  const db = getPool();
  const { rows } = await db.query(
    "SELECT email_address, first_name, last_name FROM accounts WHERE account_id=$1",
    [account_id],
  );
  if (rows.length == 0) {
    throw Error(`no account ${account_id}`);
  }
  const email = rows[0].email_address;
  const description = stripeName(rows[0].first_name, rows[0].last_name);
  const stripe = await getConn();
  const { id } = await stripe.customers.create({
    description,
    name: description,
    email,
    metadata: {
      account_id,
    },
  });
  logger.debug("createStripeCustomer", "created ", {
    id,
    description,
    email,
    account_id,
  });
  await setStripeCustomerId(account_id, id);
  return id;
}

async function getSession(
  session_id: string,
): Promise<Stripe.Checkout.Session> {
  const stripe = await getConn();
  return await stripe.checkout.sessions.retrieve(session_id);
}

async function getSessionStatus(
  session_id: string,
): Promise<"open" | "complete" | "expired" | null> {
  const session = await getSession(session_id);
  return session.status;
}

export async function getCurrentSession(
  account_id: string,
): Promise<{ id: string; url: string } | undefined> {
  const db = getPool();
  const { rows } = await db.query(
    "SELECT stripe_checkout_session FROM accounts WHERE account_id=$1",
    [account_id],
  );
  if (rows.length == 0) {
    throw Error(`no such account ${account_id}`);
  }
  const session = rows[0].stripe_checkout_session;
  if (!session?.id) return;
  const status = await getSessionStatus(session.id);
  if (status != "open") {
    // We use {} instead of NULL due to shortcomings in changefeeds, since we want
    // changing this to update the frontend state.
    await db.query(
      "UPDATE accounts SET stripe_checkout_session='{}' WHERE account_id=$1",
      [account_id],
    );
    return undefined;
  }
  return session;
}

export async function cancelCurrentSession(account_id: string) {
  const session = await getCurrentSession(account_id);
  if (session == null) {
    // no session to cancel
    return;
  }
  const stripe = await getConn();
  await stripe.checkout.sessions.expire(session.id);
  // this clears stripe_checkout_session in the database, unless a new session appeared.
  const session2 = await getCurrentSession(account_id);
  if (session2?.id == session.id) {
    // a new one could have been created
    throw Error("failed to delete stripe checkout session");
  }
  // it worked :-)
}
