/*
Apply a membership change using account balance (no external payment).
*/

import getAccountId from "lib/account/get-account";
import { applyMembershipChange } from "@cocalc/server/purchases/membership-change";

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

  return await applyMembershipChange({
    account_id,
    targetClass,
    interval,
    allowDowngrade: !!allow_downgrade,
    storeVisibleOnly: true,
    requireNoPayment: true,
  });
}
