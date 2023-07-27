/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Request, Response } from "express";

import { getLogger } from "@cocalc/backend/logger";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import { sendTemplateEmail } from "@cocalc/server/email/smtp";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

const L = getLogger("api:email:test");

export default async function handle(req: Request, res: Response) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw new Error("must be signed in");
  }
  if (!(await userIsInGroup(account_id, "admin"))) {
    throw new Error("only admins can test email");
  }

  const {
    email_address,
    name,
    test = false,
    template,
    queue = false,
  } = getParams(req);

  L.debug({ email_address, name, test, template });

  try {
    const locals = {
      timestamp: Math.round(Date.now() / 1000),
    };

    const ret = await sendTemplateEmail({
      test,
      to: email_address,
      name,
      template,
      locals,
      priority: queue ? -1 : 0,
    });
    res.json(ret);
  } catch (err) {
    L.error(err);
    res.json({ error: err.toString() });
  }
}
