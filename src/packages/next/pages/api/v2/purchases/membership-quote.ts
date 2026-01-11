/*
Membership pricing + eligibility for in-app membership changes.
*/

import getAccountId from "lib/account/get-account";
import { computeMembershipChange } from "@cocalc/server/membership/tiers";
import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  const { class: targetClass, interval, allow_downgrade } = req.body ?? {};
  if (!targetClass) {
    throw Error("membership class is required");
  }
  if (interval !== "month" && interval !== "year") {
    throw Error("interval must be 'month' or 'year'");
  }

  const pricing = await computeMembershipChange({
    account_id,
    targetClass,
    interval,
    allowDowngrade: !!allow_downgrade,
    storeVisibleOnly: true,
  });

  if (pricing.charge <= 0) {
    return { ...pricing, allowed: true, charge_amount: 0 };
  }

  const purchase = await isPurchaseAllowed({
    account_id,
    service: "membership",
    cost: pricing.charge,
  });

  return {
    ...pricing,
    allowed: purchase.allowed,
    discouraged: purchase.discouraged,
    reason: purchase.reason,
    charge_amount: purchase.chargeAmount ?? pricing.charge,
  };
}
