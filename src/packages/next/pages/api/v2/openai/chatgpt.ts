/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Request, Response } from "express";

import { evaluate } from "@cocalc/server/openai/chatgpt";
import { ensureAnalyticsCookie } from "@cocalc/server/analytics/cookie-fallback";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const result = await doIt(req, res);
    res.json({ ...result, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req: Request, res: Response) {
  const { input, system, history, model } = getParams(req);
  const account_id = await getAccountId(req);
  const analytics_cookie = ensureAnalyticsCookie(req, res);

  return {
    output: await evaluate({
      account_id,
      analytics_cookie,
      input,
      system,
      history,
      model,
    }),
  };
}
