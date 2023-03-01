/* Redeem a voucher */

import { getVoucherCode, redeemVoucherCode } from "./codes";
import { getVoucher } from "./vouchers";
import { getLogger } from "@cocalc/backend/logger";
import { createLicenseWithoutPurchase } from "@cocalc/server/shopping/cart/checkout";

const log = getLogger("server:vouchers:redeem");

interface Options {
  account_id: string;
  code: string;
}

export default async function redeemVoucher({
  account_id,
  code,
}: Options): Promise<string[]> {
  // get info from db about given voucher code
  log.debug("code=", code);
  const voucherCode = await getVoucherCode(code);
  if (voucherCode.when_redeemed != null) {
    log.debug(code, "already redeemed");
    if (voucherCode.redeemed_by == account_id) {
      throw Error(`You already reemed voucher '${code}'.`);
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

  // Create license resources for user.
  // TODO: we create license first, then redeem voucher, so in worse case that server crashes
  // we lose something instead of the user losing something, because we are not evil, but
  // also 2-phase commit at this point is maybe overkill.

  // TODO -- make licenses!
  log.debug(
    "code=",
    code,
    " account_id = ",
    account_id,
    ": creating licenses associated to voucher=",
    voucher
  );
  const licenses: string[] = [];
  for (const { product, description } of voucher.cart) {
    if (product != "site-license") {
      // this is assumed by createLicenseWithoutPurchase
      throw Error("the only product that is implemented is 'site-license'");
    }
    // shift range in the description so license starts now.
    if (description["range"] == null) {
      throw Error(
        "invalid voucher: only items with explicit range are allowed"
      );
    }
    let [start, end] = description["range"];
    if (!start || !end) {
      throw Error("nvalid voucher: licenses must have an explicit range");
    }
    // start and end are ISO string rep, since they are from JSONB in the database,
    // and JSON doesn't have a date type.
    const interval = new Date(end).valueOf() - new Date(start).valueOf();
    description["range"] = [now, new Date(now.valueOf() + interval)];
    licenses.push(
      await createLicenseWithoutPurchase({ account_id, description })
    );
  }

  // set voucher as redeemed
  await redeemVoucherCode({ code, account_id });

  return licenses;
}
