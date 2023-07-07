/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Request, Response } from "express";

import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import { sendTemplateEmail } from "@cocalc/server/email/smtp";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req: Request, res: Response) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw new Error("must be signed in");
  }
  if (!(await userIsInGroup(account_id, "admin"))) {
    throw new Error("only admins can test email");
  }

  const { email_address, name, test = false } = getParams(req);

  try {
    const ret = await sendTemplateEmail({
      test,
      to: email_address,
      name,
      channel: "welcome",
      locals: {
        var1: `timestamp: ${Date.now()}`,
        var2: `random: ${Math.random()}`,
      },
      subject: "Test Email",
    });
    console.log("ret", ret);
    res.json(ret);
  } catch (err) {
    res.json({ error: err.message });
  }
}
