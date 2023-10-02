/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Request, Response } from "express";

import { getLogger } from "@cocalc/backend/logger";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import { createReset } from "@cocalc/server/auth/password-reset";
import sendPasswordResetEmail from "@cocalc/server/email/password-reset";
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
    if (template === "password_reset") {
      const resetToken = await createReset(email_address, req.ip, 60 * 60 * 4);
      const ret = await sendPasswordResetEmail(email_address, resetToken);
      res.json(ret);
    } else {
      const ret = await sendTemplateEmail({
        test,
        to: email_address,
        name,
        template,
        locals: {
          timestamp: Math.round(Date.now() / 1000),
        },
        priority: queue ? -1 : 0,
      });

      res.json(ret);
    }
  } catch (err) {
    L.error(err);
    res.json({ error: err.toString() });
  }
}
