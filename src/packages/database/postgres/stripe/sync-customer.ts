/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Stripe Synchronization

ALMOST DEPRECATED -- only used/matters for users with legacy upgrade subscriptions
AND is used to change the email address/name of a user in stripe, when they change
it in cocalc... which is kind of weird to be here.

Get all info about the given account from stripe and put it in our own local
database. Also, call it right after the user does some action that will change
their account info status. Additionally, it checks the email address Stripe
knows about the customer and updates it if it changes.

This will not touch stripe if the user doesn't have a stripe_customer_id
set in the accounts table and customer_id is not given as an input.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getStripeCustomerId } from "./customer-id";
import { is_valid_email_address } from "@cocalc/util/misc";
import stripeName from "@cocalc/util/stripe/name";

const log = getLogger("database:stripe:sync");

interface Options {
  account_id: string;
  // The following two are for efficiency purposes:
  stripe; // connection to stripe
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

  // get customer data from stripe
  let customer = await stripe.customers.retrieve(customer_id, {
    expand: ["sources", "subscriptions"],
  });

  const pool = getPool();

  if (customer.deleted) {
    // we don't delete customers -- this would be a weird situation.
    log.debug(
      "customer exists in stripe but is deleted there, so we delete link to stripe.",
    );
    await pool.query(
      "UPDATE accounts SET stripe_customer_id=NULL, stripe_customer=NULL WHERE account_id=$1",
      [account_id],
    );
    return;
  }

  // update email, name or description in stripe if different from database.
  const { rows } = await pool.query(
    "SELECT email_address, first_name, last_name FROM accounts WHERE account_id = $1::UUID",
    [account_id],
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

  // if there is a non-canceled subscription, save in our database the stripe data about this account
  // Otherwise, clear that so we don't consider user again.
  await pool.query(
    "UPDATE accounts SET stripe_customer=$1::JSONB WHERE account_id=$2::UUID",
    [
      hasNonCanceledLegacySubscription(customer.subscriptions)
        ? customer
        : null,
      account_id,
    ],
  );

  return customer;
}

function hasNonCanceledLegacySubscription(subscriptions): boolean {
  for (const sub of subscriptions?.data ?? []) {
    if (sub.status != "canceled") {
      // this is a crappy test, I guess, but the one new subscription we have using
      // stripe checkout sets metadata.service to 'credit', but we didn't touch
      // metadata.service on the old legacy upgrade plans.  (We didn't set metadata at all.)
      if (sub.metadata?.service == null) {
        return true;
      }
    }
  }
  return false;
}
