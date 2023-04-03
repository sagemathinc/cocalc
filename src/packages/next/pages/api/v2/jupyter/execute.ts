/*
Evaluation of code using a Jupyter kernel as a service.

The INPUT parameters are:

- kernel: the name of the Jupyter kernel
- history: list of previous inputs as string (in order) that were sent to the kernel.
- input: a new input

The OUTPUT is:

- a list of messages that describe the output of the last code execution.

*/

import type { Request, Response } from "express";

import { execute } from "@cocalc/server/jupyter/execute";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { ensureAnalyticsCookie } from "@cocalc/server/analytics/cookie-fallback";

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
  const { input, kernel, history, tag, noCache } = getParams(req, {
    allowGet: true,
  });
  const account_id = await getAccountId(req);
  const analytics_cookie = ensureAnalyticsCookie(req, res);
  return {
    output: await execute({
      account_id,
      analytics_cookie,
      input,
      history,
      kernel,
      tag,
      noCache,
    }),
  };
}
