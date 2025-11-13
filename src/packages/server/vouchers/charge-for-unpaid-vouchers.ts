/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Find all vouchers that are supposed to get paid for, but haven't
yet been paid for, and attempt to charge for them.

These are the vouchers where when_pay is 'invoice', the expire
field is in the past, and the payment field is not set.

We of course only charge for the number of vouchers that were
actually redeemed. Since the expire date is in the past, no
more vouchers could ever be redeemed.
*/

import getPool from "@cocalc/database/pool";
import { getLogger } from "@cocalc/backend/logger";
import { chargeUser } from "@cocalc/server/licenses/purchase/charge";
import { StripeClient } from "@cocalc/server/stripe/client";
import type { PurchaseInfo } from "@cocalc/util/db-schema/vouchers";
import { CURRENT_VERSION } from "@cocalc/util/licenses/purchase/consts";

const log = getLogger("charge-for-unpaid-vouchers");

type Result = {
  [id: string]:
    | { status: string; error: string }
    | { status: string; purchased: PurchaseInfo };
};

export default async function chargeForUnpaidVouchers(): Promise<Result> {
  log.debug("chargeForUnpaidVouchers");

  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, cost, tax, created_by, title FROM vouchers WHERE purchased is NULL AND when_pay='invoice' AND expire < NOW()",
  );
  const result: Result = {};
  for (const row of rows) {
    log.debug("charing ", row);
    try {
      const purchased = await chargeForUnpaidVoucher(row);
      log.debug("success");
      result[row.id] = { status: "ok", purchased };
    } catch (err) {
      log.debug("error", err);
      result[row.id] = { status: "error", error: `${err}` };
    }
  }
  return result;
}

async function chargeForUnpaidVoucher({
  id,
  cost,
  tax,
  created_by,
  title,
}: {
  id: number;
  cost: number;
  tax: number;
  created_by: string;
  title: string;
}): Promise<any> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS quantity FROM voucher_codes WHERE id=$1 AND when_redeemed IS NOT NULL AND canceled IS NULL",
    [id],
  );
  const quantity = rows[0].quantity;
  let purchased: PurchaseInfo;
  if (quantity == 0) {
    purchased = { time: new Date().toISOString(), quantity: 0 };
  } else {
    const stripe = new StripeClient({ account_id: created_by });
    const info = {
      // version doesn't really matter since the cost is already explicitly given below
      version: CURRENT_VERSION,
      type: "vouchers",
      quantity,
      cost,
      tax,
      title,
      id,
    } as const;
    log.debug("charging user; info =", info);
    const { id: stripe_invoice_id } = await chargeUser(stripe, info);
    purchased = { time: new Date().toISOString(), quantity, stripe_invoice_id };
  }
  log.debug("purchased = ", purchased);
  await pool.query("UPDATE vouchers SET purchased=$1 WHERE id=$2", [
    purchased,
    id,
  ]);
  return purchased;
}
