/*
Create a stripe checkout session for this user.

See https://stripe.com/docs/api/checkout/sessions

!!!!!WARNING!!!!! Maybe this isn't used anymore?!  See also server/purchases/stripe/get-checkout-session.ts !
*/

import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getLogger from "@cocalc/backend/logger";
import type { Stripe } from "stripe";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import { MAX_COST } from "@cocalc/util/db-schema/purchases";
import { currency } from "@cocalc/util/misc";
import type { LineItem } from "@cocalc/util/stripe/types";
import { getStripeCustomerId, sanityCheckAmount } from "./stripe/util";
import { decimalToStripe } from "@cocalc/util/stripe/calc";

const MINIMUM_STRIPE_TRANSACTION = 0.5; // Stripe requires transactions to be at least $0.50.
const logger = getLogger("purchases:create-stripe-checkout-session");

interface Options {
  account_id: string;
  line_items: Array<LineItem>;
  success_url: string;
  cancel_url?: string;
  force?: boolean; // if true and there's an existing session, discard it instead of throwing an error; also allow payments less than the minimum
  token?: string; // if this is for a token action, this is the token; will be set in metadata, and when payment is processed, the token has the paid field of the description.
}

export const createStripeCheckoutSession = async (
  opts: Options,
): Promise<Stripe.Checkout.Session> => {
  const { account_id, cancel_url, force, line_items, success_url, token } =
    opts;
  logger.debug("createStripeCheckoutSession", opts);

  const cartTotal = line_items.reduce(
    (total, line_item) => total + line_item.amount,
    0,
  );

  // check if there is already a stripe checkout session; if so throw error.
  if (!force && (await getCurrentSession(account_id)) != null) {
    throw Error("there is already an active stripe checkout session");
  }

  if (!force) {
    await sanityCheckAmount(cartTotal);
  } else {
    // Conform to minimum Stripe transaction amount
    if (!cartTotal || cartTotal < MINIMUM_STRIPE_TRANSACTION) {
      line_items.push({
        amount: MINIMUM_STRIPE_TRANSACTION - cartTotal,
        description: "Minimum payment processor transaction charge",
      });
    }
  }

  // Session validation
  if (cartTotal > MAX_COST) {
    throw Error(
      `Amount exceeds the maximum allowed amount of ${currency(MAX_COST)}. Please contact support.`,
    );
  }
  if (line_items.some((item) => !item.description?.trim())) {
    throw Error("all line item descriptions must be nontrivial");
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
    line_items: line_items.map((item) => ({
      price_data: {
        unit_amount: decimalToStripe(item.amount), // stripe uses pennies not dollars.
        currency: "usd",
        product_data: {
          name: item.description,
        },
      },
      quantity: 1,
    })),
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
//     automatic_tax: {
//       enabled: true,
//     },
    customer_update: {
      address: "auto",
      name: "auto",
      shipping: "auto",
    },
  });
  await setStripeCheckoutSession({ account_id, session });
  return session;
};

export const setStripeCheckoutSession = async ({ account_id, session }) => {
  const db = getPool();
  await db.query(
    "UPDATE accounts SET stripe_checkout_session=$2 WHERE account_id=$1",
    [account_id, { id: session.id, url: session.url }],
  );
};

const getSession = async (
  session_id: string,
): Promise<Stripe.Checkout.Session> => {
  const stripe = await getConn();
  return await stripe.checkout.sessions.retrieve(session_id);
};

const getSessionStatus = async (
  session_id: string,
): Promise<"open" | "complete" | "expired" | null> => {
  const session = await getSession(session_id);
  return session.status;
};

export const getCurrentSession = async (
  account_id: string,
): Promise<{ id: string; url: string } | undefined> => {
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
};

export const cancelCurrentSession = async (account_id: string) => {
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
};

export default createStripeCheckoutSession;
