/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Redeeming a password reset works as follows:

1. check that the password reset id is valid still; error if not
2. check that the password is valid; error if not
3. invalidate password reset id by writing that it is used to the database
4. write hash of new password to the database
5. respond success and sign user in.
*/

import redeemPasswordReset from "@cocalc/server/auth/redeem-password-reset";
import { signUserIn } from "./sign-in";
import getParams from "lib/api/get-params";

export default async function redeemPasswordResetAPIEndPoint(req, res) {
  const { password, passwordResetId } = getParams(req);
  let account_id: string;
  try {
    account_id = await redeemPasswordReset(password, passwordResetId);
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
  await signUserIn(req, res, account_id);
  return;
}
