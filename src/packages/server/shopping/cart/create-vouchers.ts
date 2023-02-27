/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
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
import getCart from "./get";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import dayjs from "dayjs";
import generateVouchers, {
  CharSet,
  MAX_VOUCHERS,
  CHARSETS,
} from "@cocalc/util/vouchers";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("createVouchers");

interface Options {
  account_id: string;
  count: number;
  expire: Date;
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
  count,
  expire,
  title,
  generate,
}: Options): Promise<{ group_id: string; vouchers: string[] }> {
  // Get the list of items in the cart that haven't been purchased
  // or saved for later, and are currently checked, and are
  // NOT subscriptions (i.e, a date range).
  const cart = (
    await getCart({ account_id, purchased: false, removed: false })
  ).filter((item) => item.checked && item.description?.["period"] == "range");
  logger.debug({
    account_id,
    count,
    expire,
    title,
    generate,
    cart,
  });

  const pool = getPool();

  // Make some checks.

  // This should already get checked elsewhere, but let's check again to be sure.
  // It would be very bad if random users could create vouchers, obviously.
  if (!(await userIsInGroup(account_id, "partner"))) {
    throw Error("only partners can create vouchers");
  }

  if (!count || count < 1 || !isFinite(count)) {
    throw Error("must create at least 1 voucher");
  }
  if (count > MAX_VOUCHERS) {
    throw Error(`there is a hard limit of at most ${MAX_VOUCHERS} vouchers`);
  }
  if (!expire || expire <= new Date()) {
    throw Error("expire must be in the future");
  }
  if (dayjs(expire) > dayjs().add(61, "day")) {
    throw Error("expire must at most 60 days in the future");
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

  /*
  Now actually modify the database.  We create two things:

  1. A record in the "voucher_groups" table that explains what the voucher
     is for, and records the title and expire date.

  2. We create [count] records in the "vouchers" table. These point to
     the voucher_create record and can be redeemed.

  */
  const { rows } = await pool.query(
    "INSERT INTO voucher_groups(account_id, title, count, expire) VALUES(%1, %2, %3, %4) RETURNING id",
    [account_id, title, count, expire]
  );
  const { id: group_id } = rows[0];

  let error;
  for (let i = 0; i < 10; i++) {
    try {
      // create the voucher codes:
      const vouchers = generateVouchers({ ...generate, count });
      const { query, values } = multiInsert(
        "INSERT INTO vouchers(id, group_id)",
        vouchers.map((code) => [code, group_id])
      );
      await pool.query(query, values);
      // Did it!
      return { group_id, vouchers };
    } catch (err) {
      error = err;
      // It is possible there is an error due to one of our new randomly generated voucher codes
      // just randomly matching something already in the database.  This is very, very highly
      // unlikely, so if this happens, we just try again... up to 10 times.
    }
  }
  // Failed 10 times. Weird. Report error. Maybe database is down or something else.
  throw error;
}
