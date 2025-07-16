// This is the new endpoint for querying any LLM
// Previously, this has been in openai/chatgpt

import type { Request, Response } from "express";

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { evaluate } from "@cocalc/server/llm/index";
import { ANALYTICS_COOKIE_NAME } from "@cocalc/util/consts";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req: Request, res: Response) {
  try {
    const result = await doIt(req);
    res.json({ ...result, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req: Request) {
  const { input, system, history, model, tag } = getParams(req);
  const account_id = await getAccountId(req);
  const { analytics_cookie: analytics_enabled } = await getServerSettings();
  const analytics_cookie = analytics_enabled
    ? req.cookies[ANALYTICS_COOKIE_NAME]
    : undefined;
  return {
    output: await evaluate({
      account_id,
      analytics_cookie,
      input,
      system,
      history,
      model,
      tag,
    }),
  };
}
