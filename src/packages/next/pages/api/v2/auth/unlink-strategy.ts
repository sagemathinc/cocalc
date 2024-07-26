/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* api call to unlink a specific single sign on for the currently authenticated user */

import unlinkStrategy from "@cocalc/server/auth/sso/unlink-strategy";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { OkStatus } from "lib/api/status";

export default async function handle(req, res) {
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    const { name } = getParams(req);
    await unlinkStrategy({ account_id, name });
    res.json(OkStatus);
  } catch (err) {
    res.json({ error: err.message });
  }
}
