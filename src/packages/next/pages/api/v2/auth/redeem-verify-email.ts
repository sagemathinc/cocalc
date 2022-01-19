/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import redeemVerifyEmail from "@cocalc/server/auth/redeem-verify-email";
import isPost from "lib/api/is-post";

export default async function redeemVerifyEmailAPICall(req, res) {
  if (!isPost(req, res)) return;

  const { email_address, token } = req.body;
  try {
    await redeemVerifyEmail(email_address, token);
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
  res.json({});
  return;
}
