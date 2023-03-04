/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Purchase everything that is checked and in the shopping cart.

This API endpoint gets called when user has confirmed their payment
method and clicked the button to complete the purchase.

Of course this doesn't take any input, since the contents of the cart
is already in the database, and the card info (and which is the default)
is in stripe only.

If this successfully runs, then the checked items in the shopping
cart are changed in the database so that the purchased field is set.
*/

import getPool from "@cocalc/database/pool";
import multiInsert from "@cocalc/database/pool/multi-insert";
import getCart from "@cocalc/server/shopping/cart/get";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import dayjs from "dayjs";
import generateVouchers, {
  CharSet,
  MAX_VOUCHERS,
  CHARSETS,
  WhenPay,
} from "@cocalc/util/vouchers";
import { getLogger } from "@cocalc/backend/logger";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import salesTax from "@cocalc/server/stripe/sales-tax";
import { getStripeCustomerId } from "@cocalc/database/postgres/stripe";
import { chargeUser } from "@cocalc/server/licenses/purchase/charge";
import { StripeClient } from "@cocalc/server/stripe/client";

const log = getLogger("createVouchers");

interface Options {
  account_id: string;
  whenPay: WhenPay;
  count: number;
  active: Date | null;
  expire: Date | null;
  cancelBy: Date | null;
  title: string;
  generate?: {
    // See https://www.npmjs.com/package/voucher-code-generator
    length?: number;
    charset?: CharSet;
    prefix?: string;
    postfix?: string;
  };
}

