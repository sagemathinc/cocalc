/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import redeemVerifyEmail from "@cocalc/server/auth/redeem-verify-email";

export default async function redeemVerifyEmailAPICall(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "verify email must use a POST request." });
    return;
  }

  const { email_address, token } = req.body;
  try {
    await redeemVerifyEmail(email_address, token);
  } catch (err) {
    res.json({ error: `${err}` });
    return;
  }
  res.json({});
  return;
}
