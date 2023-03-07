/*
Get recent purchases.
*/

import type { Voucher } from "@cocalc/util/db-schema/vouchers";
import getRecentlyCreatedVouchers from "@cocalc/server/vouchers/recent-vouchers";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<Voucher[]> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to get shopping cart information");
  }
  // recent = postgresql time, e.g., "1 day".  Can be omitted, in which case default is "1 week".
  const { recent } = getParams(req);
  return await getRecentlyCreatedVouchers({ account_id, recent });
}
