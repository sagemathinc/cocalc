/* Redeem a voucher */

import { getVoucherCode, redeemVoucherCode } from "./codes";
import { getVoucher } from "./vouchers";
import { getLogger } from "@cocalc/backend/logger";
import createCredit from "@cocalc/server/purchases/create-credit";
import { getTransactionClient } from "@cocalc/database/pool";

const log = getLogger("server:vouchers:redeem");

interface Options {
  account_id: string;
  code: string;
}

interface CreatedCash {
  type: "cash";
  amount: number;
  purchase_id: number;
}

export type CreatedItem = CreatedCash;

export default async function redeemVoucher({
  account_id,
  code,
}: Options): Promise<CreatedItem[]> {
  // get info from db about given voucher code
  log.debug("code=", code);
  const voucherCode = await getVoucherCode(code);
  if (voucherCode.when_redeemed != null) {
    log.debug(code, "already redeemed");
    if (voucherCode.redeemed_by == account_id) {
      throw Error(`You already redeem the voucher '${code}'.`);
    } else {
      throw Error(`Voucher '${code}' was already redeemed by somebody else.`);
    }
  }
  const voucher = await getVoucher(voucherCode.id);
  const now = new Date();
  if (voucher.active != null && now < voucher.active) {
    log.debug(code, "not yet active", now, voucher.active);
    throw Error(`Voucher '${code}' is not yet active.`);
  }
  if (voucher.expire != null && now >= voucher.expire) {
    log.debug(code, "already expired", now, voucher.expire);
    throw Error(`Voucher '${code}' has already expired.`);
  }

  const client = await getTransactionClient();
  const createdItems: CreatedItem[] = [];
  try {
    // start atomic transaction

    // array because this used to support multiple items, and I don't want to change db schema...
    const purchase_ids: number[] = [];
    const id = await createCredit({
      account_id,
      amount: voucher.cost,
      tag: "cash-voucher",
      notes: voucher.title,
      description: { voucher_code: code },
      client,
    });
    purchase_ids.push(id);
    createdItems.push({
      type: "cash",
      amount: voucher.cost,
      purchase_id: id,
    });
    // set voucher as redeemed in the voucher_code:
    await redeemVoucherCode({
      code,
      account_id,
      purchase_ids,
      client,
    });
    await client.query("COMMIT");
    return createdItems;
  } catch (err) {
    await client.query("ROLLBACK");
    log.debug("error -- rolling back entire transaction", err);
    throw err;
  } finally {
    // end atomic transaction
    client.release();
  }
}