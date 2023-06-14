/*
Create a stripe invoice for a specific amount of money.

Use case:

- making a payment to reduce your balance / credit your account
- paying monthly statement
*/

import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";
import stripeName from "@cocalc/util/stripe/name";
import { setStripeCustomerId } from "@cocalc/database/postgres/stripe";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchases:create-invoice");

interface Options {
  account_id: string;
  amount: number; // amount in US Dollars
  description: string;
}

export default async function createInvoice({
  account_id,
  amount,
  description,
}: Options): Promise<{
  id: string;
  paid: boolean;
  hosted_invoice_url: string;
}> {
  logger.debug("createInvoice", { account_id, amount, description });
  if (!amount || amount <= 1) {
    throw Error("amount must be at least $1");
  }
  if (!description?.trim()) {
    throw Error("description must be nontrivial");
  }
  if (!(await isValidAccount(account_id))) {
    throw Error("account must be valid");
  }
  const stripe = await getConn();
  const customer = await getStripeCustomerId(account_id);
  logger.debug("createInvoice", { customer });
  await stripe.invoiceItems.create({
    customer,
    amount: Math.round(100 * amount), // stripe uses pennies not dollars.
    currency: "usd",
    description,
  });
  const invoice = await stripe.invoices.create({
    customer,
    auto_advance: true,
    collection_method: "send_invoice",
    days_until_due: 15,
  });
  logger.debug("createInvoice", { invoice });
  const sentInvoice = await stripe.invoices.sendInvoice(invoice.id);
  return sentInvoice;
}

async function getStripeCustomerId(account_id: string): Promise<string> {
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
  return await createStripeCustomer(account_id);
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