export default async function createVouchers({
  account_id,
  whenPay,
  count,
  active,
  expire,
  cancelBy,
  title,
  generate,
}: Options): Promise<{
  id: string;
  codes: string[];
  cost: number; // cost to redeem one voucher
  tax: number; // tax on redeeming one voucher
  cart: any[];
}> {
  // Get the list of items in the cart that haven't been purchased
  // or saved for later, and are currently checked, and are
  // NOT subscriptions (i.e, a date range).
  const cart = (
    await getCart({ account_id, purchased: false, removed: false })
  ).filter((item) => item.checked && item.description?.["period"] == "range");

  let cost = 0;
  for (const item of cart) {
    if (whenPay == "now") {
      // compute *discounted* cost per voucher
      cost += computeCost(item.description as any)?.discounted_cost ?? 0;
    } else {
      // full cost per voucher
      for (const item of cart) {
        cost += computeCost(item.description as any)?.cost ?? 0;
      }
    }
  }
  const customerId = await getStripeCustomerId(account_id);
  const taxRate = customerId ? await salesTax(customerId) : 0;
  const tax = cost * taxRate;

  log.debug({
    account_id,
    whenPay,
    count,
    active,
    expire,
    cancelBy,
    title,
    generate,
    cart,
    cost,
    tax,
  });

  const pool = getPool();

  // Make some checks.
  if (whenPay == "admin") {
    // they better be an admin!
    if (!(await userIsInGroup(account_id, "admin"))) {
      throw Error("only admins can create free vouchers");
    }
  }

  if (whenPay == "invoice") {
    // This should already get checked elsewhere,
    // but let's check again to be sure.
    // It would be very bad if random users could create vouchers
    // that get invoiced later, since we need a good trust model
    // for that.
    if (!(await userIsInGroup(account_id, "partner"))) {
      throw Error("only partners can create vouchers");
    }
  }

  if (!count || count < 1 || !isFinite(count)) {
    throw Error("must create at least 1 voucher");
  }
  if (count > MAX_VOUCHERS[whenPay]) {
    throw Error(
      `there is a hard limit of at most ${MAX_VOUCHERS[whenPay]} vouchers`
    );
  }
  if (whenPay == "invoice") {
    if (!active) {
      throw Error("active must be defined");
    }
    if (!expire || expire <= new Date()) {
      throw Error("expire must be in the future");
    }
    if (expire <= active) {
      throw Error("expire must be after active");
    }
    if (dayjs(expire) > dayjs().add(61, "day")) {
      throw Error("expire must at most 60 days in the future");
    }
    if (dayjs(cancelBy) >= dayjs(expire).add(-1, "day")) {
      throw Error("cancel by date must be before expire date");
    }
    if (dayjs(expire) > dayjs().add(31, "day")) {
      throw Error("expire must at most 30 days in the future");
    }
  }
  if (generate != null) {
    if (generate.length != null && generate.length < 8) {
      throw Error(
        "there must be at least 6 random characters in generated code"
      );
    }
    if (generate.charset && !CHARSETS.includes(generate.charset)) {
      throw Error(`charset must be one of ${CHARSETS.join(", ")}`);
    }
    if (generate.prefix != null && generate.prefix.length > 10) {
      throw Error("prefix must have length at most 10");
    }
    if (generate.postfix != null && generate.postfix.length > 10) {
      throw Error("postfix must have length at most 10");
    }
  }
  if (whenPay != "invoice") {
    // make sure that this get set to null in the database when initially creating the vouchers, since
    // we don't want the vouchers to *work* unless payment goes through.  This is just a safety measure
    // for us to not get scammed.
    active = cancelBy = null;
    if (whenPay == "admin") {
      // We leave expire as is, since admin can set shorter expiration date
    } else {
      // if they pay now, then their vouchers last a long time.
      // If after 10 years, things are still around and their is a complaint,
      // a support person can easily extend this.
      expire = dayjs().add(10, "year").toDate();
    }
  }

  /*
  Now actually modify the database.  We create two things:

  1. A record in the "vouchers" table that explains what the voucher
     is for, and records the title and expire date.

  2. We create [count] records in the "voucher_codes" table.
     These point to the voucher_create record and can be redeemed.

  */
  const { rows } = await pool.query(
    "INSERT INTO vouchers(created, created_by, title, active, expire, cancel_by, cart, cost, tax, count, when_pay) VALUES(NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id",
    [
      account_id,
      title,
      active,
      expire,
      cancelBy,
      cart,
      cost,
      tax,
      count,
      whenPay,
    ]
  );
  const { id } = rows[0];

  let error: any = false,
    i,
    codes;
  for (i = 0; i < 10; i++) {
    try {
      // create the voucher codes:
      const now = new Date();
      codes = generateVouchers({ ...generate, count });
      const { query, values } = multiInsert(
        "INSERT INTO voucher_codes(code, id, created)",
        codes.map((code) => [code, id, now])
      );
      await pool.query(query, values);
      // Did it!
      break;
    } catch (err) {
      error = err;
      // It is possible there is an error due to one of our new
      // randomly generated voucher codes just randomly matching
      // something already in the database.  This is very, very
      // highly unlikely, so if this happens, we just try again...
      // up to 10 times.
      // In case any codes got created, delete them.  I suspect this
      // never does anything.
      // NOTE: obviously we assume you can't create new codes for an already
      // created voucher.   We assume that in many places.  Please, just create
      // a new voucher instead.
      await pool.query("DELETE FROM voucher_codes WHERE id=$1", [id]);
    }
  }
  if (i >= 10 && error) {
    // Failed 10 times. Weird. Report error. Maybe database is
    // down or something else.
    try {
      // Try to delete the voucher object itself.
      await pool.query("DELETE FROM vouchers WHERE id=$1", [id]);
    } catch (err) {
      // nonfatal -- maybe db down, and this doesn't provide user with anything,
      // since no voucher_codes.
      log.debug("WARNING: error deleting voucher", err);
    }
    throw Error(`Problem creating vouchers -- ${error}`);
  }

  // Success!
  if (whenPay != "invoice") {
    let paid = false;
    try {
      if (whenPay == "admin") {
        paid = true;
      } else {
        // Actually charge the user for the vouchers.
        const stripe = new StripeClient({ account_id });
        const info = {
          type: "vouchers",
          quantity: count,
          cost,
          tax,
          title,
          id,
        } as const;
        log.debug("charging user; info =", info);
        const purchase = await chargeUser(stripe, info);
        log.debug("purchase = ", purchase);
        paid = true;
      }
    } finally {
      if (paid) {
        // Payment succeeded - Make the voucher valid:
        //     active - as of now.
        //     expire - in the very distant future (just to keep code simple)
        //     cancel - now, since can't be canceled
        // If somehow this query right here fails but everything else worked, user would have something
        // broken that they paid for.  At least there is clear evidence of it they can point at, and we
        // can easily edit the database (via our crm) to fix the problem manually.
        await pool.query(
          "UPDATE vouchers SET active=NOW(), cancel_by=NOW() WHERE id=$1",
          [id]
        );
      } else {
        // payment failed -- delete all the vouchers from the database.  Even if this fails
        // this is just clutter, since the vouchers are not valid until the step below.
        await pool.query("DELETE FROM vouchers WHERE id=$1", [id]);
        await pool.query("DELETE FROM voucher_codes WHERE id=$1", [id]);
      }
    }
  }

  // Success!
  return { id, codes, cost, tax, cart };
}
