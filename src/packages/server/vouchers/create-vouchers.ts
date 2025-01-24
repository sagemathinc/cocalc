/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Create certain number of cash voucher codes.

Everything is done as one big atomic transaction, so if anything
goes wrong the database is unchanged and the user is not charged
and no vouchers get left sitting around.
*/

import multiInsert from "@cocalc/database/pool/multi-insert";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import generateVouchers, {
  CharSet,
  MAX_VOUCHERS,
  MAX_VOUCHER_VALUE,
  CHARSETS,
  WhenPay,
} from "@cocalc/util/vouchers";
import { getLogger } from "@cocalc/backend/logger";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import dayjs from "dayjs";
import { decimalMultiply } from "@cocalc/util/stripe/calc";

const log = getLogger("createVouchers");

interface Options {
  account_id: string;
  client;
  whenPay: WhenPay;
  // how many voucher codes
  numVouchers: number;
  // value of each voucher code
  amount: number;
  active: Date | null;
  // expire is ignored except for admin vouchers
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
  credit_id?: number;
}

export default async function createVouchers({
  account_id,
  client,
  whenPay, // createVouchers *does* check if they claim to be an admin that they actually are.
  numVouchers: count,
  amount,
  active,
  expire,
  cancelBy,
  title,
  generate,
  credit_id,
}: Options): Promise<{
  id: string;
  codes: string[];
  amount: number; // value of one single voucher
}> {
  log.debug({
    account_id,
    whenPay,
    count,
    amount,
    expire,
    title,
    generate,
    credit_id,
  });
  if (!count || count < 1 || !isFinite(count)) {
    // default to 1 -- this wasn't specified at all in some cases with
    // older vouchers that might be in user shopping carts still
    count = 1;
  }
  if (!amount || amount <= 0 || amount > MAX_VOUCHER_VALUE) {
    throw Error(`amount must be positive and at most ${MAX_VOUCHER_VALUE}`);
  }

  // Make some checks.
  if (whenPay == "admin") {
    // they better be an admin!
    if (!(await userIsInGroup(account_id, "admin"))) {
      throw Error("only admins can create admin vouchers");
    }
  }

  if (count > MAX_VOUCHERS[whenPay]) {
    throw Error(
      `there is a hard limit of at most ${MAX_VOUCHERS[whenPay]} vouchers`,
    );
  }

  if (generate != null) {
    if (generate.length != null && generate.length < 8) {
      throw Error(
        "there must be at least 6 random characters in generated code",
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
      "INSERT INTO vouchers(created, created_by, title, active, expire, cancel_by, count, when_pay, cost) VALUES(NOW(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
      [
        account_id,
        title,
        active ?? now.toDate(),
        expire,
        cancelBy,
        count,
        whenPay,
        amount,
      ],
    );
    const { id } = rows[0];

    // create the voucher codes:
    const codes = generateVouchers({ ...generate, count });
    const { query, values } = multiInsert(
      "INSERT INTO voucher_codes(code, id, created)",
      codes.map((code) => [code, id, now.toDate()]),
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
        cost: amount,
        title,
        voucher_id: id,
        credit_id,
      } as const;
      log.debug("charging user; description =", description);
      const purchase_id = await createPurchase({
        account_id,
        cost: decimalMultiply(amount, count),
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
    return { id, codes, amount };
  } catch (err) {
    log.debug("error -- rolling back entire transaction", err);
    throw err;
  }
}
