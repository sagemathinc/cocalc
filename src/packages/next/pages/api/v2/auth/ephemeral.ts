/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { v4 } from "uuid";

import createAccount from "@cocalc/server/accounts/create-account";
import redeemRegistrationToken from "@cocalc/server/auth/tokens/redeem";
import { signUserIn } from "./sign-in";
import getParams from "lib/api/get-params";

export default async function createEphemeralAccount(req, res) {
  let { registrationToken } = getParams(req);
  registrationToken = (registrationToken ?? "").trim();
  if (!registrationToken) {
    res.json({ error: "Registration token required." });
    return;
  }
  let tokenInfo;
  try {
    tokenInfo = await redeemRegistrationToken(registrationToken);
  } catch (err) {
    res.json({
      error: `Issue with registration token -- ${err.message}`,
    });
    return;
  }
  if (!tokenInfo?.ephemeral || tokenInfo.ephemeral <= 0) {
    res.json({
      error:
        "This registration token is not configured for ephemeral accounts.",
    });
    return;
  }

  const account_id = v4();
  const suffix = account_id.slice(0, 6);
  try {
    await createAccount({
      email: undefined,
      password: undefined,
      firstName: "Ephemeral",
      lastName: `User-${suffix}`,
      account_id,
      tags: ["ephemeral"],
      signupReason: "ephemeral",
      ephemeral: tokenInfo.ephemeral,
    });
  } catch (err) {
    res.json({
      error: `Problem creating ephemeral account -- ${err.message}`,
    });
    return;
  }

  await signUserIn(req, res, account_id, { maxAge: tokenInfo.ephemeral });
}
