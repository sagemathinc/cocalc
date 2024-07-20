/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import redeemVerifyEmail from "@cocalc/server/auth/redeem-verify-email";
import getParams from "lib/api/get-params";

export default async function redeemVerifyEmailAPICall(req, res) {
  const { email_address, token } = getParams(req);
  try {
    await redeemVerifyEmail(email_address, token);
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
  res.json({});
  return;
}
