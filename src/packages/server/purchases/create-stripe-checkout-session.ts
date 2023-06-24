/*
Create a stripe checkout session for this user.

See https://stripe.com/docs/api/checkout/sessions
*/

import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";
import stripeName from "@cocalc/util/stripe/name";
import { setStripeCustomerId } from "@cocalc/database/postgres/stripe";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import createCredit from "./create-credit";
import getLogger from "@cocalc/backend/logger";
import type { Stripe } from "stripe";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";

const logger = getLogger("purchases:create-stripe-checkout-session");

interface Options {
  account_id: string;
  amount: number; // amount in US Dollars
  description: string;
  success_url: string;
  cancel_url: string;
}

export default async function createStripeCheckoutSession(
  opts: Options
): Promise<Stripe.Checkout.Session> {
  const { account_id, amount, description, success_url, cancel_url } = opts;
  logger.debug("createStripeCheckoutSession", opts);
  const { pay_as_you_go_min_payment } = await getServerSettings();
  if (!amount || amount <= pay_as_you_go_min_payment) {
    throw Error(`amount must be at least $${pay_as_you_go_min_payment}`);
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
  const customer = await getStripeCustomerId({ account_id, create: false });
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
    currency: "usd",
    customer,
    customer_email:
      customer == null ? await getEmailAddress(account_id) : undefined,
    invoice_creation: {
      enabled: true,
      invoice_data: { metadata: { account_id, service: "credit" } },
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
  return session;
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
    [account_id]
  );
  const stripe_customer_id = rows[0]?.stripe_customer_id;
  if (stripe_customer_id) {
    logger.debug(
      "getStripeCustomerId",
      "customer already exists",
      stripe_customer_id
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
    [account_id]
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

/*
Invoice is any stripe invoice that somehow got paid.
We check if there is a corresponding credit in the
purchases table, and if not we create the credit
corresponding to this invoice in some cases.

- if invoice.metadata = {account_id, service:'credit'} which indicates this
  invoice was for adding credit to the user's purchases balance.
- TODO...
*/
export async function createCreditFromPaidStripeInvoice(invoice) {
  if (
    invoice?.metadata == null ||
    !invoice.paid ||
    invoice.metadata.service != "credit" ||
    !invoice.metadata.account_id
  ) {
    logger.debug(
      "createCreditFromPaidStripeInvoice -- skipping since not a service credit",
      invoice.id
    );
    // Some other sort of invoice, e.g, for a subscription or something else.
    // We don't handle them here yet.
    return;
  }
  const { account_id } = invoice.metadata;
  if (!(await isValidAccount(account_id))) {
    logger.debug(
      "createCreditFromPaidStripeInvoice -- invalid account_id!",
      account_id
    );
    // definitely should never happen
    throw Error(`invalid account_id in metadata '${account_id}'`);
  }

  // See long comment about "total_excluding_tax" below.
  const amount = invoice.total_excluding_tax / 100;
  await createCredit({
    account_id,
    invoice_id: invoice.id,
    amount,
  });
}
