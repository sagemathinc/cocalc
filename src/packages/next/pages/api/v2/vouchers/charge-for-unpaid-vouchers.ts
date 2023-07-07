/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import chargeForUnpaidVouchers from "@cocalc/server/vouchers/charge-for-unpaid-vouchers";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    const result = await doIt(req);
    res.json({ ...result, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to charge for unpaid vouchers");
  }
  if (!(await userIsInGroup(account_id, "admin"))) {
    throw Error("only admins can initiate the charge for unpaid vouchers");
  }

  return await chargeForUnpaidVouchers();
}
