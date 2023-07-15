/*
Stripe Synchronization

Get all info about the given account from stripe and put it in our own local
database. Also, call it right after the user does some action that will change
their account info status. Additionally, it checks the email address Stripe
knows about the customer and updates it if it changes.

This will not touch stripe if the user doesn't have a stripe_customer_id
set in the accounts table and customer_id is not given as an input.

TODO:
1. Some of this should be augmented by webhooks.
2. This could get big over time for a given user. There are scalability concerns.
*/

import type Stripe from "stripe";
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getStripeCustomerId } from "./customer-id";
import getConn from "@cocalc/server/stripe/connection";
import { is_valid_email_address } from "@cocalc/util/misc";
import stripeName from "@cocalc/util/stripe/name";

const log = getLogger("database:stripe:sync");

interface Options {
  account_id: string;
  // The following two are for efficiency purposes:
  stripe?: Stripe; // connection to stripe -- created if not known
  customer_id?: string; // gets looked up if not given
}

// returns customer object or undefined

export default async function syncCustomer({
  account_id,
  stripe,
  customer_id,
}: Options) {
  log.debug("account_id = ", account_id);
  if (!customer_id) {
    customer_id = await getStripeCustomerId(account_id);
    log.debug("customer_id = ", customer_id);
    if (!customer_id) {
      // done -- nothing to do -- not a customer
      return;
    }
  }
  if (!stripe) {
    stripe = await getConn();
  }

  // get customer data from stripe
  let customer = await stripe.customers.retrieve(customer_id, {
    expand: ["sources"],
  });
  if (customer.deleted) {
    // we don't delete customers -- this would be a weird situation. TODO
    log.debug("customer exists in stripe but is deleted");
    return;
  }

  // update email, name or description in stripe if different from database.
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT email_address, first_name, last_name FROM accounts WHERE account_id = $1::UUID",
    [account_id]
  );
  if (rows.length == 0) {
    throw Error(`no account ${account_id}`);
  }
  const { email_address, first_name, last_name } = rows[0];

  const update: any = {};
  if (
    email_address != customer.email &&
    is_valid_email_address(email_address)
  ) {
    // update email address
    update.email = email_address;
  }

  const name = stripeName(first_name, last_name);
  if (name != customer.name) {
    update.name = name;
  }
  if (name != customer.description) {
    update.description = name;
  }
  if (Object.keys(update).length > 0) {
    // something changed
    customer = await stripe.customers.update(customer_id, update);
  }

  // save in our database the stripe data about this account
  await pool.query(
    "UPDATE accounts SET stripe_customer=$1::JSONB WHERE account_id=$2::UUID",
    [customer, account_id]
  );

  return customer;
}
