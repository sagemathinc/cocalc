/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create certain number of vouchers for everything non-subscription
that is checked and in the shopping cart and create corresponding
purchase charging the user.

Everything is done as one big atomic transaction, so if anything
goes wrong the database is unchanged and the user is not charged
and no vouchers get left sitting around.
*/

import { getTransactionClient } from "@cocalc/database/pool";
import multiInsert from "@cocalc/database/pool/multi-insert";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import generateVouchers, {
  CharSet,
  MAX_VOUCHERS,
  CHARSETS,
  WhenPay,
} from "@cocalc/util/vouchers";
import { getLogger } from "@cocalc/backend/logger";
import { getVoucherCheckoutCart } from "@cocalc/server/purchases/vouchers-checkout";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import dayjs from "dayjs";

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
  whenPay, // createVouchers *does* check if they claim to be an admin that they actually are.
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
  cart: any[];
}> {
  if (!count || count < 1) {
    throw Error("count must be a positive integer");
  }
  // Get the list of items in the cart that haven't been purchased
  // or saved for later, and are currently checked, and are
  // NOT subscriptions (i.e, a date range).
  const { cart, total: cost } = await getVoucherCheckoutCart(account_id);
  log.debug({
    account_id,
    whenPay,
    count,
    expire,
    title,
    generate,
    cart,
    cost,
  });
  if (cart.length == 0) {
    throw Error("cart must be nonempty");
  }

  // Make some checks.
  if (whenPay == "admin") {
    // they better be an admin!
    if (!(await userIsInGroup(account_id, "admin"))) {
      throw Error("only admins can create free vouchers");
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

  if (whenPay == "admin") {
    // We leave expire as is, since admin can set shorter expiration date
  } else {
    // if they pay now, then their vouchers last a long time.
    // If after 10 years, things are still around and there is a complaint,
    // a support person can easily extend this.
    expire = dayjs().add(10, "year").toDate();
  }

  const client = await getTransactionClient();
  try {
    // start atomic transaction

    /*
    Now actually modify the database.  We create two things:

    1. A record in the "vouchers" table that explains what the voucher
       is for, and records the title and expire date.

    2. We create [count] records in the "voucher_codes" table.
       These point to the voucher_create record and can be redeemed.

    */
    const now = dayjs();
    const { rows } = await client.query(
      "INSERT INTO vouchers(created, created_by, title, active, expire, cancel_by, cart, cost, count, when_pay) VALUES(NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
      [
        account_id,
        title,
        active ?? now.toDate(),
        expire ?? now.add(10, "years").toDate(),
        cancelBy ?? now.add(14, "days").toDate(),
        cart,
        cost,
        count,
        whenPay,
      ]
    );
    const { id } = rows[0];

    // create the voucher codes:
    const codes = generateVouchers({ ...generate, count });
    const { query, values } = multiInsert(
      "INSERT INTO voucher_codes(code, id, created)",
      codes.map((code) => [code, id, now.toDate()])
    );
    await client.query(query, values);
    /* NOTE: There is a VERY VERY VERY small probability that some
    voucher we randomly created matches something in the database
    already, in which case the above query fails.  That's fine,
    as the entire transaction fails and the user sees an error, and
    can just try again.  The odds of some other bug or a database
    outage is probably much higher.
    */

    // Success!
    if (whenPay != "admin") {
      // Actually charge the user for the vouchers.
      const description = {
        type: "voucher",
        quantity: count,
        cost,
        title,
        voucher_id: id,
      } as const;
      log.debug("charging user; description =", description);
      const purchase_id = await createPurchase({
        account_id,
        cost: cost * count,
        service: "voucher",
        description,
        client,
      });
      const purchased = {
        time: new Date(),
        quantity: count,
        purchase_id,
      };
      log.debug("purchased = ", purchased);
      await client.query("UPDATE vouchers SET purchased=$1 WHERE id=$2", [
        purchased,
        id,
      ]);
    }

    // Mark every item in the cart as "purchased".
    await client.query(
      "UPDATE shopping_cart_items SET purchased=$3 WHERE account_id=$1 AND id=ANY($2)",
      [
        cart[0].account_id,
        cart.map((x) => x.id),
        { success: true, time: new Date(), voucher_id: id },
      ]
    );

    await client.query("COMMIT");
    return { id, codes, cost, cart };
  } catch (err) {
    await client.query("ROLLBACK");
    log.debug("error -- rolling back entire transaction", err);
    throw err;
  } finally {
    // end atomic transaction
    client.release();
  }
}
