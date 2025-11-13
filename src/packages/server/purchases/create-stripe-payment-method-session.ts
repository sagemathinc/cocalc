/*
Create a stripe checkout session with mode "setup" to setup things
for future *automatic payments*.

DOES NOT WORK.  This very bizarrely and stupidly doesn't work, because for
mode='setup' you have to specify the exact payment types you accept for
the given user... which makes absolutely no sense for us to do, since stripe
should be doing that, as it is a function of geographic location, etc.
This is really weird.  So we're switching back to a usage based subscription
hack, since that works.

NOTE: this is just the first step of implementing this, and we would also
need a webhook to finish it.

See:

 - https://stripe.com/docs/payments/save-and-reuse
 - https://stripe.com/docs/api/checkout/sessions
 - https://stripe.com/docs/api/payment_intents

*/

import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getLogger from "@cocalc/backend/logger";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import { getStripeCustomerId } from "./stripe/util";
import { getCurrentSession } from "./create-stripe-checkout-session";
import type { Stripe } from "stripe";

const logger = getLogger("purchases:create-stripe-payment-method-session");

interface Options {
  account_id: string;
  success_url: string;
  cancel_url?: string;
}

export default async function createStripePaymentMethodSession(
  opts: Options,
): Promise<Stripe.Checkout.Session> {
  const { account_id, success_url, cancel_url } = opts;
  const log = (...args) => {
    logger.debug("createStripePaymentMethodSession", ...args);
  };
  log(opts);

  // check if there is already a stripe checkout session; if so throw error.
  if ((await getCurrentSession(account_id)) != null) {
    throw Error("there is already an active stripe checkout session");
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
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    success_url: success_url + "?session_id={CHECKOUT_SESSION_ID}",
    cancel_url,
    client_reference_id: account_id,
    customer,
    customer_email:
      customer == null ? await getEmailAddress(account_id) : undefined,
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
  const db = getPool();
  await db.query(
    "UPDATE accounts SET stripe_checkout_session=$2 WHERE account_id=$1",
    [account_id, { id: session.id, url: session.url }],
  );
  return session;
}
